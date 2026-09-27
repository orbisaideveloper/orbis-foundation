const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  MAX_SOURCE_FILE_BYTES,
  hasBinarySignature,
  isAllowedSourceSegments,
  isSafeTextContent,
  isStrictlyContainedPath,
  parseRelativeSourcePath,
} = require("../../source-access-policy.cjs");

const CAPABILITY_REPOSITORY_PATCH = "termux.repository.patch";

const MAX_PATCH_EDITS = 8;
const MAX_PATCH_FRAGMENT_BYTES = 128 * 1024;

const ERR_DISABLED = "REPOSITORY_PATCH_DISABLED";
const ERR_INPUT_INVALID = "REPOSITORY_PATCH_INPUT_INVALID";
const ERR_PATH_NOT_ALLOWED = "REPOSITORY_PATCH_PATH_NOT_ALLOWED";
const ERR_FILE_UNAVAILABLE = "REPOSITORY_PATCH_FILE_UNAVAILABLE";
const ERR_CONFLICT = "REPOSITORY_PATCH_CONFLICT";
const ERR_AMBIGUOUS = "REPOSITORY_PATCH_AMBIGUOUS";
const ERR_WRITE_FAILED = "REPOSITORY_PATCH_WRITE_FAILED";

const DEFAULT_REPOSITORY_ROOT = fs.realpathSync(
  path.resolve(__dirname, "../../.."),
);

function flagEnabled(name) {
  return (
    typeof process.env[name] === "string" &&
    process.env[name].trim().toLowerCase() === "true"
  );
}

function isRepositoryPatchEnabled() {
  return (
    flagEnabled("SOURCE_EXPLORER_ENABLED") &&
    flagEnabled("SOURCE_PATCH_ENABLED")
  );
}

function patchError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeFragment(value, allowEmpty) {
  if (typeof value !== "string") return false;
  if (!allowEmpty && value.length === 0) return false;
  if (value.includes("\0")) return false;

  return (
    Buffer.byteLength(value, "utf8") <=
    MAX_PATCH_FRAGMENT_BYTES
  );
}

function decodeSafeText(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length > MAX_SOURCE_FILE_BYTES ||
    buffer.includes(0) ||
    hasBinarySignature(buffer)
  ) {
    throw patchError(ERR_FILE_UNAVAILABLE);
  }

  try {
    return new TextDecoder("utf-8", {
      fatal: true,
    }).decode(buffer);
  } catch {
    throw patchError(ERR_FILE_UNAVAILABLE);
  }
}

function sha256(content) {
  return crypto
    .createHash("sha256")
    .update(content, "utf8")
    .digest("hex");
}

function validateEdits(edits) {
  if (
    !Array.isArray(edits) ||
    edits.length < 1 ||
    edits.length > MAX_PATCH_EDITS
  ) {
    throw patchError(ERR_INPUT_INVALID);
  }

  return edits.map((edit) => {
    if (
      !edit ||
      typeof edit !== "object" ||
      Array.isArray(edit) ||
      !safeFragment(edit.oldText, false) ||
      !safeFragment(edit.newText, true) ||
      edit.oldText === edit.newText
    ) {
      throw patchError(ERR_INPUT_INVALID);
    }

    return {
      oldText: edit.oldText,
      newText: edit.newText,
    };
  });
}

class RepositoryPatchTool {
  constructor({
    repositoryRoot = DEFAULT_REPOSITORY_ROOT,
    enabled = isRepositoryPatchEnabled,
    backupRoot,
  } = {}) {
    this.repositoryRoot = fs.realpathSync(repositoryRoot);
    this.enabled = enabled;
    this.backupRoot =
      backupRoot ||
      path.join(
        this.repositoryRoot,
        ".orbis-backups",
        "agent-patches",
      );
  }

  assertEnabled() {
    if (!this.enabled()) {
      throw patchError(ERR_DISABLED);
    }
  }

  resolveExistingSource(relativePath) {
    const segments = parseRelativeSourcePath(relativePath);

    if (
      segments === null ||
      !isAllowedSourceSegments(segments)
    ) {
      throw patchError(ERR_PATH_NOT_ALLOWED);
    }

    let current = this.repositoryRoot;

    try {
      for (const segment of segments) {
        current = path.join(current, segment);

        if (fs.lstatSync(current).isSymbolicLink()) {
          throw patchError(ERR_FILE_UNAVAILABLE);
        }
      }

      const canonicalPath = fs.realpathSync(current);

      if (
        !isStrictlyContainedPath(
          this.repositoryRoot,
          canonicalPath,
        )
      ) {
        throw patchError(ERR_FILE_UNAVAILABLE);
      }

      const stats = fs.statSync(canonicalPath);

      if (
        !stats.isFile() ||
        stats.size > MAX_SOURCE_FILE_BYTES
      ) {
        throw patchError(ERR_FILE_UNAVAILABLE);
      }

      return {
        canonicalPath,
        relativePath: segments.join("/"),
        stats,
      };
    } catch (error) {
      if (
        typeof error?.code === "string" &&
        error.code.startsWith("REPOSITORY_PATCH_")
      ) {
        throw error;
      }

      throw patchError(ERR_FILE_UNAVAILABLE);
    }
  }

