const os = require("node:os");
const { execSync } = require("node:child_process");
const crypto = require("node:crypto");
const { getSystemStats } = require("./system-stats.cjs");

const MAX_SYSTEM_LOGS = 100;
const MAX_LOG_MESSAGE_LENGTH = 240;
const AGGREGATION_WINDOW_MS = 5 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 250;
const ALLOWED_LEVELS = new Set(["INFO", "WARN", "ERROR"]);
const ALLOWED_SOURCES = new Set([
  "DATABASE",
  "FOUNDATION",
  "BRIDGE",
  "SYSTEM",
  "TELEMETRY",
  "SECURITY",
  "ADMIN_AUDIT",
  "PROVIDER",
  "BRAIN",
  "SOURCE_EXPLORER",
]);
const RETENTION_DAYS = Object.freeze({ INFO: 7, OPERATIONAL: 30, AUDIT: 90 });
const ALLOWED_OPERATIONAL_MESSAGES = new Set([
  "Admin diagnostic export generated",
  "Foundation database connection degraded",
  "Foundation telemetry database ready",
  "Foundation telemetry storage unavailable",
  "Foundation worker ready",
]);
const SENSITIVE_MESSAGE_PATTERNS = [
  /\bauthorization\s*:/i,
  /\bbearer\s+[a-z0-9._~+\/-]+/i,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|passwd|secret|credential|session[_ -]?id|private[_ -]?key)\b\s*[:=]/i,
  /\b(?:cookie|set-cookie)\s*:/i,
  /(?:https?|postgres(?:ql)?):\/\/[^\s/:@]+:[^\s/@]+@/i,
  /[?&](?:key|token|secret|password|credential)=[^&\s]+/i,
  /\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}/i,
  /\b[a-z0-9+/_=-]{32,}\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:^|\s)\+?\d[\d ().-]{7,}\d(?:\s|$)/,
  /\b(?:ssn|social security|credit card|passport|date of birth|home address)\b/i,
  /\b(?:my name is|i live at|phone number|email address)\b/i,
  /\b(?:raw\s+)?(?:request|response)\s*(?:body|payload|content)\b/i,
  /\b(?:prompt|chat transcript|conversation transcript|provider output|user (?:input|message|content)|assistant (?:message|response|content))\b/i,
  /^\s*[\[{].*[\]}]\s*$/s,
];

const systemLogs = [];
let dbClient = null;

function setDbClient(client) {
  dbClient = client || null;
}

function normalizeAllowListedValue(value, allowList) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toUpperCase();
  return allowList.has(normalized) ? normalized : null;
}

function sanitizeOperationalMessage(message) {
  if (typeof message !== "string") return null;
  const normalized = message
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    normalized.length === 0 ||
    normalized.length > MAX_LOG_MESSAGE_LENGTH ||
    !ALLOWED_OPERATIONAL_MESSAGES.has(normalized) ||
    SENSITIVE_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return null;
  }
  return normalized;
}

function sanitizeTimestamp(timestamp) {
  if (typeof timestamp !== "string") return null;
  const normalized = timestamp.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return normalized.length > 0 && normalized.length <= 64 ? normalized : null;
}

function sanitizeDiagnosticLog(log) {
  if (!log || typeof log !== "object") return null;
  const level = normalizeAllowListedValue(
    log.severity || log.level,
    ALLOWED_LEVELS,
  );
  const source = normalizeAllowListedValue(
    log.category || log.source,
    ALLOWED_SOURCES,
  );
  const message = sanitizeOperationalMessage(log.message);
  const timestamp = sanitizeTimestamp(log.timestamp);
  if (!level || !source || !message || !timestamp) return null;
  const count =
    Number.isSafeInteger(log.count) && log.count > 0 ? log.count : 1;
  const firstSeen = sanitizeTimestamp(
    log.firstSeen instanceof Date ? log.firstSeen.toISOString() : log.firstSeen,
  );
  const lastSeen = sanitizeTimestamp(
    log.lastSeen instanceof Date ? log.lastSeen.toISOString() : log.lastSeen,
  );
  return {
    timestamp,
    level,
    source,
    category: source,
    severity: level,
    count,
    firstSeen: firstSeen || timestamp,
    lastSeen: lastSeen || timestamp,
    message,
  };
}

function sanitizeDiagnosticLogs(logs) {
  if (!Array.isArray(logs)) return [];
  return logs
    .slice(0, MAX_SYSTEM_LOGS)
    .map(sanitizeDiagnosticLog)
    .filter(Boolean);
}

function retentionDaysFor(severity, category) {
  if (category === "SECURITY" || category === "ADMIN_AUDIT") {
    return RETENTION_DAYS.AUDIT;
  }
  return severity === "INFO" ? RETENTION_DAYS.INFO : RETENTION_DAYS.OPERATIONAL;
}

