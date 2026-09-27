const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  isAllowedSourcePath,
  isStrictlyContainedPath,
  parseRelativeSourcePath,
} = require("../../source-access-policy.cjs");

const CAPABILITY_REPOSITORY_VERIFY =
  "termux.repository.verify";

const MAX_VERIFY_TARGETS = 8;
const VERIFY_TIMEOUT_MS = 120_000;
const VERIFY_MAX_BUFFER_BYTES = 512 * 1024;

const ERR_DISABLED = "REPOSITORY_VERIFY_DISABLED";
const ERR_INPUT_INVALID = "REPOSITORY_VERIFY_INPUT_INVALID";
const ERR_PATH_NOT_ALLOWED =
  "REPOSITORY_VERIFY_PATH_NOT_ALLOWED";
const ERR_TARGET_UNAVAILABLE =
  "REPOSITORY_VERIFY_TARGET_UNAVAILABLE";
const ERR_RUNNER_UNAVAILABLE =
  "REPOSITORY_VERIFY_RUNNER_UNAVAILABLE";
const ERR_EXECUTION_FAILED =
  "REPOSITORY_VERIFY_EXECUTION_FAILED";

const TEST_FILE_PATTERN =
  /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/u;

const VERIFY_TARGET_ROOTS = new Set([
  "orbis-server",
  "src",
]);

const VERIFY_ROOT_FILES = Object.freeze([
  "package.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "tsconfig.brain-runtime.json",
]);

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  __dirname,
  "../../..",
);

function verifyError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function flagEnabled(name) {
  return (
    typeof process.env[name] === "string" &&
    process.env[name].trim().toLowerCase() === "true"
  );
}

function isRepositoryVerifyEnabled() {
  return (
    flagEnabled("SOURCE_EXPLORER_ENABLED") &&
    flagEnabled("SOURCE_VERIFY_ENABLED")
  );
}

function safeTargetPath(value) {
  if (
    typeof value !== "string" ||
    !TEST_FILE_PATTERN.test(value) ||
    !isAllowedSourcePath(value)
  ) {
    return null;
  }

  const segments = parseRelativeSourcePath(value);

  if (
    segments === null ||
    !VERIFY_TARGET_ROOTS.has(segments[0])
  ) {
    return null;
  }

  return segments;
}

function isolatedChildEnvironment(sandboxRoot) {
  return {
    PATH: process.env.PATH || "",
    HOME: sandboxRoot,
    TMPDIR: sandboxRoot,
    XDG_CACHE_HOME: path.join(
      sandboxRoot,
      "xdg-cache",
    ),
    NODE_ENV: "test",
    CI: "1",
    NO_COLOR: "1",
    ORBIS_VERIFY_WORKER_SANDBOX: "1",
    DATABASE_URL:
      "postgresql://orbis:orbis@127.0.0.1:1/orbis",
  };
}

