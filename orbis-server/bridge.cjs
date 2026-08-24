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
const { requireAuthenticatedAdmin } = require("./admin-auth.cjs");
const {
  createChatRateLimiter,
  validateChatPayload,
} = require("./chat-api-security.cjs");
const { createLearningRouter } = require("./learning-api.cjs");
const {
  FoundationLearningService,
} = require("./ai/learning/FoundationLearningService.cjs");
const {
  PgLearningRepository,
} = require("./ai/learning/PgLearningRepository.cjs");
const {
  createProviderLearningCandidateGenerator,
} = require("./ai/learning/ProviderLearningCandidateGenerator.cjs");
const sourceApi = require("./source-api.cjs");
const { getSystemStats } = require("./system-stats.cjs");
const { buildAdminDiagnosticExport } = require("./admin-diagnostic-export.cjs");
const { chatCapabilityRegistry } = require("./ai/ChatCapabilityRegistry.cjs");
const {
  FoundationDataCapabilityOrchestrator,
} = require("./ai/FoundationDataCapabilityOrchestrator.cjs");
const {
  createFoundationCapabilityRouter,
} = require("./foundation-capability-api.cjs");
const {
  getDiagnostics,
  addSystemLog,
  cleanupExpiredSystemLogs,
  sanitizeDiagnosticLogs,
  setDbClient,
} = require("./telemetry-module.cjs");

const PORT = process.env.PORT || 3000;
const TELEMETRY_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CORS_ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);
const FILE_READ_ALLOW_LIST = Object.freeze({
  "package.json": path.join(__dirname, "..", "package.json"),
  "README.md": path.join(__dirname, "..", "README.md"),
});

function logSanitizedError(context) {
  console.error(context);
}

function getCorsOptions(req, callback) {
  const origin = req.get("Origin");
  const forwardedProto = req.get("X-Forwarded-Proto");
  const protocol = forwardedProto
    ? forwardedProto.split(",", 1)[0].trim().toLowerCase()
    : req.protocol;
  const host = req.get("Host");
  const requestOrigin =
    host && (protocol === "http" || protocol === "https")
      ? `${protocol}://${host}`
      : null;

  if (!origin || CORS_ALLOWED_ORIGINS.has(origin) || origin === requestOrigin) {
    callback(null, { origin: true });
    return;
  }

  const error = new Error("Origin is not allowed by the CORS policy.");
  error.code = "CORS_ORIGIN_NOT_ALLOWED";
  callback(error);
}

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
const foundationDataCapabilityOrchestrator =
  new FoundationDataCapabilityOrchestrator({ prisma });

prisma
  .$connect()
  .then(() => {
    setDbClient(prisma);
    void cleanupExpiredSystemLogs();
    const cleanupTimer = setInterval(
      () => void cleanupExpiredSystemLogs(),
      TELEMETRY_CLEANUP_INTERVAL_MS,
    );
    cleanupTimer.unref();
    void addSystemLog(
      "INFO",
      "TELEMETRY",
      "Foundation telemetry database ready",
    );
    console.log("[DB] Prisma Adapter successfully connected to Supabase!");
  })
  .catch(() => {
    console.error("[DB_ERROR] Prisma telemetry storage unavailable");
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
        } catch {
          logSanitizedError("[OLLAMA_STREAM] Invalid JSON chunk");
          res.write(text);
        }
      }
    }
    res.end();
  } catch {
    console.error("[OLLAMA_STREAM] Provider unavailable");
    if (!res.headersSent) {
      return res.status(503).json({ result: "AI provider unavailable." });
    }
    res.write("\n⚠️ AI Connection Interrupted.");
    res.end();
  }
}

const app = express();
app.disable("x-powered-by");
app.use(cors(getCorsOptions));
app.use((error, req, res, next) => {
  if (error?.code === "CORS_ORIGIN_NOT_ALLOWED") {
    return res.status(403).json({
      error: "CORS_ORIGIN_NOT_ALLOWED",
      message: "Origin is not allowed by the CORS policy.",
    });
  }
  return next(error);
});
app.use(express.json({ limit: "1mb", strict: true }));
app.use((error, req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      error: { category: "invalid_request", code: "REQUEST_TOO_LARGE" },
    });
  }
  return next(error);
});

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
app.post("/api/brain/request", requireAuthenticatedAdmin, async (req, res) => {
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
  } catch {
    console.error("[BRAIN_API] Request failed");

    return res.status(500).json({
      success: false,
      requestId: "unassigned",
      runtime: "unknown",
      error: "BRAIN_REQUEST_FAILED",
      durationMs: 0,
    });
  }
});

