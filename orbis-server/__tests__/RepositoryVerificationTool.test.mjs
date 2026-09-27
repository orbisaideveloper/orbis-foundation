// @vitest-environment node

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  ERR_DISABLED,
  ERR_INPUT_INVALID,
  ERR_PATH_NOT_ALLOWED,
  RepositoryVerificationTool,
} = require("../ai/tools/RepositoryVerificationTool.cjs");

const roots = new Set();
const TEST_PATH = "src/example.test.ts";

function fixtureRoot() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "orbis-verify-tool-"),
  );

  roots.add(root);

  fs.mkdirSync(
    path.join(root, "src"),
    { recursive: true },
  );

  fs.mkdirSync(
    path.join(root, "orbis-server"),
    { recursive: true },
  );

  fs.mkdirSync(
    path.join(root, "node_modules", "vitest"),
    { recursive: true },
  );

  fs.writeFileSync(
    path.join(root, TEST_PATH),
    "test('ok', () => {});\n",
    "utf8",
  );

  fs.writeFileSync(
    path.join(
      root,
      "node_modules",
      "vitest",
      "vitest.mjs",
    ),
    "export {};\n",
    "utf8",
  );

  fs.writeFileSync(
    path.join(root, "package.json"),
    '{"name":"fixture"}\n',
    "utf8",
  );

  return root;
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const root of roots) {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  }

  roots.clear();
});

describe("Phase 5B RepositoryVerificationTool", () => {
  it("fails closed unless targeted verification is explicitly enabled", () => {
    const root = fixtureRoot();

    const tool = new RepositoryVerificationTool({
      repositoryRoot: root,
      enabled: () => false,
    });

    expect(() =>
      tool.run({
        targets: [TEST_PATH],
      }),
    ).toThrow(
      expect.objectContaining({
        code: ERR_DISABLED,
      }),
    );
  });

  it("keeps Vite coordinator outside the permission model and constrains Vitest workers", () => {
    const root = fixtureRoot();

    const runner = vi.fn().mockImplementation(
      (executable, args, options) => {
        expect(executable).toBe(process.execPath);
        expect(options.shell).toBe(false);

        expect(args).not.toContain("--permission");
        expect(args).not.toContain(
          "--allow-child-process",
        );
        expect(args).not.toContain(
          "--allow-addons",
        );
        expect(args).not.toContain("--allow-net");
        expect(args).not.toContain(
          "--allow-worker",
        );

        expect(
          args.some(
            (arg) =>
              arg.endsWith(
                "/node_modules/vitest/vitest.mjs",
              ),
          ),
        ).toBe(true);

        expect(args).toContain("--pool=forks");
        expect(args).toContain("--maxWorkers=2");
        expect(args).toContain(
          "--no-file-parallelism",
        );

        expect(options.env.HOME).not.toBe(
          process.env.HOME,
        );

        expect(
          options.env.ORBIS_VERIFY_WORKER_SANDBOX,
        ).toBe("1");

        expect(options.env.DATABASE_URL).toContain(
          "127.0.0.1:1/orbis",
        );

        expect(options.env.HF_TOKEN).toBeUndefined();
        expect(
          options.env.SONAR_TOKEN,
        ).toBeUndefined();

        const configIndex =
          args.indexOf("--config");

        expect(configIndex).toBeGreaterThan(-1);

        const configPath =
          args[configIndex + 1];

        const config =
          fs.readFileSync(
            configPath,
            "utf8",
          );

        expect(config).toContain(
          'host: "127.0.0.1"',
        );

        expect(config).toContain(
          "hmr: false",
        );

        expect(config).toContain(
          "envDir: false",
        );

        expect(config).toContain(
          'pool: "forks"',
        );

        expect(config).toContain(
          'watch: false',
        );

        expect(config).toContain(
          JSON.stringify([TEST_PATH]),
        );

        expect(config).toContain(
          '"--permission"',
        );

        expect(config).not.toContain(
          '"--allow-child-process"',
        );

        expect(config).not.toContain(
          '"--allow-addons"',
        );

        expect(config).not.toContain(
          '"--allow-net"',
        );

        expect(config).not.toContain(
          '"--allow-worker"',
        );

        expect(config).toContain(
          `--allow-fs-read=${path.join(
            root,
            "src",
          )}`,
        );

        expect(config).toContain(
          "--allow-fs-write=",
        );

        const guard =
          fs.readFileSync(
            path.join(
              path.dirname(configPath),
              "worker-guard.cjs",
            ),
            "utf8",
          );

        expect(guard).toContain(
          "REPOSITORY_VERIFY_WORKER_PERMISSION_MODEL_REQUIRED",
        );

        expect(guard).toContain(
          'process.permission.has("child")',
        );

        return {
          status: 0,
          stdout: "hidden",
          stderr: "",
        };
      },
    );

    const tool = new RepositoryVerificationTool({
      repositoryRoot: root,
      enabled: () => true,
      runner,
    });

    const result = tool.run({
      targets: [TEST_PATH],
    });

    expect(result).toMatchObject({
      passed: true,
      exitCode: 0,
      targetCount: 1,
      targets: [TEST_PATH],
      runner: "vitest",
      sandboxed: true,
      sandboxBoundary: "vitest-worker",
      coordinatorPermissionModel: false,
      outputExposed: false,
    });
  });

  it("rejects non-test paths and traversal", () => {
    const root = fixtureRoot();

    const tool = new RepositoryVerificationTool({
      repositoryRoot: root,
      enabled: () => true,
      runner: vi.fn(),
    });

    for (const unsafe of [
      "src/example.ts",
      "../example.test.ts",
      ".env",
      "scripts/example.test.js",
    ]) {
      expect(() =>
        tool.run({
          targets: [unsafe],
        }),
      ).toThrow(
        expect.objectContaining({
          code: ERR_PATH_NOT_ALLOWED,
        }),
      );
    }
  });

  it("rejects duplicate targets", () => {
    const root = fixtureRoot();

    const tool = new RepositoryVerificationTool({
      repositoryRoot: root,
      enabled: () => true,
      runner: vi.fn(),
    });

    expect(() =>
      tool.run({
        targets: [
          TEST_PATH,
          TEST_PATH,
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        code: ERR_INPUT_INVALID,
      }),
    );
  });
});
