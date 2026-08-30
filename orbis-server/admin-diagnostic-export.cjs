const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { getSystemStats } = require("./system-stats.cjs");
const { sanitizeDiagnosticLogs } = require("./telemetry-module.cjs");

const MAX_EXPORT_BYTES = 128 * 1024;
const MAX_RECENT_EVENTS = 50;
const MAX_LOCAL_MIGRATIONS = 100;
const repositoryRoot = path.resolve(__dirname, "..");
const GIT_EXECUTABLE_CANDIDATES = Object.freeze([
  "/usr/bin/git",
  "/usr/local/bin/git",
  "/data/data/com.termux/files/usr/bin/git",
]);

const FOUNDATION_COUNT_QUERIES = Object.freeze([
  ["FoundationAdminMetric", "foundationAdminMetric"],
  ["FoundationSystemLog", "foundationSystemLog"],
  ["FoundationSourceCodeHistory", "foundationSourceCodeHistory"],
  ["FoundationBrainKnowledge", "foundationBrainKnowledge"],
  ["FoundationLearnedKnowledge", "foundationLearnedKnowledge"],
  ["FoundationLearningEvent", "foundationLearningEvent"],
]);

function safeIdentifier(value, fallback = "unknown") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  if (
    /\b(?:authorization|bearer|cookie|credential|key|password|secret|token)\b/i.test(
      normalized,
    )
  ) {
    return fallback;
  }
  return /^[a-z0-9._:/ -]{1,120}$/i.test(normalized) ? normalized : fallback;
}

function currentCommit() {
  try {
    const gitExecutable = GIT_EXECUTABLE_CANDIDATES.find((candidate) =>
      fs.existsSync(candidate),
    );
    if (!gitExecutable) return "unknown";
    return safeIdentifier(
      execFileSync(gitExecutable, ["rev-parse", "--short=12", "HEAD"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2_000,
      }).trim(),
    );
  } catch {
    return "unknown";
  }
}

function localMigrationStatus() {
  try {
    const migrationRoot = path.join(repositoryRoot, "prisma", "migrations");
    return fs
      .readdirSync(migrationRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^\d{14}_[a-z0-9_]+$/.test(name))
      .sort((left, right) => left.localeCompare(right))
      .slice(-MAX_LOCAL_MIGRATIONS)
      .map((name) => ({
        name,
        localStatus: "present",
        databaseStatus: "not-queried",
      }));
  } catch {
    return [];
  }
}

function brainRouteHealth() {
  try {
    const gatewayPath =
      require.resolve("./brain-runtime/brain/BrainRequestGateway.js");
    return {
      route: "/api/brain/request",
      registered: true,
      gatewayArtifact: gatewayPath ? "available" : "unavailable",
    };
  } catch {
    return {
      route: "/api/brain/request",
      registered: true,
      gatewayArtifact: "unavailable",
    };
  }
}

function providerSummary(providerManager) {
  try {
    const status = providerManager?.getStatus?.();
    const providers = Array.isArray(status?.allProviders)
      ? status.allProviders.slice(0, 10)
      : [];
    return providers.map((provider) => ({
      name: safeIdentifier(provider?.name),
      type: safeIdentifier(provider?.type),
      state: safeIdentifier(provider?.health?.state, "UNKNOWN").toUpperCase(),
    }));
  } catch {
    return [];
  }
}

function capabilitySummary(capabilityRegistry) {
  try {
    const capabilities = capabilityRegistry?.list?.();
    return Array.isArray(capabilities)
      ? capabilities.slice(0, 20).map((capability) => ({
          id: safeIdentifier(capability?.id),
          kind: safeIdentifier(capability?.kind),
          configured: capability?.configured !== false,
          status: safeIdentifier(capability?.status, "AVAILABLE").toUpperCase(),
          callable: capability?.callable !== false,
          executionRoute: safeIdentifier(
            capability?.executionRoute,
            "internal",
          ),
        }))
      : [];
  } catch {
    return [];
  }
}

