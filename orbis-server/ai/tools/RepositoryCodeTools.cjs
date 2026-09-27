const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const {
  ALLOWED_ROOT_FILES,
  ALLOWED_SOURCE_ROOTS,
  MAX_SOURCE_FILE_BYTES,
  hasBinarySignature,
  isAllowedDirectorySegments,
  isAllowedSourcePath,
  isAllowedSourceSegments,
  isStrictlyContainedPath,
  parseRelativeSourcePath,
} = require("../../source-access-policy.cjs");

const DEFAULT_REPOSITORY_ROOT = fs.realpathSync(
  path.resolve(__dirname, "../../.."),
);

const MAX_LIST_FILES = 1_000;
const MAX_INDEXED_FILES = 1_500;
const MAX_SEARCH_RESULTS = 50;
const MAX_SEARCH_QUERY_CHARS = 200;
const MAX_SEARCH_LINE_CHARS = 500;
const GIT_TIMEOUT_MS = 5_000;
const GIT_MAX_BUFFER_BYTES = 256 * 1024;

const ERR_DISABLED = "REPOSITORY_CODE_TOOLS_DISABLED";
const ERR_PATH_NOT_ALLOWED = "REPOSITORY_PATH_NOT_ALLOWED";
const ERR_FILE_UNAVAILABLE = "REPOSITORY_FILE_UNAVAILABLE";
const ERR_QUERY_INVALID = "REPOSITORY_QUERY_INVALID";
const ERR_GIT_UNAVAILABLE = "REPOSITORY_GIT_UNAVAILABLE";

const SAFE_GITHUB_WORKFLOW_PATH =
  /^\.github\/workflows\/[A-Za-z0-9_.-]+\.(?:yml|yaml)$/u;

const SAFE_PRISMA_MIGRATION_PATH =
  /^prisma\/migrations\/[A-Za-z0-9_-]+\/migration\.sql$/u;

function normalizedRepositoryPath(value) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.includes("\\0") ||
    value.includes("\\\\")
  ) {
    return null;
  }

  const candidate = value.trim();

  if (
    path.posix.isAbsolute(candidate) ||
    path.win32.isAbsolute(candidate)
  ) {
    return null;
  }

  const segments = candidate.split("/");

  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === "..",
    )
  ) {
    return null;
  }

  return candidate;
}

function isSpecialRepositoryInspectionPath(value) {
  const normalized = normalizedRepositoryPath(value);

  if (!normalized) return false;

  return (
    SAFE_GITHUB_WORKFLOW_PATH.test(normalized) ||
    SAFE_PRISMA_MIGRATION_PATH.test(normalized)
  );
}

function isRepositoryInspectionPathAllowed(value) {
  return (
    isAllowedSourcePath(value) ||
    isSpecialRepositoryInspectionPath(value)
  );
}

function repositoryToolError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function sourceExplorerEnabled() {
  return (
    typeof process.env.SOURCE_EXPLORER_ENABLED === "string" &&
    process.env.SOURCE_EXPLORER_ENABLED.trim().toLowerCase() === "true"
  );
}

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

function* safeDirectoryEntries(
  directoryPath,
  parentSegments,
) {
  let entries;

  try {
    entries = fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) =>
        left.name.localeCompare(right.name),
      );
  } catch {
    return;
  }

  for (const entry of entries) {
    const nextSegments = [
      ...parentSegments,
      entry.name,
    ];
    const fullPath = path.join(
      directoryPath,
      entry.name,
    );

    try {
      const stats = fs.lstatSync(fullPath);

      if (stats.isSymbolicLink()) continue;

      yield {
        nextSegments,
        fullPath,
        stats,
      };
    } catch {
      continue;
    }
  }
}