function writeSandboxFiles(
  sandboxRoot,
  repositoryRoot,
  targets,
  workerExecArgv,
  viteFsAllow,
) {
  const guardPath = path.join(
    sandboxRoot,
    "worker-guard.cjs",
  );

  const configPath = path.join(
    sandboxRoot,
    "vitest.controlled.mjs",
  );

  const publicDir = path.join(
    sandboxRoot,
    "public",
  );

  fs.mkdirSync(publicDir, {
    recursive: true,
    mode: 0o700,
  });

  fs.writeFileSync(
    guardPath,
    `"use strict";

const path = require("node:path");
const repositoryRoot = ${JSON.stringify(repositoryRoot)};

if (!process.permission) {
  throw new Error(
    "REPOSITORY_VERIFY_WORKER_PERMISSION_MODEL_REQUIRED",
  );
}

if (process.permission.has("child")) {
  throw new Error(
    "REPOSITORY_VERIFY_WORKER_CHILD_PERMISSION_FORBIDDEN",
  );
}

if (process.permission.has("worker")) {
  throw new Error(
    "REPOSITORY_VERIFY_WORKER_THREAD_PERMISSION_FORBIDDEN",
  );
}

if (
  process.permission.has(
    "fs.read",
    path.join(repositoryRoot, ".env"),
  )
) {
  throw new Error(
    "REPOSITORY_VERIFY_WORKER_SECRET_READ_FORBIDDEN",
  );
}

if (
  process.permission.has(
    "fs.write",
    repositoryRoot,
  )
) {
  throw new Error(
    "REPOSITORY_VERIFY_WORKER_REPO_WRITE_FORBIDDEN",
  );
}

for (const key of Object.keys(process.env)) {
  if (
    /(?:TOKEN|SECRET|PASSWORD|API_KEY|SUPABASE|SONAR|HF_)/i.test(
      key,
    )
  ) {
    delete process.env[key];
  }
}

process.env.DATABASE_URL =
  "postgresql://orbis:orbis@127.0.0.1:1/orbis";
`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );

  fs.writeFileSync(
    configPath,
    `export default {
  root: ${JSON.stringify(repositoryRoot)},
  cacheDir: ${JSON.stringify(
    path.join(sandboxRoot, "vite-cache"),
  )},
  envDir: false,
  publicDir: ${JSON.stringify(publicDir)},
  server: {
    host: "127.0.0.1",
    hmr: false,
    fs: {
      strict: true,
      allow: ${JSON.stringify(viteFsAllow)},
    },
  },
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    include: ${JSON.stringify(targets)},
    watch: false,
    execArgv: ${JSON.stringify(workerExecArgv)},
    maxWorkers: 2,
    fileParallelism: false,
    sequence: {
      setupFiles: "list",
    },
    setupFiles: [
      ${JSON.stringify(guardPath)},
    ],
  },
};
`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );

  return {
    guardPath,
    configPath,
  };
}

class RepositoryVerificationTool {
  constructor({
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    enabled = isRepositoryVerifyEnabled,
    runner = spawnSync,
  } = {}) {
    this.repositoryRoot = path.resolve(repositoryRoot);
    this.enabled = enabled;
    this.runner = runner;
  }

  assertEnabled() {
    if (!this.enabled()) {
      throw verifyError(ERR_DISABLED);
    }
  }

  resolveTarget(relativePath) {
    const segments = safeTargetPath(relativePath);

    if (segments === null) {
      throw verifyError(ERR_PATH_NOT_ALLOWED);
    }

    let current = this.repositoryRoot;

    try {
      for (const segment of segments) {
        current = path.join(current, segment);

        if (fs.lstatSync(current).isSymbolicLink()) {
          throw verifyError(ERR_TARGET_UNAVAILABLE);
        }
      }

      const canonicalPath = fs.realpathSync(current);

      if (
        !isStrictlyContainedPath(
          this.repositoryRoot,
          canonicalPath,
        )
      ) {
        throw verifyError(ERR_TARGET_UNAVAILABLE);
      }

      if (!fs.statSync(canonicalPath).isFile()) {
        throw verifyError(ERR_TARGET_UNAVAILABLE);
      }

      return segments.join("/");
    } catch (error) {
      if (
        typeof error?.code === "string" &&
        error.code.startsWith("REPOSITORY_VERIFY_")
      ) {
        throw error;
      }

      throw verifyError(ERR_TARGET_UNAVAILABLE);
    }
  }

  validateTargets(targets) {
    if (
      !Array.isArray(targets) ||
      targets.length < 1 ||
      targets.length > MAX_VERIFY_TARGETS
    ) {
      throw verifyError(ERR_INPUT_INVALID);
    }

    const resolved = targets.map((target) =>
      this.resolveTarget(target),
    );

    if (new Set(resolved).size !== resolved.length) {
      throw verifyError(ERR_INPUT_INVALID);
    }

    return resolved;
  }

  vitestEntryPath() {
    const packageRoot = path.join(
      this.repositoryRoot,
      "node_modules",
      "vitest",
    );

    const candidate = path.join(
      packageRoot,
      "vitest.mjs",
    );

    try {
      const canonicalPackage =
        fs.realpathSync(packageRoot);

      const canonicalEntry =
        fs.realpathSync(candidate);

      if (
        !isStrictlyContainedPath(
          canonicalPackage,
          canonicalEntry,
        ) ||
        !fs.statSync(canonicalEntry).isFile()
      ) {
        throw verifyError(ERR_RUNNER_UNAVAILABLE);
      }

      return canonicalEntry;
    } catch (error) {
      if (error?.code === ERR_RUNNER_UNAVAILABLE) {
        throw error;
      }

      throw verifyError(ERR_RUNNER_UNAVAILABLE);
    }
  }

