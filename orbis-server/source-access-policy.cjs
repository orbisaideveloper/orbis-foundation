const path = require("node:path");

const MAX_SOURCE_FILE_BYTES = 1024 * 1024;

const ALLOWED_SOURCE_ROOTS = new Set([
  "docs",
  "orbis-server",
  "prisma",
  "scripts",
  "src",
]);

const ALLOWED_ROOT_FILES = new Set([
  "Dockerfile",
  "LICENSE",
  "Makefile",
  "Procfile",
  "README.md",
  "index.html",
  "package-lock.json",
  "package.json",
  "postcss.config.js",
  "prisma.config.ts",
  "render.yaml",
  "tailwind.config.js",
  "tsconfig.brain-runtime.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "vitest.config.ts",
]);

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

const BINARY_SIGNATURES = [
  Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.from("GIF87a", "ascii"),
  Buffer.from("GIF89a", "ascii"),
  Buffer.from("%PDF-", "ascii"),
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x00, 0x61, 0x73, 0x6d]),
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
];

const RESTRICTED_SEGMENT_WORDS = new Set([
  "audit",
  "audits",
  "backup",
  "backups",
  "build",
  "copy",
  "coverage",
  "credential",
  "credentials",
  "database",
  "databases",
  "dist",
  "generated",
  "key",
  "keys",
  "log",
  "logs",
  "old",
  "passwd",
  "password",
  "passwords",
  "privatekey",
  "report",
  "reports",
  "secret",
  "secrets",
  "snapshot",
  "snapshots",
  "temp",
  "temporary",
  "tmp",
  "token",
  "tokens",
]);

const TEXT_BINARY_SIGNATURES = Object.freeze([
  `${String.fromCodePoint(0x89)}PNG`,
  "\uFFFDPNG",
  "GIF87a",
  "GIF89a",
  "%PDF-",
  `PK${String.fromCodePoint(0x03, 0x04)}`,
  `${String.fromCodePoint(0x7f)}ELF`,
]);

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

  if (/%[0-9a-f]{2}/i.test(decoded) || decoded.includes("\0")) return null;
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

  const segments = decoded.replaceAll("\\", "/").split("/");
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

function isRestrictedSegment(segment) {
  if (segment.startsWith(".")) return true;

  const normalizedSegment = segment.toLowerCase();
  return (
    hasRestrictedNodeModulesSegment(normalizedSegment) ||
    normalizedSegment
      .split(/[-_.]/)
      .some((part) => RESTRICTED_SEGMENT_WORDS.has(part))
  );
}

function hasRestrictedNodeModulesSegment(segment) {
  const parts = segment.split("node_modules");
  return parts.slice(0, -1).some((before, index) => {
    const after = parts[index + 1];
    return isSegmentBoundary(before.at(-1)) && isSegmentBoundary(after.at(0));
  });
}

function isSegmentBoundary(character) {
  return (
    character === undefined ||
    character === "-" ||
    character === "_" ||
    character === "."
  );
}

function isAllowedSourceFileName(name) {
  const normalizedName = name.toLowerCase();
  const extension = path.extname(normalizedName);
  if (
    name.endsWith("~") ||
    isRestrictedSegment(name) ||
    BLOCKED_FILE_EXTENSIONS.has(extension)
  ) {
    return false;
  }
  return (
    ALLOWED_SOURCE_EXTENSIONS.has(extension) ||
    ALLOWED_EXTENSIONLESS_FILES.has(normalizedName)
  );
}

function isAllowedSourceSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return false;
  if (segments.some(isRestrictedSegment)) return false;
  if (!isAllowedSourceFileName(segments.at(-1))) return false;

  if (segments.length === 1) return ALLOWED_ROOT_FILES.has(segments[0]);
  return ALLOWED_SOURCE_ROOTS.has(segments[0]);
}

function isAllowedDirectorySegments(segments) {
  return (
    Array.isArray(segments) &&
    segments.length > 0 &&
    ALLOWED_SOURCE_ROOTS.has(segments[0]) &&
    segments.every((segment) => !isRestrictedSegment(segment))
  );
}

function isAllowedSourcePath(value) {
  const segments = parseRelativeSourcePath(value);
  return segments !== null && isAllowedSourceSegments(segments);
}

function isSafeTextContent(content) {
  if (typeof content !== "string" || content.includes("\0")) return false;
  if (Buffer.byteLength(content, "utf8") > MAX_SOURCE_FILE_BYTES) return false;
  if (hasBinarySignature(content)) return false;
  return (
    new TextDecoder("utf-8", { fatal: true }).decode(
      new TextEncoder().encode(content),
    ) === content
  );
}

function hasBinarySignature(content) {
  if (typeof content === "string") {
    return TEXT_BINARY_SIGNATURES.some((signature) =>
      content.startsWith(signature),
    );
  }
  if (!Buffer.isBuffer(content)) return true;
  return BINARY_SIGNATURES.some(
    (signature) =>
      content.length >= signature.length &&
      content.subarray(0, signature.length).equals(signature),
  );
}

module.exports = {
  ALLOWED_ROOT_FILES,
  ALLOWED_SOURCE_ROOTS,
  MAX_SOURCE_FILE_BYTES,
  hasBinarySignature,
  isAllowedSourceFileName,
  isAllowedDirectorySegments,
  isAllowedSourcePath,
  isAllowedSourceSegments,
  isRestrictedSegment,
  isSafeTextContent,
  parseRelativeSourcePath,
};
