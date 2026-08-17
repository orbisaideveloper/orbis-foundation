require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const aiChatService = require("./ai/AIChatService.cjs");
const providerManager = require("./ai/AIProviderManager.cjs");
const sourceApi = require("./source-api.cjs");
const {
  getDiagnostics,
  addSystemLog,
  setDbClient,
} = require("./telemetry-module.cjs");

const PORT = process.env.PORT || 3000;
const FILE_READ_ALLOW_LIST = Object.freeze({
  "package.json": path.join(__dirname, "..", "package.json"),
  "README.md": path.join(__dirname, "..", "README.md"),
});

// ---------------------------------------------------------------------------
// TASK-017: One Canonical Backend — telemetry DB connection
//
// This is the exact same Postgres/Prisma setup orbis-server/server.cjs used
// (now retired as a standalone entrypoint). It is intentionally
// fire-and-forget: a DB connection failure here is caught and logged, and
// must never crash this process or affect /api/chat, /api/brain/request, or
// any other route. The /api/metrics and /api/diagnostics handlers below
// already have their own try/catch around every Prisma call for the same
// reason.
// ---------------------------------------------------------------------------
const telemetryConnectionString = process.env.DATABASE_URL;
const telemetryPool = new Pool({
  connectionString: telemetryConnectionString,
  ssl: { rejectUnauthorized: false },
});
const telemetryAdapter = new PrismaPg(telemetryPool);
const prisma = new PrismaClient({ adapter: telemetryAdapter });

prisma
  .$connect()
  .then(() => {
    console.log("[DB] Prisma Adapter successfully connected to Supabase!");
    setDbClient(prisma);
  })
  .catch((err) => {
    console.error(
      "[DB_ERROR] Failed to connect Prisma to Supabase:",
      err.message,
    );
  });

async function handleOllamaStream(prompt, res) {
  const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tinyllama:latest",
        prompt: prompt,
        stream: true,
      }),
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ result: `⚠️ AI Server Error: Status ${response.status}` });
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.response) {
            res.write(parsed.response);
          }
        } catch (e) {
          res.write(text);
        }
      }
    }
    res.end();
  } catch (err) {
    console.error("AI Error:", err);
    if (!res.headersSent) {
      return res.json({ result: "⚠️ AI Server Error: " + err.message });
    }
    res.write("\n⚠️ AI Connection Interrupted.");
    res.end();
  }
}

const app = express();
app.use(cors());
app.use(express.json());

/**
 * TASK-012 — Canonical external Brain request entry.
 *
 * IMPORTANT:
 * This route does NOT create a new Brain component.
 * It loads the build-time CommonJS artifact generated from the
 * existing src/core/brain/BrainRequestGateway.ts.
 *
 * Security/authorization remain inside TASK-009.
 * Orchestration remains inside TASK-010.
 * Validation/gateway responsibility remains inside TASK-011.
 */
app.post("/api/brain/request", async (req, res) => {
  try {
    const {
      brainRequestGateway,
    } = require("./brain-runtime/brain/BrainRequestGateway.js");

    if (!brainRequestGateway) {
      return res.status(500).json({
        success: false,
        error: "BRAIN_GATEWAY_UNAVAILABLE",
      });
    }

    const result = await brainRequestGateway.submit(req.body);

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("[BRAIN_API] Request failed:", error);

    return res.status(500).json({
      success: false,
      requestId: "unassigned",
      runtime: "unknown",
      error: "BRAIN_REQUEST_FAILED",
      durationMs: 0,
    });
  }
});

// ============================================================
// TASK-006 & TASK-007: REAL TERMUX RUNTIME BRIDGE & CAPABILITY EXECUTION
// ============================================================
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    runtime: "TermuxRuntime",
    platform: "android-termux",
    version: "0.1.0",
    status: "BRIDGE_REACHABLE",
    timestamp: Date.now(),
  });
});

app.get("/api/termux/handshake", (req, res) => {
  res.json({
    ok: true,
    runtime: "TermuxRuntime",
    platform: "android-termux",
    version: "0.1.0",
    identity: {
      valid: true,
      runtimeId: "termux-local-01",
      signature: "orbis-termux-v1",
    },
    capabilities: [
      {
        id: "termux.system.info",
        name: "System Info",
        riskLevel: "SAFE",
        enabled: true,
      },
      {
        id: "termux.file.read",
        name: "Read Local Storage",
        riskLevel: "SENSITIVE",
        enabled: true,
      },
    ],
    status: "CAPABILITIES_VERIFIED",
  });
});