app.use(
  "/api/admin/capabilities",
  createFoundationCapabilityRouter({
    orchestrator: foundationDataCapabilityOrchestrator,
    authMiddleware: requireAuthenticatedAdmin,
    rateLimiter: createChatRateLimiter({ maxRequests: 10 }),
  }),
);

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
    const rawKey = req.body.input?.path ?? req.body.path ?? null;

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

    if (!Object.hasOwn(FILE_READ_ALLOW_LIST, rawKey)) {
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
    } catch {
      logSanitizedError("[FILE_READ] Failed to read allow-listed file");
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
// retired orbis-server/server.cjs. These Foundation telemetry reads are
// Admin-only and retain their existing response/fallback shapes.
// ---------------------------------------------------------------------------
app.get("/api/metrics", requireAuthenticatedAdmin, async (req, res) => {
  try {
    const latestMetric = await prisma.foundationAdminMetric.findFirst({
      orderBy: { recordedAt: "desc" },
    });
    if (latestMetric) {
      res.json(latestMetric);
    } else {
      res.json({ ramUsageMb: 0, cpuLoad: 0, status: "NO_DATA_YET" });
    }
  } catch {
    console.error("[DB_ERROR] Failed to fetch metrics from Postgres");
    res.status(500).json({ error: "Database connection failed" });
  }
});

app.get("/api/diagnostics", requireAuthenticatedAdmin, async (req, res) => {
  try {
    const diag = getDiagnostics();
    const dbLogs = await prisma.foundationSystemLog.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    const safeDbLogs = sanitizeDiagnosticLogs(dbLogs);
    if (safeDbLogs.length > 0) diag.logs = safeDbLogs;
    res.json(diag);
  } catch {
    logSanitizedError("[DB_ERROR] Failed to fetch diagnostics");
    res.json(getDiagnostics());
  }
});

app.get(
  "/api/admin/diagnostic-export",
  requireAuthenticatedAdmin,
  async (_req, res) => {
    try {
      const report = await buildAdminDiagnosticExport({
        prisma,
        providerManager,
        capabilityRegistry: chatCapabilityRegistry,
      });
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="orbis-foundation-diagnostic.json"',
      );
      res.setHeader("Cache-Control", "no-store");
      res.json(report);
      void addSystemLog(
        "INFO",
        "ADMIN_AUDIT",
        "Admin diagnostic export generated",
      );
    } catch {
      res.status(503).json({
        success: false,
        message: "Diagnostic export unavailable",
      });
    }
  },
);

