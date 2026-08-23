const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { router: timeMachineRouter } = require("./time-machine-api.cjs");

const router = express.Router();
const repositoryRoot = fs.realpathSync(path.resolve(__dirname, ".."));
const MAX_SOURCE_FILE_BYTES = 1024 * 1024;

const ALLOWED_SOURCE_EXTENSIONS = new Set([
  ".bash",
  ".cjs",
  ".css",
  ".htm",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".less",
  ".md",
  ".mdx",
  ".mjs",
  ".prisma",
  ".sass",
  ".scss",
  ".sh",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
  ".zsh",
]);

const ALLOWED_EXTENSIONLESS_FILES = new Set([
  "dockerfile",
  "license",
  "makefile",
  "procfile",
]);

const BLOCKED_DIRECTORY_NAMES = new Set([
  "audit",
  "audits",
  "build",
  "coverage",
  "dist",
  "log",
  "logs",
  "node_modules",
  "report",
  "reports",
  "snapshot",
  "snapshots",
  "temp",
  "temporary",
  "tmp",
]);

const BLOCKED_FILE_EXTENSIONS = new Set([
  ".bak",
  ".backup",
  ".cer",
  ".cert",
  ".crt",
  ".db",
  ".der",
  ".dmp",
  ".dump",
  ".jks",
  ".key",
  ".keystore",
  ".log",
  ".old",
  ".orig",
  ".p12",
  ".pem",
  ".pfx",
  ".sql",
  ".sqlite",
  ".sqlite3",
  ".swp",
  ".temp",
  ".tmp",
]);

const SENSITIVE_NAME_PATTERN =
  /(?:api[-_]?key|auth[-_]?token|credential|passwd|password|private[-_]?key|secret|token)/i;
const BACKUP_OR_TEMP_NAME_PATTERN =
  /(?:^|[-_.])(backup|backups|copy|old|temp|temporary|tmp)(?:[-_.]|$)/i;
const LOG_FILE_NAME_PATTERN = /(?:^|[-_.])logs?(?:[-_.]|$)/i;

router.use("/time-machine", timeMachineRouter);

function isSourceExplorerEnabled() {
  return (
    typeof process.env.SOURCE_EXPLORER_ENABLED === "string" &&
    process.env.SOURCE_EXPLORER_ENABLED.trim().toLowerCase() === "true"
  );
}

function requireSourceExplorer(req, res, next) {
  if (!isSourceExplorerEnabled()) {
    return res.status(403).json({
      success: false,
      message: "Source Explorer is disabled",
    });
  }

  return next();
}

function isStrictlyContained(candidatePath) {
  return candidatePath.startsWith(`${repositoryRoot}${path.sep}`);
}

function isBlockedDirectoryName(name) {
  const normalizedName = name.toLowerCase();

  return (
    name.startsWith(".") ||
    BLOCKED_DIRECTORY_NAMES.has(normalizedName) ||
    /(?:^|[-_])(audit|backup|backups|log|logs|report|reports|snapshot|snapshots|temp|temporary|tmp)(?:[-_]|$)/i.test(
      normalizedName,
    )
  );
}

function isAllowedSourceFileName(name) {
  const normalizedName = name.toLowerCase();
  const extension = path.extname(normalizedName);

  if (
    name.startsWith(".") ||
    name.endsWith("~") ||
    SENSITIVE_NAME_PATTERN.test(normalizedName) ||
    BACKUP_OR_TEMP_NAME_PATTERN.test(normalizedName) ||
    LOG_FILE_NAME_PATTERN.test(normalizedName) ||
    BLOCKED_FILE_EXTENSIONS.has(extension)
  ) {
    return false;
  }

  return (
    ALLOWED_SOURCE_EXTENSIONS.has(extension) ||
    ALLOWED_EXTENSIONLESS_FILES.has(normalizedName)
  );
}

function decodeRequestedPath(value) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.includes("\0")
  ) {
    return null;
  }

  let decoded = value;

  try {
    for (let pass = 0; pass < 5; pass += 1) {
      const next = decodeURIComponent(decoded);

      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return null;
  }

  if (/%[0-9a-f]{2}/i.test(decoded) || decoded.includes("\0")) {
    return null;
  }

  return decoded;
}

function parseRelativeSourcePath(value) {
  const decoded = decodeRequestedPath(value);

  if (
    decoded === null ||
    path.posix.isAbsolute(decoded) ||
    path.win32.isAbsolute(decoded)
  ) {
    return null;
  }

  const segments = decoded.replace(/\\/g, "/").split("/");

  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        segment.startsWith("."),
    )
  ) {
    return null;
  }

  return segments;
}

