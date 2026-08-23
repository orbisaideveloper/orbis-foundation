const express = require("express");
const { Pool } = require("pg");
const crypto = require("node:crypto");
const {
  isAllowedSourceSegments,
  isSafeTextContent,
  parseRelativeSourcePath,
} = require("./source-access-policy.cjs");

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function ensureSchema() {
  try {
    await pool.query(`
      ALTER TABLE "FoundationTimeMachine"
      ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'SUCCESS',
      ADD COLUMN IF NOT EXISTS "errorMessage" TEXT DEFAULT '';
    `);
  } catch (e) {
    console.error("[TimeMachine] Schema check failed");
  }
}

void ensureSchema();

async function saveToTimeMachine(
  filePath,
  content,
  commitId,
  status,
  errorMessage,
) {
  const segments = parseRelativeSourcePath(filePath);
  if (
    segments === null ||
    !isAllowedSourceSegments(segments) ||
    !isSafeTextContent(content)
  ) {
    return false;
  }

  try {
    const id = crypto.randomUUID();
    const cid = validIdentifier(commitId) ? commitId : crypto.randomUUID();
    const buildStatus = status === "FAILED" ? "FAILED" : "SUCCESS";
    const buildErr =
      buildStatus === "FAILED" && errorMessage ? "Build failed" : "";
    const normalizedFilePath = segments.join("/");

    await pool.query(
      'INSERT INTO "FoundationTimeMachine" (id, "commitId", "filePath", "content", "status", "errorMessage") VALUES ($1, $2, $3, $4, $5, $6)',
      [id, cid, normalizedFilePath, content, buildStatus, buildErr],
    );

    await pool.query(
      `
        DELETE FROM "FoundationTimeMachine"
        WHERE id IN (
          SELECT id
          FROM "FoundationTimeMachine"
          WHERE "filePath" = $1
          ORDER BY "createdAt" DESC
          OFFSET 100
        )
      `,
      [normalizedFilePath],
    );
    return true;
  } catch {
    console.error("[TimeMachine] Save failed");
    return false;
  }
}

function validIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    !value.includes("\0")
  );
}

function safePathSegments(value) {
  const segments = parseRelativeSourcePath(value);
  return segments !== null && isAllowedSourceSegments(segments)
    ? segments
    : null;
}

router.post("/sync", async (req, res) => {
  try {
    const { filePath, content, commitId, status, errorMessage } = req.body;

    const segments = safePathSegments(filePath);
    if (!segments || !isSafeTextContent(content)) {
      return res.status(400).json({
        success: false,
        message: "Valid source snapshot required",
      });
    }

    const saved = await saveToTimeMachine(
      segments.join("/"),
      content,
      commitId,
      status,
      errorMessage,
    );
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: "Unable to sync Time Machine record",
      });
    }

    return res.json({
      success: true,
      message: "TimeMachine record synced successfully",
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to sync Time Machine record",
    });
  }
});

router.get("/history", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT "commitId", "filePath", "createdAt", "status", "errorMessage" FROM "FoundationTimeMachine" ORDER BY "createdAt" DESC LIMIT 500',
    );

    const commitMap = {};

    for (const row of rows || []) {
      const segments = safePathSegments(row.filePath);
      if (!segments) continue;

      const cid = row.commitId || "legacy-commit";

      if (!commitMap[cid]) {
        commitMap[cid] = {
          commitId: cid,
          createdAt: row.createdAt,
          status: row.status || "SUCCESS",
          errorMessage: row.status === "FAILED" ? "Build failed" : "",
          files: [],
        };
      }

      if (
        !commitMap[cid].files.some(
          (file) => file.filePath === segments.join("/"),
        )
      ) {
        commitMap[cid].files.push({
          filePath: segments.join("/"),
        });
      }

      if (row.status === "FAILED") {
        commitMap[cid].status = "FAILED";
        commitMap[cid].errorMessage = "Build failed";
      }
    }

    return res.json({
      success: true,
      history: Object.values(commitMap),
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to load Time Machine history",
    });
  }
});

router.get("/version", async (req, res) => {
  try {
    const { commitId, filePath } = req.query;

    if (!validIdentifier(commitId) || typeof filePath !== "string") {
      return res.status(400).json({
        success: false,
        message: "commitId and filePath required",
      });
    }

    const segments = safePathSegments(filePath);
    if (!segments) {
      return res.status(404).json({
        success: false,
        message: "Version not found",
      });
    }

    const { rows } = await pool.query(
      'SELECT content, "createdAt", "status", "errorMessage" FROM "FoundationTimeMachine" WHERE "commitId" = $1 AND "filePath" = $2 LIMIT 1',
      [commitId, segments.join("/")],
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Version not found",
      });
    }

    if (!isSafeTextContent(rows[0].content)) {
      return res.status(404).json({
        success: false,
        message: "Version not found",
      });
    }

    return res.json({
      success: true,
      data: {
        content: rows[0].content,
        createdAt: rows[0].createdAt,
        status: rows[0].status,
        errorMessage: rows[0].status === "FAILED" ? "Build failed" : "",
      },
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to load Time Machine version",
    });
  }
});

module.exports = {
  router,
  saveToTimeMachine,
};