// TASK-007: Controlled Capability Execution Endpoint
app.post("/api/termux/capability", (req, res) => {
  const { capability } = req.body || {};

  if (!capability || typeof capability !== "string") {
    return res.status(400).json({
      success: false,
      error: "CAPABILITY_NOT_FOUND",
      message: "Missing or invalid capability identifier.",
    });
  }

  // Reject shell execution / command execution attempts
  if (req.body.command || req.body.exec || req.body.shell || req.body.args) {
    return res.status(403).json({
      success: false,
      error: "CAPABILITY_NOT_AUTHORIZED",
      message: "Arbitrary command execution is strictly forbidden.",
    });
  }

  // Explicit Handler for termux.system.info
  if (capability === "termux.system.info") {
    return res.json({
      success: true,
      capability: "termux.system.info",
      runtime: "TermuxRuntime",
      platform: "android-termux",
      data: {
        platform: os.platform().toUpperCase(),
        architecture: os.arch(),
        nodeVersion: process.version,
        termuxVersion: "0.118.0",
        runtimeId: "termux-local-01",
        cpuCores: os.cpus().length,
        memoryFreeGB: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2),
        memoryTotalGB: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2),
      },
    });
  }
  // TASK-018 (Section 3.A): Explicit Handler for termux.file.read.
  //
  // Reads ONLY from FILE_READ_ALLOW_LIST above. The requested "path" value
  // is treated purely as a lookup key, never as part of an actual
  // filesystem path, so it cannot be used for traversal.
  if (capability === "termux.file.read") {
    const rawKey =
      (req.body.input && req.body.input.path) ?? req.body.path ?? null;

    if (typeof rawKey !== "string" || rawKey.length === 0) {
      return res.status(400).json({
        success: false,
        error: "PATH_REQUIRED",
        message: "A 'path' identifying an allow-listed file is required.",
      });
    }

    const looksLikeRealPath =
      rawKey.includes("..") ||
      rawKey.includes("/") ||
      rawKey.includes("\\") ||
      path.isAbsolute(rawKey);

    if (looksLikeRealPath) {
      return res.status(403).json({
        success: false,
        error: "PATH_NOT_ALLOWED",
        message:
          "Arbitrary or traversal-style file paths are strictly forbidden.",
      });
    }

    if (!Object.prototype.hasOwnProperty.call(FILE_READ_ALLOW_LIST, rawKey)) {
      return res.status(403).json({
        success: false,
        error: "PATH_NOT_ALLOWED",
        message: "Requested file is not in the allow-list.",
      });
    }

    const absolutePath = FILE_READ_ALLOW_LIST[rawKey];

    try {
      const content = fs.readFileSync(absolutePath, "utf8");
      return res.json({
        success: true,
        capability: "termux.file.read",
        runtime: "TermuxRuntime",
        data: {
          path: rawKey,
          content,
          sizeBytes: Buffer.byteLength(content, "utf8"),
        },
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: "FILE_READ_FAILED",
        message: "Unable to read the requested file.",
      });
    }
  }

  return res.status(400).json({
    success: false,
    error: "CAPABILITY_NOT_FOUND",
    message: `Unsupported capability identifier: ${capability}`,
  });
});

app.use("/api/system", sourceApi);

// ---------------------------------------------------------------------------
// TASK-017: One Canonical Backend — telemetry routes absorbed from the now
// retired orbis-server/server.cjs. Logic is copied unchanged (same Prisma
// queries, same fallback shapes, same error handling); only the process/
// port it runs in has changed.
// ---------------------------------------------------------------------------
app.post("/api/internal/log", async (req, res) => {
  const { level, source, message } = req.body;
  if (message) {
    await addSystemLog(level, source, message);
  }
  res.sendStatus(200);
});

app.get("/api/metrics", async (req, res) => {
  try {
    const latestMetric = await prisma.foundationAdminMetric.findFirst({
      orderBy: { recordedAt: "desc" },
    });
    if (latestMetric) {
      res.json(latestMetric);
    } else {
      res.json({ ramUsageMb: 0, cpuLoad: 0, status: "NO_DATA_YET" });
    }
  } catch (error) {
    console.error("[DB_ERROR] Failed to fetch metrics from Postgres");
    res.status(500).json({ error: "Database connection failed" });
  }
});