function getDirectoryTree(dirPath, indent = "", changedFiles = []) {
  let result = "";
  if (!fs.existsSync(dirPath)) return "Directory not found";
  const items = fs.readdirSync(dirPath);
  items.forEach((item) => {
    if (item === "node_modules" || item.startsWith(".") || item === "dist")
      return;
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    const relPath = fullPath.replaceAll("\\", "/");
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
  res.json(getSystemStats());
});

app.get("/api/ai/providers/status", (req, res) => {
  res.json(providerManager.getStatus());
});

const chatRateLimiter = createChatRateLimiter();

const learningService = new FoundationLearningService({
  repository: new PgLearningRepository(
    telemetryConnectionString ? telemetryPool : null,
  ),
  candidateGenerator: createProviderLearningCandidateGenerator(providerManager),
});
app.use(
  "/api/chat/learning",
  createLearningRouter({
    service: learningService,
    authMiddleware: requireAuthenticatedAdmin,
    rateLimiter: createChatRateLimiter({ maxRequests: 10 }),
  }),
);

app.post(
  "/api/chat",
  requireAuthenticatedAdmin,
  chatRateLimiter,
  async (req, res) => {
    try {
      const validation = validateChatPayload(req.body);
      if (!validation.valid) {
        const status = validation.code === "CHAT_REQUEST_TOO_LARGE" ? 413 : 400;
        return res.status(status).json({
          error: { category: "invalid_request", code: validation.code },
        });
      }
      const rawMessages = req.body?.messages;
      const responsePayload = await aiChatService.processChatRequest(
        rawMessages,
        {
          pendingClarification: req.body?.pendingClarification,
        },
      );
      return res.json(responsePayload);
    } catch (error) {
      console.error("[CHAT_API] Request failed");
      const code = error?.code || error?.message || "CHAT_BACKEND_UNAVAILABLE";
      const timeout = code === "PROVIDER_TIMEOUT";
      return res.status(timeout ? 504 : 503).json({
        error: {
          category: timeout ? "timeout" : "service_unavailable",
          code: timeout ? "PROVIDER_TIMEOUT" : "CHAT_BACKEND_UNAVAILABLE",
        },
      });
    }
  },
);

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

function getAuditTaskNumber(fileName) {
  if (typeof fileName !== "string" || !fileName.toLowerCase().endsWith(".md")) {
    return null;
  }

  const separatorIndex = fileName.indexOf("_");
  if (separatorIndex <= 0 || separatorIndex >= fileName.length - 3) return null;

  const taskPrefix = fileName.slice(0, separatorIndex);
  for (const character of taskPrefix) {
    if (character < "0" || character > "9") return null;
  }
  return Number.parseInt(taskPrefix, 10);
}

function isAuditFileName(fileName) {
  return getAuditTaskNumber(fileName) !== null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function removeTrailingAsterisks(value) {
  const withoutTrailingWhitespace = value.trimEnd();
  let end = withoutTrailingWhitespace.length;
  while (end > 0 && withoutTrailingWhitespace[end - 1] === "*") end -= 1;
  return withoutTrailingWhitespace.slice(0, end).trim();
}

/**
 * Extract a "Label: value" style field from free-form audit report text.
 * Tolerates the multiple historical formats seen across reports:
 *   "- **Date:** 2026-08-13"
 *   "- **Date**: 2026-08-14"
 *   "DATE              : 2026-08-15"
 *   "**Status:** COMPLETED"
 */
function extractField(content, label) {
  const escaped = escapeRegExp(label);
  const re = new RegExp(
    String.raw`(?:^|\n)[ \t\-\*]*${escaped}[ \t\*]*:\s*\*{0,2}\s*(.+)`,
    "i",
  );
  const m = content.match(re);
  if (!m) return null;
  const value = removeTrailingAsterisks(m[1]);
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
  if (trimmed.endsWith(":") && trimmed.split(/\s+/).length <= 6) return true;
  if (
    paragraph
      .split("\n")
      .every((line) => /^(?: {4,}|\t)/.test(line) || !line.trim())
  ) {
    return true;
  }
  return false;
}

function extractNamedSection(content, name) {
  const escaped = escapeRegExp(name);
  const headingRe = new RegExp(
    String.raw`^#+\s*(?:\d+\.\s*)?${escaped}\s*$`,
    "im",
  );
  const headingMatch = headingRe.exec(content);
  if (!headingMatch) return null;

  const after = content.slice(headingMatch.index + headingMatch[0].length);
  const nextHeadingIdx = after.search(/\n#+[ \t]/);
  return nextHeadingIdx === -1 ? after : after.slice(0, nextHeadingIdx);
}

function extractProseParagraph(section) {
  const paragraphs = section.split(/\n[ \t]*\n/);
  for (const paragraph of paragraphs) {
    if (!paragraph.trim() || isLabelLikeParagraph(paragraph)) continue;
    const candidate = paragraph.replace(/\n+/g, " ").trim();
    if (candidate.length >= 30) return candidate;
  }
  return null;
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
    const section = extractNamedSection(content, name);
    if (!section) continue;
    const paragraph = extractProseParagraph(section);
    if (paragraph) return paragraph;
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

function isFilePath(candidate) {
  const extensionIndex = candidate.lastIndexOf(".");
  if (extensionIndex <= 0 || extensionIndex === candidate.length - 1) {
    return false;
  }

  for (let index = 0; index < candidate.length; index += 1) {
    const character = candidate[index];
    const isAlphaNumeric =
      (character >= "A" && character <= "Z") ||
      (character >= "a" && character <= "z") ||
      (character >= "0" && character <= "9");
    const isPathPunctuation = "_.-/".includes(character);
    if (!isAlphaNumeric && !isPathPunctuation) return false;
    if (index > extensionIndex && !isAlphaNumeric) return false;
  }
  return true;
}

function getListMarkerEnd(value) {
  if (value.startsWith("-") || value.startsWith("*")) return 1;

  let markerIndex = 0;
  while (
    markerIndex < value.length &&
    value[markerIndex] >= "0" &&
    value[markerIndex] <= "9"
  ) {
    markerIndex += 1;
  }
  return value[markerIndex] === "." || value[markerIndex] === ")"
    ? markerIndex + 1
    : 0;
}

function extractFilePathFromLine(line) {
  const value = line.trim();
  const markerEnd = getListMarkerEnd(value);
  if (markerEnd > 0) {
    const withoutMarker = value.slice(markerEnd).trim();
    if (isFilePath(withoutMarker)) return withoutMarker;
  }
  return isFilePath(value) ? value : null;
}

function extractFilesFromSection(section, auditFileName) {
  const body = section.split(/\n[ \t]*No changes? (?:were|was) made to:?/i)[0];
  const files = [];
  for (const line of body.split("\n")) {
    const candidate = extractFilePathFromLine(line);
    if (!candidate || candidate === auditFileName) continue;
    if (/AUDIT_REPORT/i.test(candidate)) continue;
    files.push(candidate);
  }
  return files;
}

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
    const section = extractNamedSection(content, name);
    if (!section) continue;
    // Stop before an "untouched components" list that sometimes shares
    // the same section (bare names, not file paths — see TASK-014).
    const files = extractFilesFromSection(section, auditFileName);
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
    if (dashMatch?.[1]) return dashMatch[1].trim();
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
  const cleaned = raw.replaceAll("`", "").trim();
  return cleaned && !/^pending/i.test(cleaned) ? cleaned : null;
}

function extractDependencies(content, num) {
  const raw =
    extractField(content, "Dependency") ||
    extractField(content, "Dependencies") ||
    extractField(content, "Previous Baseline");
  if (raw) {
    const taskRefs = raw.match(/TASK-\d+/gi);
    if (taskRefs?.length) {
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

// TASK-019: /api/termux-observatory is polled every ~10s by the admin
// dashboard, and resolveAuditGroups() runs on every poll. Without this,
// the exact same "multiple FINAL reports" warning below was logged once
// per poll forever, flooding production logs. Keyed by task number and
// the exact duplicate-file-list signature, so: the same duplicate state
// still warns exactly once (not per-poll spam), and it warns again if
// the file list for that task actually changes later (a new/renamed
// report appears) — nothing here suppresses a genuinely new condition,
// and no report is ever deleted, renamed, or altered.
const auditGroupWarningSignatures = new Map();
function warnOnceForSignature(num, signature, message) {
  if (auditGroupWarningSignatures.get(num) === signature) return;
  auditGroupWarningSignatures.set(num, signature);
  console.warn(message);
}

/**
 * Group discovered audit report filenames by numeric TASK id and resolve
 * each group to exactly one authoritative file, per the deterministic
 * FINAL-preference rules. Nothing is deleted or renamed on disk.
 */
function resolveAuditGroups(files) {
  const groups = new Map();
  for (const name of files) {
    const num = getAuditTaskNumber(name);
    if (num === null) continue;
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
        warnOnceForSignature(
          num,
          `FINAL:${finals.join(",")}`,
          `[termux-observatory] Multiple FINAL audit reports found for TASK-${String(num).padStart(3, "0")}: ${finals.join(", ")}. ` +
            `Using "${chosen}" (deterministic: first alphabetically) — other reports were NOT deleted.`,
        );
      } else {
        chosen = groupFiles[groupFiles.length - 1];
        warnOnceForSignature(
          num,
          `NOFINAL:${groupFiles.join(",")}`,
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
      files = fs.readdirSync(auditDir).filter(isAuditFileName);
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
      const n = Number.parseInt(t.task.replace("TASK-", ""), 10);
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