function eventFingerprint(severity, category, message, now) {
  const window = Math.floor(now.getTime() / AGGREGATION_WINDOW_MS);
  return crypto
    .createHash("sha256")
    .update(`${severity}\0${category}\0${message}\0${window}`)
    .digest("hex");
}

function compactInMemory(entry) {
  const existing = systemLogs.find(
    (candidate) => candidate.fingerprint === entry.fingerprint,
  );
  if (existing) {
    existing.count += 1;
    existing.lastSeen = entry.lastSeen;
    existing.timestamp = entry.timestamp;
    return;
  }
  systemLogs.unshift(entry);
  if (systemLogs.length > MAX_SYSTEM_LOGS) systemLogs.pop();
}

async function addSystemLog(level, source, message, options = {}) {
  try {
    const safeLevel = normalizeAllowListedValue(level, ALLOWED_LEVELS);
    const safeSource = normalizeAllowListedValue(source, ALLOWED_SOURCES);
    const safeMessage = sanitizeOperationalMessage(message);
    if (!safeLevel || !safeSource || !safeMessage) return false;

    const now = options.now instanceof Date ? options.now : new Date();
    const retentionDays = retentionDaysFor(safeLevel, safeSource);
    const fingerprint = eventFingerprint(
      safeLevel,
      safeSource,
      safeMessage,
      now,
    );
    const timestamp = now.toISOString();
    const retentionUntil = new Date(
      now.getTime() + retentionDays * 24 * 60 * 60 * 1000,
    );
    const entry = {
      timestamp,
      level: safeLevel,
      source: safeSource,
      category: safeSource,
      severity: safeLevel,
      message: safeMessage,
      fingerprint,
      count: 1,
      firstSeen: timestamp,
      lastSeen: timestamp,
    };
    compactInMemory(entry);

    try {
      await dbClient?.foundationSystemLog?.upsert({
        where: { fingerprint },
        create: {
          ...entry,
          firstSeen: now,
          lastSeen: now,
          retentionUntil,
        },
        update: {
          count: { increment: 1 },
          timestamp,
          lastSeen: now,
          retentionUntil,
        },
      });
    } catch {
      // Operational telemetry is best-effort and must never affect the app.
    }
    return true;
  } catch {
    return false;
  }
}

async function cleanupExpiredSystemLogs(options = {}) {
  try {
    if (!dbClient?.foundationSystemLog) return 0;
    const now = options.now instanceof Date ? options.now : new Date();
    const requestedBatch = Number(options.batchSize);
    const batchSize = Number.isSafeInteger(requestedBatch)
      ? Math.max(1, Math.min(requestedBatch, CLEANUP_BATCH_SIZE))
      : CLEANUP_BATCH_SIZE;
    const expired = await dbClient.foundationSystemLog.findMany({
      where: { retentionUntil: { lt: now } },
      orderBy: { retentionUntil: "asc" },
      take: batchSize,
      select: { id: true },
    });
    const ids = expired
      .map((row) => row.id)
      .filter((id) => typeof id === "string");
    if (ids.length === 0) return 0;
    const result = await dbClient.foundationSystemLog.deleteMany({
      where: { id: { in: ids } },
    });
    return Math.min(Number(result?.count) || 0, ids.length);
  } catch {
    return 0;
  }
}

function getDiagnostics() {
  let gitStatus = "Unknown";
  try {
    gitStatus = execSync('git log -1 --pretty=format:"%s (%h)"')
      .toString()
      .trim();
  } catch (e) {}

  const stats = getSystemStats();

  return {
    timestamp: new Date().toISOString(),
    gitStatus,
    bridge: {
      bridgeStatus: `🟢 Active (Port ${process.env.PORT || 3000})`,
      serverStatus: "🟢 Merged into canonical backend (TASK-017)",
      uptime: `${Math.floor(process.uptime())} Secs`,
      platform: `${os.platform()} ${os.release()}`,
    },
    providers: [
      {
        name: "Local Llama / Qwen",
        status: "Active in Termux",
        type: "Local Node",
      },
      { name: "Bridge API", status: "Online", type: "Express.js" },
    ],
    hardware: {
      cpu: `${stats.load}% Load`,
      ram: `${stats.usedMem}GB / ${stats.totalMem}GB`,
      arch: stats.arch,
    },
    logs: sanitizeDiagnosticLogs(systemLogs),
  };
}

module.exports = {
  AGGREGATION_WINDOW_MS,
  CLEANUP_BATCH_SIZE,
  MAX_LOG_MESSAGE_LENGTH,
  RETENTION_DAYS,
  addSystemLog,
  cleanupExpiredSystemLogs,
  eventFingerprint,
  getDiagnostics,
  sanitizeDiagnosticLog,
  sanitizeDiagnosticLogs,
  sanitizeOperationalMessage,
  setDbClient,
};
