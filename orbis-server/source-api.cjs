const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { router: timeMachineRouter } = require("./time-machine-api.cjs");
const { requireAuthenticatedAdmin } = require("./admin-auth.cjs");
const {
  MAX_SOURCE_FILE_BYTES,
  hasBinarySignature,
  isAllowedDirectorySegments,
  isAllowedSourceSegments,
  parseRelativeSourcePath,
} = require("./source-access-policy.cjs");

const router = express.Router();
const repositoryRoot = fs.realpathSync(path.resolve(__dirname, ".."));

router.use(requireAuthenticatedAdmin);
router.use("/time-machine", timeMachineRouter);

router.get("/access", (_req, res) => {
  return res.json({
    success: true,
    role: "ADMIN",
  });
});

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

  if (
    content.length > MAX_SOURCE_FILE_BYTES ||
    content.includes(0) ||
    hasBinarySignature(content)
  ) {
    return null;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return null;
  }
}

function inspectAllowedFile(filePath, segments, stats) {
  if (!isAllowedSourceSegments(segments) || stats.isSymbolicLink()) return null;

  const canonicalPath = fs.realpathSync(filePath);

  if (!isStrictlyContained(canonicalPath)) return null;

  const content = readSafeTextFile(canonicalPath, stats);

  if (content === null) return null;

  return { canonicalPath, content };
}

function getDirectoryTreeEntry(fullPath, segments, stats) {
  if (!stats.isDirectory() || !isAllowedDirectorySegments(segments)) {
    return null;
  }

  const canonicalDirectory = fs.realpathSync(fullPath);

  if (!isStrictlyContained(canonicalDirectory)) return null;

  const children = getDirTreeSync(canonicalDirectory, segments);

  if (children.length === 0) return null;

  return {
    name: segments.at(-1),
    type: "directory",
    path: segments.join("/"),
    mtime: stats.mtimeMs,
    children,
  };
}

function getFileTreeEntry(fullPath, segments, stats) {
  if (!stats.isFile()) return null;

  const inspectedFile = inspectAllowedFile(fullPath, segments, stats);

  if (inspectedFile === null) return null;

  return {
    name: segments.at(-1),
    type: "file",
    path: segments.join("/"),
    mtime: stats.mtimeMs,
  };
}

function getTreeEntry(dirPath, relativeSegments, item) {
  const segments = [...relativeSegments, item.name];
  const fullPath = path.join(dirPath, item.name);
  const stats = fs.lstatSync(fullPath);

  if (stats.isSymbolicLink()) return null;

  return stats.isDirectory()
    ? getDirectoryTreeEntry(fullPath, segments, stats)
    : getFileTreeEntry(fullPath, segments, stats);
}

function getDirTreeSync(dirPath, relativeSegments = []) {
  const result = [];
  const items = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const item of items) {
    try {
      const entry = getTreeEntry(dirPath, relativeSegments, item);
      if (entry) result.push(entry);
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

  if (segments === null || !isAllowedSourceSegments(segments)) {
    return res.status(404).json({
      success: false,
      message: "Source file unavailable",
    });
  }

  try {
    if (!hasNoSymbolicLinkSegments(segments)) {
      return res.status(404).json({
        success: false,
        message: "Source file unavailable",
      });
    }

    const resolvedPath = path.join(repositoryRoot, ...segments);
    const stats = fs.lstatSync(resolvedPath);
    const inspectedFile = inspectAllowedFile(resolvedPath, segments, stats);

    if (inspectedFile === null) {
      return res.status(404).json({
        success: false,
        message: "Source file unavailable",
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
        message: "Source file unavailable",
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

      if (
        typeof crashData.file !== "string" ||
        !isAllowedSourceSegments(
          parseRelativeSourcePath(crashData.file) || [],
        ) ||
        !Number.isSafeInteger(crashData.line) ||
        crashData.line < 1
      ) {
        return res.json({
          success: true,
          hasError: false,
          file: null,
          errorLine: null,
        });
      }

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
      file: null,
      errorLine: null,
    });
  }
});

module.exports = router;