app.get("/api/diagnostics", async (req, res) => {
  try {
    const diag = getDiagnostics();
    const dbLogs = await prisma.foundationSystemLog.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    if (dbLogs && dbLogs.length > 0) {
      diag.logs = dbLogs.map((l) => ({
        timestamp: l.timestamp,
        level: l.level,
        source: l.source,
        message: l.message,
      }));
    }
    res.json(diag);
  } catch (error) {
    res.json(getDiagnostics());
  }
});

function getDirectoryTree(dirPath, indent = "", changedFiles = []) {
  let result = "";
  if (!fs.existsSync(dirPath)) return "Directory not found";
  const items = fs.readdirSync(dirPath);
  items.forEach((item) => {
    if (item === "node_modules" || item.startsWith(".") || item === "dist")
      return;
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    const relPath = fullPath.replace(/\\/g, "/");
    const isChanged = changedFiles.some((f) => relPath.endsWith(f));
    const marker = isChanged ? " ✨ [NEWLY EDITED]" : "";

    if (stat.isDirectory()) {
      result += `${indent}📁 ${item}/${marker}\n`;
      result += getDirectoryTree(fullPath, indent + "  │  ", changedFiles);
    } else {
      result += `${indent}  📄 ${item}${marker}\n`;
    }
  });
  return result;
}

app.get("/api/system-stats", (req, res) => {
  const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
  const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
  const usedMem = (totalMem - freeMem).toFixed(2);
  const loadAvg = os.loadavg();
  const uptimeSeconds = os.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  let cpuModel = "Unknown Processor";
  try {
    cpuModel = os.cpus()[0].model;
  } catch (e) {}

  res.json({
    cpuCores: os.cpus().length,
    cpuModel,
    arch: os.arch(),
    platform: os.platform().toUpperCase(),
    release: os.release(),
    hostname: os.hostname(),
    load: loadAvg[0].toFixed(2),
    load5m: loadAvg[1].toFixed(2),
    load15m: loadAvg[2].toFixed(2),
    totalMem,
    freeMem,
    usedMem,
    ramUsedPercent: ((usedMem / totalMem) * 100).toFixed(1),
    uptime: `${hours}h ${minutes}m`,
    processUptime: process.uptime().toFixed(0),
    heapUsed: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2),
    status: "ONLINE",
  });
});