async function countFoundationTables(prisma) {
  const results = await Promise.allSettled([
    ...FOUNDATION_COUNT_QUERIES.map(([, clientName]) => {
      const count = prisma?.[clientName]?.count;
      return typeof count === "function"
        ? count.call(prisma[clientName])
        : Promise.reject(new Error("unavailable"));
    }),
    typeof prisma?.$queryRaw === "function"
      ? prisma.$queryRaw`
          SELECT COUNT(*)::text AS "count"
          FROM public."FoundationTimeMachine"
        `
      : Promise.reject(new Error("unavailable")),
  ]);

  const names = [
    ...FOUNDATION_COUNT_QUERIES.map(([tableName]) => tableName),
    "FoundationTimeMachine",
  ];
  return names.map((table, index) => {
    const result = results[index];
    let count = null;
    if (result.status === "fulfilled") {
      const value = Array.isArray(result.value)
        ? result.value[0]?.count
        : result.value;
      const numeric = Number(value);
      if (Number.isSafeInteger(numeric) && numeric >= 0) count = numeric;
    }
    return {
      table,
      count,
      status: count === null ? "unavailable" : "available",
    };
  });
}

function summarizeTelemetry(logs) {
  const summary = {
    occurrences: 0,
    records: logs.length,
    bySeverity: {},
    byCategory: {},
  };
  for (const log of logs) {
    summary.occurrences += log.count;
    summary.bySeverity[log.severity] =
      (summary.bySeverity[log.severity] || 0) + log.count;
    summary.byCategory[log.category] =
      (summary.byCategory[log.category] || 0) + log.count;
  }
  return summary;
}

async function telemetryFacts(prisma) {
  try {
    const rows = await prisma?.foundationSystemLog?.findMany({
      take: MAX_RECENT_EVENTS,
      orderBy: { lastSeen: "desc" },
      select: {
        timestamp: true,
        level: true,
        source: true,
        message: true,
        category: true,
        severity: true,
        count: true,
        firstSeen: true,
        lastSeen: true,
      },
    });
    const recentEvents = sanitizeDiagnosticLogs(rows);
    return {
      status: "available",
      summary: summarizeTelemetry(recentEvents),
      recentEvents,
    };
  } catch {
    return {
      status: "unavailable",
      summary: { occurrences: 0, records: 0, bySeverity: {}, byCategory: {} },
      recentEvents: [],
    };
  }
}

async function buildAdminDiagnosticExport(dependencies) {
  const { prisma, providerManager, capabilityRegistry } = dependencies;
  const [tables, telemetry] = await Promise.all([
    countFoundationTables(prisma),
    telemetryFacts(prisma),
  ]);
  const availableCounts = tables.filter(
    (table) => table.status === "available",
  ).length;
  let databaseState = "unavailable";
  if (availableCounts === tables.length) {
    databaseState = "connected";
  } else if (availableCounts > 0) {
    databaseState = "degraded";
  }
  const stats = getSystemStats();
  const packageJson = require(path.join(repositoryRoot, "package.json"));
  const report = {
    schema: "orbis.foundation.admin-diagnostic.v1",
    generatedAt: new Date().toISOString(),
    redacted: true,
    version: {
      commit: currentCommit(),
      application: safeIdentifier(packageJson.version),
    },
    providers: providerSummary(providerManager),
    capabilities: capabilitySummary(capabilityRegistry),
    brain: brainRouteHealth(),
    database: {
      state: databaseState,
      foundationTableCounts: tables,
    },
    telemetry,
    migrations: localMigrationStatus(),
    runtime: {
      node: safeIdentifier(process.version),
      platform: stats.platform,
      architecture: stats.arch,
      processUptimeSeconds: Number(stats.processUptime),
      cpuCores: stats.cpuCores,
      cpuModel: stats.cpuModel,
      memoryTotalGb: Number(stats.totalMem),
      memoryUsedGb: Number(stats.usedMem),
    },
    exclusions: [
      "credentials-and-environment-values",
      "request-and-response-content",
      "chat-and-personal-memory-content",
      "source-and-attachment-content",
      "provider-error-details",
      "non-Foundation-table-content",
    ],
  };
  if (Buffer.byteLength(JSON.stringify(report), "utf8") > MAX_EXPORT_BYTES) {
    throw new Error("DIAGNOSTIC_EXPORT_TOO_LARGE");
  }
  return report;
}

module.exports = {
  FOUNDATION_COUNT_QUERIES,
  MAX_EXPORT_BYTES,
  MAX_RECENT_EVENTS,
  buildAdminDiagnosticExport,
};