  workspaceProbePaths() {
    const probeNames = [
      "pnpm-workspace.yaml",
      "lerna.json",
      "package.json",
    ];

    const probes = [];
    let current = this.repositoryRoot;

    while (true) {
      for (const name of probeNames) {
        probes.push(path.join(current, name));
      }

      const parent = path.dirname(current);

      if (parent === current) {
        break;
      }

      current = parent;
    }

    return probes;
  }

  readablePaths(sandboxRoot) {
    const candidates = [
      path.join(this.repositoryRoot, "src"),
      path.join(this.repositoryRoot, "orbis-server"),
      path.join(this.repositoryRoot, "prisma"),
      path.join(this.repositoryRoot, "node_modules"),
      sandboxRoot,
      ...VERIFY_ROOT_FILES.map((name) =>
        path.join(this.repositoryRoot, name),
      ),
    ];

    const existingPaths = candidates.filter((candidate) =>
      fs.existsSync(candidate),
    );

    return [
      ...new Set([
        ...existingPaths,
        ...this.workspaceProbePaths(),
      ]),
    ];
  }

  workerPermissionArguments(sandboxRoot) {
    const args = [
      "--permission",
    ];

    for (const allowedPath of this.readablePaths(
      sandboxRoot,
    )) {
      args.push(
        `--allow-fs-read=${allowedPath}`,
      );
    }

    args.push(
      `--allow-fs-write=${sandboxRoot}`,
    );

    return args;
  }

  run(input = {}) {
    this.assertEnabled();

    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input)
    ) {
      throw verifyError(ERR_INPUT_INVALID);
    }

    const targets = this.validateTargets(input.targets);
    const vitestEntry = this.vitestEntryPath();

    const sandboxRoot = fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "orbis-targeted-verify-",
      ),
    );

    const startedAt = Date.now();

    try {
      const workerExecArgv =
        this.workerPermissionArguments(
          sandboxRoot,
        );

      const viteFsAllow =
        this.readablePaths(sandboxRoot).filter(
          (candidate) => fs.existsSync(candidate),
        );

      const { configPath } =
        writeSandboxFiles(
          sandboxRoot,
          this.repositoryRoot,
          targets,
          workerExecArgv,
          viteFsAllow,
        );

      const args = [
        vitestEntry,
        "run",
        ...targets,
        "--config",
        configPath,
        "--pool=forks",
        "--maxWorkers=2",
        "--no-file-parallelism",
      ];

      const result = this.runner(
        process.execPath,
        args,
        {
          cwd: this.repositoryRoot,
          shell: false,
          encoding: "utf8",
          timeout: VERIFY_TIMEOUT_MS,
          maxBuffer: VERIFY_MAX_BUFFER_BYTES,
          env: isolatedChildEnvironment(
            sandboxRoot,
          ),
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      const durationMs = Math.max(
        0,
        Date.now() - startedAt,
      );

      if (result?.error) {
        throw verifyError(ERR_EXECUTION_FAILED);
      }

      const exitCode =
        Number.isInteger(result?.status)
          ? result.status
          : 1;

      return {
        passed: exitCode === 0,
        exitCode,
        targetCount: targets.length,
        targets,
        durationMs,
        runner: "vitest",
        sandboxed: true,
        sandboxBoundary: "vitest-worker",
        coordinatorPermissionModel: false,
        outputExposed: false,
      };
    } finally {
      fs.rmSync(
        sandboxRoot,
        {
          recursive: true,
          force: true,
        },
      );
    }
  }
}

module.exports = {
  CAPABILITY_REPOSITORY_VERIFY,
  ERR_DISABLED,
  ERR_EXECUTION_FAILED,
  ERR_INPUT_INVALID,
  ERR_PATH_NOT_ALLOWED,
  ERR_RUNNER_UNAVAILABLE,
  ERR_TARGET_UNAVAILABLE,
  MAX_VERIFY_TARGETS,
  RepositoryVerificationTool,
  isRepositoryVerifyEnabled,
  repositoryVerificationTool:
    new RepositoryVerificationTool(),
};
