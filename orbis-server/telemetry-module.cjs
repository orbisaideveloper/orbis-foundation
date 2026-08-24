const os = require("node:os");
const { execSync } = require("node:child_process");

const MAX_SYSTEM_LOGS = 100;
const MAX_LOG_MESSAGE_LENGTH = 240;
const ALLOWED_LEVELS = new Set(["INFO", "WARN", "ERROR"]);
const ALLOWED_SOURCES = new Set([
  "DATABASE",
  "FOUNDATION",
  "BRIDGE",
  "SYSTEM",
  "TELEMETRY",
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
  const level = normalizeAllowListedValue(log.level, ALLOWED_LEVELS);
  const source = normalizeAllowListedValue(log.source, ALLOWED_SOURCES);
  const message = sanitizeOperationalMessage(log.message);
  const timestamp = sanitizeTimestamp(log.timestamp);
  if (!level || !source || !message || !timestamp) return null;
  return { timestamp, level, source, message };
}

function sanitizeDiagnosticLogs(logs) {
  if (!Array.isArray(logs)) return [];
  return logs
    .slice(0, MAX_SYSTEM_LOGS)
    .map(sanitizeDiagnosticLog)
    .filter(Boolean);
}

async function addSystemLog(level, source, message) {
  try {
    const safeLevel = normalizeAllowListedValue(level, ALLOWED_LEVELS);
    const safeSource = normalizeAllowListedValue(source, ALLOWED_SOURCES);
    const safeMessage = sanitizeOperationalMessage(message);
    if (!safeLevel || !safeSource || !safeMessage) return false;

    const entry = {
      timestamp: new Date().toISOString(),
      level: safeLevel,
      source: safeSource,
      message: safeMessage,
    };
    systemLogs.unshift(entry);
    if (systemLogs.length > MAX_SYSTEM_LOGS) systemLogs.pop();

    try {
      await dbClient?.foundationSystemLog?.create({ data: entry });
    } catch {
      // Operational telemetry is best-effort and must never affect the app.
    }
    return true;
  } catch {
    return false;
  }
}

function getDiagnostics() {
  let gitStatus = "Unknown";
  try {
    gitStatus = execSync('git log -1 --pretty=format:"%s (%h)"')
      .toString()
      .trim();
  } catch (e) {}

  const totalRam = os.totalmem() / 1024 ** 3;
  const freeRam = os.freemem() / 1024 ** 3;
  const usedRam = totalRam - freeRam;
  const cpus = os.cpus();
  const load =
    cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + (total - idle) / total;
    }, 0) / cpus.length;

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
      cpu: `${(load * 100).toFixed(2)}% Load`,
      ram: `${usedRam.toFixed(2)}GB / ${totalRam.toFixed(2)}GB`,
      arch: os.arch(),
    },
    logs: sanitizeDiagnosticLogs(systemLogs),
  };
}

module.exports = {
  MAX_LOG_MESSAGE_LENGTH,
  addSystemLog,
  getDiagnostics,
  sanitizeDiagnosticLog,
  sanitizeDiagnosticLogs,
  sanitizeOperationalMessage,
  setDbClient,
};