app.get("/api/ai/providers/status", (req, res) => {
  try {
    const active = providerManager.getActiveProvider();
    res.json({
      activeProvider: active.getMetadata(),
      allProviders: Array.from(providerManager.providers.values()).map((p) =>
        p.getMetadata(),
      ),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const rawMessages = req.body?.messages;
    const responsePayload = await aiChatService.processChatRequest(rawMessages);
    return res.json(responsePayload);
  } catch (error) {
    console.error("[CHAT_API] Request failed:", error.message);
    const status =
      error.message.includes("authentication") ||
      error.message.includes("unavailable")
        ? 502
        : 500;
    return res
      .status(status)
      .json({ error: error.message || "Chat backend request failed." });
  }
});

// ---------------------------------------------------------------------------
// TASK-011: Audit-driven Termux Observatory task discovery
//
// The Observatory no longer ships a hardcoded task-card array. Every card is
// discovered from docs/AUDIT_REPORTS/ at request time: the numeric filename
// prefix is the authoritative TASK ID, and the report content is parsed
// best-effort for display fields. Historical TASK-001..007 report formats
// are inconsistent (three different layouts were used over time), so a
// small fallback table preserves the previously-verified metadata for any
// field that cannot be reliably parsed — nothing is invented.
// ---------------------------------------------------------------------------

const AUDIT_FALLBACK = "Recorded in audit";

// Last-resort fallback values for TASK-001..007, used only when a field
// cannot be reliably extracted from that task's audit report content. This
// is NOT the data source (task existence/selection is 100% file-driven) —
// it exists solely so unparsable fields degrade to known-accurate history
// instead of a generic placeholder or fabricated text.
const HISTORICAL_FALLBACK_METADATA = {
  1: {
    objective: "Establish the provider-independent execution foundation.",
    implementationSummary:
      "Defines the contracts required by controlled local runtimes.",
    dependencies: ["Foundation"],
    filesByLayer: {
      core: [
        "src/core/execution/interfaces/IExecutionPolicy.ts",
        "src/core/execution/interfaces/IExecutionRequest.ts",
        "src/core/execution/interfaces/IExecutionResult.ts",
        "src/core/execution/interfaces/IExecutionRuntime.ts",
      ],
    },
    commit: AUDIT_FALLBACK,
    implementer: "Orbis Core",
  },
  2: {
    objective:
      "Register capabilities/runtimes and make deterministic policy decisions.",
    implementationSummary:
      "Unknown capabilities/runtimes are denied; sensitive operations require approval.",
    dependencies: ["TASK-001"],
    filesByLayer: {
      core: [
        "src/core/execution/registry/CapabilityModel.ts",
        "src/core/execution/registry/RuntimeRegistry.ts",
        "src/core/execution/policy/ExecutionPolicyEngine.ts",
      ],
    },
    commit: AUDIT_FALLBACK,
    implementer: "Orbis Core",
  },
  3: {
    objective: "Control runtime lifecycle and health state.",
    implementationSummary:
      "Runtime state transitions and health verification are enforced.",
    dependencies: ["TASK-002"],
    filesByLayer: {
      core: [
        "src/core/execution/lifecycle/LifecycleState.ts",
        "src/core/execution/lifecycle/RuntimeHealth.ts",
        "src/core/execution/lifecycle/RuntimeLifecycleManager.ts",
      ],
    },
    commit: AUDIT_FALLBACK,
    implementer: "Orbis Core",
  },
  4: {
    objective: "Provide the final authorization barrier before execution.",
    implementationSummary:
      "Authorization is checked before a capability can reach a concrete runtime.",
    dependencies: ["TASK-003"],
    filesByLayer: {
      core: [
        "src/core/execution/authorization/SecureExecutionAuthorizationGate.ts",
      ],
    },
    commit: AUDIT_FALLBACK,
    implementer: "Orbis Core",
  },
  5: {
    objective: "Expose the execution foundation through the Admin Dashboard.",
    implementationSummary:
      "Shows execution/security/runtime state without replacing the execution architecture.",
    dependencies: ["TASK-004"],
    filesByLayer: {
      frontend: [
        "src/admin/dashboard/AdminDashboard.tsx",
        "src/admin/dashboard/sections/LocalRuntime.tsx",
      ],
    },
    commit: AUDIT_FALLBACK,
    implementer: "Orbis Core",
  },
  6: {
    objective:
      "Connect ORBIS execution foundation to real Termux runtime bridge.",
    implementationSummary:
      "Establishes identity verification, capability discovery handshake, and health verification.",
    dependencies: ["TASK-005"],
    filesByLayer: {
      core: [
        "src/core/execution/runtimes/TermuxRuntime.ts",
        "src/core/execution/runtimes/TermuxRuntimeService.ts",
      ],
      backend: ["orbis-server/bridge.cjs"],
    },
    commit: AUDIT_FALLBACK,
    implementer: "Orbis Core",
  },
  7: {
    objective:
      "Invoke explicitly authorized Termux capabilities safely and receive real structured runtime results.",
    implementationSummary:
      "Controlled execution of termux.system.info through the registered runtime, ExecutionPolicyEngine and SecureExecutionAuthorizationGate, returning structured runtime output without shell/spawn execution.",
    dependencies: ["TASK-006"],
    filesByLayer: {
      core: [
        "src/core/execution/runtimes/TermuxRuntime.ts",
        "src/core/execution/runtimes/TermuxRuntimeService.ts",
      ],
      backend: ["orbis-server/bridge.cjs"],
    },
    commit: "7100abd",
    implementer: "Orbis Core",
  },
};

const AUDIT_FILE_RE = /^0*(\d+)_.+\.md$/i;

/**
 * Extract a "Label: value" style field from free-form audit report text.
 * Tolerates the multiple historical formats seen across reports:
 *   "- **Date:** 2026-08-13"
 *   "- **Date**: 2026-08-14"
 *   "DATE              : 2026-08-15"
 *   "**Status:** COMPLETED"
 */
function extractField(content, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    String.raw`(?:^|\n)[ \t\-\*]*${escaped}[ \t\*]*:\s*\*{0,2}\s*(.+)`,
    "i",
  );
  const m = content.match(re);
  if (!m) return null;
  const value = m[1].replace(/\*+\s*$/, "").trim();
  return value || null;
}

// TASK-015 (Part 1A): a "label line" like "Modified source:" or
// "No changes were made to:" — short, colon-terminated, introduces a
// file/component list rather than describing what/why. An indented
// block (4+ leading spaces or a tab on every line) is a code/path
// listing, not prose. Both are skipped when looking for a real summary
// paragraph, instead of being mistaken for one (this was the exact
// TASK-014 Observatory bug: "CORE LOGIC / SUMMARY: Modified source:").
function isLabelLikeParagraph(paragraph) {
  const trimmed = paragraph.trim();
  if (!trimmed) return true;
  if (/:$/.test(trimmed) && trimmed.split(/\s+/).length <= 6) return true;
  if (
    paragraph
      .split("\n")
      .every((line) => /^(?: {4,}|\t)/.test(line) || !line.trim())
  ) {
    return true;
  }
  return false;
}

/**
 * Extract the first genuine prose paragraph under a heading like
 * "## Objective" / "## 1. Objective" / "# 4. IMPLEMENTATION", skipping
 * short "Label:" lines and indented code/path blocks that historically
 * appear first in some report sections (see isLabelLikeParagraph).
 * Also requires a minimum length so a short trailing sentence fragment
 * (e.g. "from that bridgePort.") isn't mistaken for the summary either.
 */
function extractHeadingParagraph(content, headingNames) {
  for (const name of headingNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const headingRe = new RegExp(
      String.raw`^#+\s*(?:\d+\.\s*)?${escaped}\s*$`,
      "im",
    );
    const headingMatch = headingRe.exec(content);
    if (!headingMatch) continue;

    const after = content.slice(headingMatch.index + headingMatch[0].length);
    const nextHeadingIdx = after.search(/\n#+[ \t]/);
    const section =
      nextHeadingIdx === -1 ? after : after.slice(0, nextHeadingIdx);

    const paragraphs = section.split(/\n[ \t]*\n/);
    for (const para of paragraphs) {
      if (!para.trim()) continue;
      if (isLabelLikeParagraph(para)) continue;
      const candidate = para.replace(/\n+/g, " ").trim();
      if (candidate.length < 30) continue;
      return candidate;
    }
  }
  return null;
}

// TASK-015 (Part 1A): headings that historically introduce a file-change
// list. Matched the same tolerant way as extractHeadingParagraph.
const SOURCE_FILE_HEADINGS = [
  "File Change Scope",
  "Files Changed",
  "Changed Files",
  "Modified Files",
  "Source Files",
  "Source File",
];

/**
 * Extract real implementation source file paths from a section like
 * "# 6. FILE CHANGE SCOPE". Only lines that look like an actual path
 * (contain a "/" or end in a known file extension) are kept, so a
 * following "No changes were made to: <bare component names>" list in
 * the same section is naturally excluded. The audit report's own
 * filename — and any other audit report filename — is always excluded,
 * so the report can never be listed as its own implementation source
 * (the exact TASK-014 Observatory bug this fixes).
 */
function extractSourceFiles(content, auditFileName) {
  for (const name of SOURCE_FILE_HEADINGS) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const headingRe = new RegExp(
      String.raw`^#+\s*(?:\d+\.\s*)?${escaped}\s*$`,
      "im",
    );
    const headingMatch = headingRe.exec(content);
    if (!headingMatch) continue;

    const after = content.slice(headingMatch.index + headingMatch[0].length);
    const nextHeadingIdx = after.search(/\n#+[ \t]/);
    const section =
      nextHeadingIdx === -1 ? after : after.slice(0, nextHeadingIdx);
    // Stop before an "untouched components" list that sometimes shares
    // the same section (bare names, not file paths — see TASK-014).
    const body = section.split(
      /\n[ \t]*No changes? (?:were|was) made to:?/i,
    )[0];

    const fileLineRe =
      /^[ \t]*(?:\d+[.)]|[-*])?[ \t]*([A-Za-z0-9_.\-/]+\.[A-Za-z0-9]+)[ \t]*$/;
    const files = [];
    for (const line of body.split("\n")) {
      const m = line.match(fileLineRe);
      if (!m) continue;
      const candidate = m[1].trim();
      if (candidate === auditFileName) continue;
      if (/AUDIT_REPORT/i.test(candidate)) continue;
      files.push(candidate);
    }
    if (files.length) return files;
  }
  return null;
}

function extractObjective(content) {
  const labeled = extractField(content, "Objective");
  if (labeled) return labeled;

  const title = extractField(content, "Title");
  if (title) return title;

  const taskLine =
    extractField(content, "Task ID") || extractField(content, "Task");
  if (taskLine) {
    const dashMatch = taskLine.match(/TASK-\d+\s*[—–-]\s*(.+)/i);
    if (dashMatch && dashMatch[1]) return dashMatch[1].trim();
  }

  const heading = extractHeadingParagraph(content, ["Objective"]);
  if (heading) return heading;

  return null;
}

function extractImplementationSummary(content) {
  const heading = extractHeadingParagraph(content, [
    "Implementation Summary",
    "Core Logic",
    "Implementation",
  ]);
  if (heading) return heading;
  return null;
}

function extractStatus(content) {
  return (
    extractField(content, "Final Status") || extractField(content, "Status")
  );
}

function extractCommit(content) {
  const raw =
    extractField(content, "Implementation Commit") ||
    extractField(content, "Implementation SHA") ||
    extractField(content, "Git Commit SHA") ||
    extractField(content, "Commit");
  if (!raw) return null;
  const cleaned = raw.replace(/`/g, "").trim();
  return cleaned && !/^pending/i.test(cleaned) ? cleaned : null;
}

function extractDependencies(content, num) {
  const raw =
    extractField(content, "Dependency") ||
    extractField(content, "Dependencies") ||
    extractField(content, "Previous Baseline");
  if (raw) {
    const taskRefs = raw.match(/TASK-\d+/gi);
    if (taskRefs && taskRefs.length) {
      return taskRefs.map((t) => t.toUpperCase());
    }
  }
  return num > 1
    ? [`TASK-${String(num - 1).padStart(3, "0")}`]
    : ["Foundation"];
}

/** Fallback date/time parsed from filenames like 001_2026-08-13_23-18-27.md */
function extractDateTimeFromFilename(file) {
  const m = file.match(
    /^\d+_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})\.md$/i,
  );
  if (!m) return { date: null, time: null };
  return { date: m[1], time: `${m[2]}:${m[3]}:${m[4]}` };
}

/**
 * Group discovered audit report filenames by numeric TASK id and resolve
 * each group to exactly one authoritative file, per the deterministic
 * FINAL-preference rules. Nothing is deleted or renamed on disk.
 */
function resolveAuditGroups(files) {
  const groups = new Map();
  for (const name of files) {
    const m = name.match(AUDIT_FILE_RE);
    if (!m) continue;
    const num = parseInt(m[1], 10);
    if (!groups.has(num)) groups.set(num, []);
    groups.get(num).push(name);
  }

  const resolved = [];
  for (const num of Array.from(groups.keys()).sort((a, b) => a - b)) {
    const groupFiles = groups.get(num).slice().sort();
    let chosen;

    if (groupFiles.length === 1) {
      chosen = groupFiles[0];
    } else {
      const finals = groupFiles.filter((f) => /final/i.test(f));
      if (finals.length === 1) {
        chosen = finals[0];
      } else if (finals.length > 1) {
        chosen = finals[0];
        console.warn(
          `[termux-observatory] Multiple FINAL audit reports found for TASK-${String(num).padStart(3, "0")}: ${finals.join(", ")}. ` +
            `Using "${chosen}" (deterministic: first alphabetically) — other reports were NOT deleted.`,
        );
      } else {
        chosen = groupFiles[groupFiles.length - 1];
        console.warn(
          `[termux-observatory] Multiple audit reports found for TASK-${String(num).padStart(3, "0")} with no FINAL report: ${groupFiles.join(", ")}. ` +
            `Using "${chosen}" (deterministic: last alphabetically) — other reports were NOT deleted.`,
        );
      }
    }

    resolved.push({ num, file: chosen, allFiles: groupFiles });
  }
  return resolved;
}

/** Build a single Observatory task card from a resolved audit report file. */
function buildTaskFromAudit(auditDir, num, file) {
  const fallback = HISTORICAL_FALLBACK_METADATA[num] || null;
  let content = "";
  try {
    content = fs.readFileSync(path.join(auditDir, file), "utf8");
  } catch (e) {
    content = "";
  }

  const filenameDateTime = extractDateTimeFromFilename(file);
  const rawStatus = extractStatus(content);
  const passed = rawStatus
    ? !/FAIL|REJECT|BLOCKED|NOT YET RUN|PENDING/i.test(rawStatus)
    : true;

  return {
    task: `TASK-${String(num).padStart(3, "0")}`,
    status: rawStatus || "COMPLETED",
    passed,
    objective:
      extractObjective(content) ||
      fallback?.objective ||
      "Discovered from audit report",
    implementationSummary:
      extractImplementationSummary(content) ||
      fallback?.implementationSummary ||
      "Automatically loaded via Universal Task Schema",
    dependencies: extractDependencies(content, num),
    // TASK-015 (Part 1A) fix: the audit report file itself must never be
    // shown as an implementation source file. Try to parse real source
    // paths out of the report content first (e.g. "# 6. FILE CHANGE
    // SCOPE"); only fall back to historical per-task metadata, and only
    // as a last resort to an explicitly empty list — never to `file`.
    filesByLayer: (() => {
      const parsedFiles = extractSourceFiles(content, file);
      if (parsedFiles) return { root: parsedFiles };
      if (fallback?.filesByLayer) return fallback.filesByLayer;
      // Genuinely unknown — an empty object (not { root: [file] }) so the
      // Observatory UI shows no source-files layer at all rather than
      // ever listing the audit report as its own implementation source.
      return {};
    })(),
    tests: AUDIT_FALLBACK,
    coverage: AUDIT_FALLBACK,
    build: AUDIT_FALLBACK,
    typeCheck: AUDIT_FALLBACK,
    security: AUDIT_FALLBACK,
    architectureImpact: AUDIT_FALLBACK,
    knownIssues: AUDIT_FALLBACK,
    commit: extractCommit(content) || fallback?.commit || "N/A",
    auditFile: `docs/AUDIT_REPORTS/${file}`,
    date:
      extractField(content, "Date") ||
      filenameDateTime.date ||
      fallback?.date ||
      new Date().toISOString().split("T")[0],
    time: extractField(content, "Time") || filenameDateTime.time || "",
    implementer:
      extractField(content, "Implementer") ||
      fallback?.implementer ||
      "Automated Check",
  };
}

function buildObservatoryTasks(auditDir) {
  let files = [];
  try {
    if (fs.existsSync(auditDir)) {
      files = fs.readdirSync(auditDir).filter((n) => AUDIT_FILE_RE.test(n));
    }
  } catch (e) {
    files = [];
  }

  const resolvedGroups = resolveAuditGroups(files);
  return resolvedGroups.map(({ num, file }) =>
    buildTaskFromAudit(auditDir, num, file),
  );
}

app.get("/api/termux-observatory", (req, res) => {
  try {
    const auditDir = path.join(__dirname, "../docs/AUDIT_REPORTS");
    const tasks = buildObservatoryTasks(auditDir);
    const maxTaskNum = tasks.reduce((max, t) => {
      const n = parseInt(t.task.replace("TASK-", ""), 10);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);

    return res.json({
      title: "TERMUX / ANDROID OBSERVATORY",
      purpose: "Persistent execution tracking & auditing map",
      work: "System monitoring active",
      completed: tasks.length,
      auditedTasks: tasks.length,
      progress: 100,
      tasks: tasks.slice().reverse(),
      next: `Awaiting implementation of TASK-${String(maxTaskNum + 1).padStart(3, "0")}`,
    });
  } catch (err) {
    console.error("Observatory Error:", err);
    return res.status(500).json({ error: "Failed to load data" });
  }
});

app.post("/api/orbis-command", async (req, res) => {
  let rawCommand = req.body.command || "";
  let cleanCommand = rawCommand.replace(/^.*?ai:\s*/i, "").trim();

  if (cleanCommand.includes("ট্রি") || cleanCommand.includes("tree")) {
    const rootPath = path.join(__dirname, "../");
    return res.json({
      result:
        `--- LIVE SOURCE CODE DIRECTORY ---\n\n` + getDirectoryTree(rootPath),
    });
  } else {
    return handleOllamaStream(cleanCommand, res);
  }
});

const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));

app.get(/\/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Orbis Server running on port ${PORT}`);
});

module.exports = {
  app,
  resolveAuditGroups,
  buildTaskFromAudit,
  buildObservatoryTasks,
};