  readResolved(resolved) {
    try {
      const buffer = fs.readFileSync(
        resolved.canonicalPath,
      );

      return decodeSafeText(buffer);
    } catch (error) {
      if (
        typeof error?.code === "string" &&
        error.code.startsWith("REPOSITORY_PATCH_")
      ) {
        throw error;
      }

      throw patchError(ERR_FILE_UNAVAILABLE);
    }
  }

  applyEdits(content, edits) {
    let next = content;

    for (const edit of edits) {
      const firstIndex = next.indexOf(edit.oldText);

      if (firstIndex < 0) {
        throw patchError(ERR_CONFLICT);
      }

      if (
        next.indexOf(edit.oldText, firstIndex + 1) >= 0
      ) {
        throw patchError(ERR_AMBIGUOUS);
      }

      next =
        next.slice(0, firstIndex) +
        edit.newText +
        next.slice(firstIndex + edit.oldText.length);
    }

    if (next === content) {
      throw patchError(ERR_INPUT_INVALID);
    }

    if (!isSafeTextContent(next)) {
      throw patchError(ERR_INPUT_INVALID);
    }

    return next;
  }

  createRecoveryBackup(
    relativePath,
    originalContent,
    mode,
  ) {
    const checkpointId =
      `${Date.now()}-${crypto.randomUUID()}`;

    const backupPath = path.join(
      this.backupRoot,
      checkpointId,
      ...relativePath.split("/"),
    );

    fs.mkdirSync(path.dirname(backupPath), {
      recursive: true,
    });

    fs.writeFileSync(
      backupPath,
      originalContent,
      {
        encoding: "utf8",
        flag: "wx",
        mode: mode & 0o777,
      },
    );

    return true;
  }

  atomicReplace(
    resolved,
    originalContent,
    nextContent,
  ) {
    const temporaryPath = path.join(
      path.dirname(resolved.canonicalPath),
      `.${path.basename(
        resolved.canonicalPath,
      )}.orbis-patch-${process.pid}-${crypto.randomUUID()}`,
    );

    let temporaryFd = null;

    try {
      const noFollow =
        typeof fs.constants.O_NOFOLLOW === "number"
          ? fs.constants.O_NOFOLLOW
          : 0;

      temporaryFd = fs.openSync(
        temporaryPath,
        fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_WRONLY |
          noFollow,
        resolved.stats.mode & 0o777,
      );

      fs.writeFileSync(
        temporaryFd,
        nextContent,
        "utf8",
      );
      fs.fsyncSync(temporaryFd);
      fs.closeSync(temporaryFd);
      temporaryFd = null;

      const currentContent =
        this.readResolved(resolved);

      if (currentContent !== originalContent) {
        throw patchError(ERR_CONFLICT);
      }

      const backupCreated =
        this.createRecoveryBackup(
          resolved.relativePath,
          originalContent,
          resolved.stats.mode,
        );

      fs.renameSync(
        temporaryPath,
        resolved.canonicalPath,
      );

      return backupCreated;
    } catch (error) {
      if (temporaryFd !== null) {
        try {
          fs.closeSync(temporaryFd);
        } catch {
          // Best-effort cleanup of a temporary descriptor only.
        }
      }

      try {
        if (fs.existsSync(temporaryPath)) {
          fs.unlinkSync(temporaryPath);
        }
      } catch {
        // Temporary patch files are not recovery backups.
      }

      if (
        typeof error?.code === "string" &&
        error.code.startsWith("REPOSITORY_PATCH_")
      ) {
        throw error;
      }

      throw patchError(ERR_WRITE_FAILED);
    }
  }

  applyPatch(input = {}) {
    this.assertEnabled();

    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      typeof input.path !== "string"
    ) {
      throw patchError(ERR_INPUT_INVALID);
    }

    const edits = validateEdits(input.edits);
    const resolved =
      this.resolveExistingSource(input.path);

    const originalContent =
      this.readResolved(resolved);

    const nextContent =
      this.applyEdits(originalContent, edits);

    const backupCreated =
      this.atomicReplace(
        resolved,
        originalContent,
        nextContent,
      );

    return {
      path: resolved.relativePath,
      editCount: edits.length,
      sizeBefore: Buffer.byteLength(
        originalContent,
        "utf8",
      ),
      sizeAfter: Buffer.byteLength(
        nextContent,
        "utf8",
      ),
      sha256Before: sha256(originalContent),
      sha256After: sha256(nextContent),
      backupCreated,
    };
  }
}

module.exports = {
  CAPABILITY_REPOSITORY_PATCH,
  ERR_AMBIGUOUS,
  ERR_CONFLICT,
  ERR_DISABLED,
  ERR_FILE_UNAVAILABLE,
  ERR_INPUT_INVALID,
  ERR_PATH_NOT_ALLOWED,
  ERR_WRITE_FAILED,
  MAX_PATCH_EDITS,
  MAX_PATCH_FRAGMENT_BYTES,
  RepositoryPatchTool,
  isRepositoryPatchEnabled,
  repositoryPatchTool: new RepositoryPatchTool(),
};