function defaultGitRunner(repositoryRoot, args) {
  return execFileSync(
    "git",
    ["--no-optional-locks", ...args],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
}

function normalizedGitPath(rawPath) {
  const renamedPath = rawPath.includes(" -> ")
    ? rawPath.split(" -> ").at(-1)
    : rawPath;

  const candidate = renamedPath.trim();

  if (!candidate.startsWith('"') || !candidate.endsWith('"')) {
    return candidate;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

class RepositoryCodeTools {
  constructor({
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    enabled = sourceExplorerEnabled,
    gitRunner = defaultGitRunner,
  } = {}) {
    this.repositoryRoot = fs.realpathSync(repositoryRoot);
    this.enabled = enabled;
    this.gitRunner = gitRunner;
  }

  assertEnabled() {
    if (!this.enabled()) {
      throw repositoryToolError(ERR_DISABLED);
    }
  }

  resolveSourceFile(relativePath) {
    const specialPath =
      isSpecialRepositoryInspectionPath(relativePath);

    const segments = specialPath
      ? normalizedRepositoryPath(relativePath).split("/")
      : parseRelativeSourcePath(relativePath);

    if (
      segments === null ||
      (!specialPath && !isAllowedSourceSegments(segments))
    ) {
      throw repositoryToolError(ERR_PATH_NOT_ALLOWED);
    }

    let currentPath = this.repositoryRoot;

    try {
      for (const segment of segments) {
        currentPath = path.join(currentPath, segment);

        if (fs.lstatSync(currentPath).isSymbolicLink()) {
          throw repositoryToolError(ERR_FILE_UNAVAILABLE);
        }
      }

      const canonicalPath = fs.realpathSync(currentPath);

      if (!isStrictlyContainedPath(this.repositoryRoot, canonicalPath)) {
        throw repositoryToolError(ERR_FILE_UNAVAILABLE);
      }

      const stats = fs.statSync(canonicalPath);

      if (
        !stats.isFile() ||
        stats.size > MAX_SOURCE_FILE_BYTES
      ) {
        throw repositoryToolError(ERR_FILE_UNAVAILABLE);
      }

      return {
        canonicalPath,
        relativePath: segments.join("/"),
      };
    } catch (error) {
      if (error?.code === ERR_FILE_UNAVAILABLE) throw error;
      throw repositoryToolError(ERR_FILE_UNAVAILABLE);
    }
  }

  readResolvedFile(resolvedFile) {
    try {
      const content = fs.readFileSync(resolvedFile.canonicalPath);

      if (
        content.length > MAX_SOURCE_FILE_BYTES ||
        content.includes(0) ||
        hasBinarySignature(content)
      ) {
        throw repositoryToolError(ERR_FILE_UNAVAILABLE);
      }

      const decoded = new TextDecoder(
        "utf-8",
        { fatal: true },
      ).decode(content);

      return {
        path: resolvedFile.relativePath,
        content: decoded,
        sizeBytes: content.length,
      };
    } catch (error) {
      if (error?.code === ERR_FILE_UNAVAILABLE) throw error;
      throw repositoryToolError(ERR_FILE_UNAVAILABLE);
    }
  }

  readFile(relativePath) {
    this.assertEnabled();

    return this.readResolvedFile(
      this.resolveSourceFile(relativePath),
    );
  }

  collectAllowedFiles(limit) {
    const files = [];
    const addFile = (segments) => {
      if (
        files.length < limit &&
        isAllowedSourceSegments(segments)
      ) {
        files.push(segments.join("/"));
      }
    };

    for (const rootFile of [...ALLOWED_ROOT_FILES].sort()) {
      const fullPath = path.join(this.repositoryRoot, rootFile);

      try {
        const stats = fs.lstatSync(fullPath);

        if (!stats.isSymbolicLink() && stats.isFile()) {
          addFile([rootFile]);
        }
      } catch {
        // Missing optional root files are ignored.
      }
    }

    const walk = (directoryPath, segments) => {
      if (files.length >= limit) return;

      for (const {
        nextSegments,
        fullPath,
        stats,
      } of safeDirectoryEntries(
        directoryPath,
        segments,
      )) {
        if (files.length >= limit) return;

        if (
          stats.isDirectory() &&
          isAllowedDirectorySegments(nextSegments)
        ) {
          walk(fullPath, nextSegments);
          continue;
        }

        if (stats.isFile()) {
          addFile(nextSegments);
        }
      }
    };

    for (const root of [...ALLOWED_SOURCE_ROOTS].sort()) {
      if (files.length >= limit) break;

      const rootPath = path.join(this.repositoryRoot, root);

      try {
        const stats = fs.lstatSync(rootPath);

        if (
          !stats.isSymbolicLink() &&
          stats.isDirectory() &&
          isAllowedDirectorySegments([root])
        ) {
          walk(rootPath, [root]);
        }
      } catch {
        // Missing optional roots are ignored.
      }
    }

    const addSpecialTree = (relativeRoot) => {
      if (files.length >= limit) return;

      const absoluteRoot = path.join(
        this.repositoryRoot,
        ...relativeRoot.split("/"),
      );

      const walkSpecial = (directoryPath, relativeSegments) => {
        if (files.length >= limit) return;

        for (const {
          nextSegments,
          fullPath,
          stats,
        } of safeDirectoryEntries(
          directoryPath,
          relativeSegments,
        )) {
          if (files.length >= limit) return;

          const relativePath =
            nextSegments.join("/");

          if (stats.isDirectory()) {
            walkSpecial(fullPath, nextSegments);
            continue;
          }

          if (
            stats.isFile() &&
            isSpecialRepositoryInspectionPath(relativePath)
          ) {
            files.push(relativePath);
          }
        }
      };

      walkSpecial(
        absoluteRoot,
        relativeRoot.split("/"),
      );
    };

    addSpecialTree(".github/workflows");
    addSpecialTree("prisma/migrations");

    return [...new Set(files)].slice(0, limit);
  }

  listFiles({ limit } = {}) {
    this.assertEnabled();

    const boundedLimit = boundedInteger(
      limit,
      MAX_LIST_FILES,
      MAX_LIST_FILES,
    );

    return {
      files: this.collectAllowedFiles(boundedLimit),
      limit: boundedLimit,
    };
  }

  search(query, { limit } = {}) {
    this.assertEnabled();

    if (
      typeof query !== "string" ||
      query.trim() === "" ||
      query.includes("\0") ||
      query.length > MAX_SEARCH_QUERY_CHARS
    ) {
      throw repositoryToolError(ERR_QUERY_INVALID);
    }

    const needle = query.toLowerCase();
    const resultLimit = boundedInteger(
      limit,
      20,
      MAX_SEARCH_RESULTS,
    );

    const files = this.collectAllowedFiles(MAX_INDEXED_FILES);
    const matches = [];

    for (const relativePath of files) {
      if (matches.length >= resultLimit) break;

      let sourceFile;

      try {
        sourceFile = this.readResolvedFile(
          this.resolveSourceFile(relativePath),
        );
      } catch {
        continue;
      }

      const lines = sourceFile.content.split(/\r?\n/);

      for (let index = 0; index < lines.length; index += 1) {
        if (matches.length >= resultLimit) break;

        if (lines[index].toLowerCase().includes(needle)) {
          matches.push({
            path: relativePath,
            line: index + 1,
            text: lines[index].slice(0, MAX_SEARCH_LINE_CHARS),
          });
        }
      }
    }

    return {
      query,
      matches,
      truncated: matches.length >= resultLimit,
      indexedFileCount: files.length,
    };
  }

  runGit(args) {
    try {
      return String(
        this.gitRunner(this.repositoryRoot, args),
      ).trimEnd();
    } catch {
      throw repositoryToolError(ERR_GIT_UNAVAILABLE);
    }
  }

  getGitState() {
    this.assertEnabled();

    const reportedRoot = this.runGit(
      ["rev-parse", "--show-toplevel"],
    ).trim();

    let canonicalGitRoot;

    try {
      canonicalGitRoot = fs.realpathSync(reportedRoot);
    } catch {
      throw repositoryToolError(ERR_GIT_UNAVAILABLE);
    }

    if (canonicalGitRoot !== this.repositoryRoot) {
      throw repositoryToolError(ERR_GIT_UNAVAILABLE);
    }

    const branch =
      this.runGit(["branch", "--show-current"]).trim() || null;

    const head = this.runGit(["rev-parse", "HEAD"]).trim();

    const statusOutput = this.runGit([
      "status",
      "--porcelain=v1",
      "--untracked-files=normal",
    ]);

    const rawChanges = statusOutput
      .split(/\r?\n/)
      .filter(Boolean);

    const changes = [];
    let hiddenChangeCount = 0;

    for (const line of rawChanges) {
      const status = line.slice(0, 2);
      const candidate = normalizedGitPath(line.slice(3));

      if (
        candidate &&
        isRepositoryInspectionPathAllowed(candidate)
      ) {
        changes.push({ status, path: candidate });
      } else {
        hiddenChangeCount += 1;
      }
    }

    return {
      branch,
      head,
      dirty: rawChanges.length > 0,
      changes,
      hiddenChangeCount,
    };
  }
}

module.exports = {
  ERR_DISABLED,
  ERR_FILE_UNAVAILABLE,
  ERR_GIT_UNAVAILABLE,
  ERR_PATH_NOT_ALLOWED,
  ERR_QUERY_INVALID,
  MAX_INDEXED_FILES,
  MAX_LIST_FILES,
  MAX_SEARCH_RESULTS,
  RepositoryCodeTools,
  isRepositoryInspectionPathAllowed,
  isSpecialRepositoryInspectionPath,
  repositoryCodeTools: new RepositoryCodeTools(),
};