function hasSafePathSegments(segments) {
  return (
    segments.length > 0 &&
    segments
      .slice(0, -1)
      .every((segment) => !isBlockedDirectoryName(segment)) &&
    isAllowedSourceFileName(segments.at(-1))
  );
}

function hasNoSymbolicLinkSegments(segments) {
  let currentPath = repositoryRoot;

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    const stats = fs.lstatSync(currentPath);

    if (stats.isSymbolicLink()) return false;
  }

  return true;
}

function readSafeTextFile(filePath, stats) {
  if (!stats.isFile() || stats.size > MAX_SOURCE_FILE_BYTES || stats.size < 0) {
    return null;
  }

  const content = fs.readFileSync(filePath);

  if (content.length > MAX_SOURCE_FILE_BYTES || content.includes(0)) {
    return null;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return null;
  }
}

function inspectAllowedFile(filePath, segments, stats) {
  if (!hasSafePathSegments(segments) || stats.isSymbolicLink()) return null;

  const canonicalPath = fs.realpathSync(filePath);

  if (!isStrictlyContained(canonicalPath)) return null;

  const content = readSafeTextFile(canonicalPath, stats);

  if (content === null) return null;

  return { canonicalPath, content };
}

function getDirTreeSync(dirPath, relativeSegments = []) {
  const result = [];
  const items = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const item of items) {
    const segments = [...relativeSegments, item.name];
    const fullPath = path.join(dirPath, item.name);
    let stats;

    try {
      stats = fs.lstatSync(fullPath);

      if (stats.isSymbolicLink()) continue;

      if (stats.isDirectory()) {
        if (isBlockedDirectoryName(item.name)) continue;

        const canonicalDirectory = fs.realpathSync(fullPath);

        if (!isStrictlyContained(canonicalDirectory)) continue;

        const children = getDirTreeSync(canonicalDirectory, segments);

        if (children.length > 0) {
          result.push({
            name: item.name,
            type: "directory",
            path: segments.join("/"),
            mtime: stats.mtimeMs,
            children,
          });
        }

        continue;
      }

      if (!stats.isFile()) continue;

      const inspectedFile = inspectAllowedFile(fullPath, segments, stats);

      if (inspectedFile === null) continue;

      result.push({
        name: item.name,
        type: "file",
        path: segments.join("/"),
        mtime: stats.mtimeMs,
      });
    } catch {
      continue;
    }
  }

  return result;
}

router.get("/tree", requireSourceExplorer, (_req, res) => {
  try {
    const tree = getDirTreeSync(repositoryRoot);

    return res.json({
      success: true,
      tree,
    });
  } catch {
    console.error("[SourceExplorer] Tree scan failed");

    return res.status(500).json({
      success: false,
      message: "Unable to load source tree",
    });
  }
});

router.get("/file", requireSourceExplorer, (req, res) => {
  const requestedPath = req.query.path;

  if (typeof requestedPath !== "string" || requestedPath.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "File path is required",
    });
  }

  const segments = parseRelativeSourcePath(requestedPath);

  if (segments === null || !hasSafePathSegments(segments)) {
    return res.status(400).json({
      success: false,
      message: "Invalid file path",
    });
  }

  try {
    if (!hasNoSymbolicLinkSegments(segments)) {
      return res.status(403).json({
        success: false,
        message: "File access denied",
      });
    }

    const resolvedPath = path.join(repositoryRoot, ...segments);
    const stats = fs.lstatSync(resolvedPath);
    const inspectedFile = inspectAllowedFile(resolvedPath, segments, stats);

    if (inspectedFile === null) {
      return res.status(403).json({
        success: false,
        message: "File access denied",
      });
    }

    return res.json({
      success: true,
      content: inspectedFile.content,
    });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    console.error("[SourceExplorer] File read failed");

    return res.status(500).json({
      success: false,
      message: "Unable to read source file",
    });
  }
});

router.get("/status", (_req, res) => {
  try {
    const crashReportPath = path.join(__dirname, "..", "crash-report.json");

    if (fs.existsSync(crashReportPath)) {
      const crashData = JSON.parse(fs.readFileSync(crashReportPath, "utf8"));

      return res.json({
        success: true,
        hasError: true,
        file: crashData.file,
        errorLine: crashData.line,
      });
    }

    return res.json({
      success: true,
      hasError: false,
      file: null,
      errorLine: null,
    });
  } catch {
    return res.json({
      success: true,
      hasError: false,
    });
  }
});

module.exports = router;
