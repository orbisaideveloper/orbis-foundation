const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const context = new AsyncLocalStorage();
const EVENTS = new Set(["request.start", "request.finish", "auth.accepted", "policy.start", "policy.http", "policy.allowed", "policy.denied", "policy.failed", "generation.start", "generation.failed", "generation.ready", "provider.start", "provider.http", "provider.ready", "provider.failed", "validation.accepted", "validation.rejected", "request.failed"]);
const CODES = new Set(["MAYA_TIMEOUT", "MAYA_POLICY_TIMEOUT", "MAYA_POLICY_UNAVAILABLE", "MAYA_RESULT_INVALID", "PROVIDER_TIMEOUT", "PROVIDER_AUTH_FAILED", "PROVIDER_UNAVAILABLE", "PROVIDER_EMPTY_RESPONSE", "PROVIDER_RESPONSE_REJECTED", "PROVIDER_RESPONSE_INVALID", "UNKNOWN"]);
const MODELS = new Set(["Qwen/Qwen3-8B:fastest", "Qwen/Qwen3-4B:featherless-ai", "Qwen/Qwen2.5-Coder-7B-Instruct:fastest"]);
const REASONS = new Set(["CONTENT_INVALID", "JSON_INVALID", "SCHEMA_INVALID", "CHART_FACTS_MISMATCH", "POLICY_RESPONSE_INVALID", "POLICY_HTTP_ERROR", "POLICY_TRANSPORT_ERROR", "POLICY_TIMEOUT"]);
function safeCode(error) {
  const value = typeof error === "string" ? error : error?.code || error?.message;
  return CODES.has(value) || /^PROVIDER_UNAVAILABLE_[1-5]\d{2}$/u.test(value || "") ? value : "UNKNOWN";
}
function runWithTrace(fn) {
  return context.run({ id: randomUUID(), startedAt: Date.now() }, fn);
}
function makeRecord(event, fields = {}, trace = context.getStore()) {
  if (!trace || !EVENTS.has(event)) return null;
  const record = { version: 1, timestamp: new Date().toISOString(), correlationId: trace.id, event };
  for (const key of ["durationMs", "status", "contentLength", "completionTokens"]) {
    if (Number.isSafeInteger(fields[key]) && fields[key] >= 0 && fields[key] <= 1e9) record[key] = fields[key];
  }
  if (["general.chat", "dream.analysis", "astro.interpretation"].includes(fields.capability)) record.capability = fields.capability;
  if (["auth", "policy", "provider"].includes(fields.phase)) record.phase = fields.phase;
  if (fields.code !== undefined) record.code = safeCode(fields.code);
  if (REASONS.has(fields.reason)) record.reason = fields.reason;
  if (fields.model !== undefined) record.model = MODELS.has(fields.model) ? fields.model : "other";
  if (["stop", "length", "content_filter", "tool_calls"].includes(fields.finishReason)) record.finishReason = fields.finishReason;
  if (typeof fields.reasoningPresent === "boolean") record.reasoningPresent = fields.reasoningPresent;
  return record;
}
// Bounded, owner-private local logs. Diagnostics must never affect availability.
function appendRecord(record, directory = path.join(os.homedir(), ".config/orbis/maya-diagnostics")) {
  if (!record) return;
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(directory).isSymbolicLink()) return;
    fs.chmodSync(directory, 0o700);
    const file = path.join(directory, "events.jsonl");
    for (const suffix of ["", ".1", ".2", ".3"]) {
      const existing = file + suffix;
      if (fs.existsSync(existing)) {
        if (fs.lstatSync(existing).isSymbolicLink()) return;
        fs.chmodSync(existing, 0o600);
      }
    }
    if (fs.existsSync(file) && fs.statSync(file).size >= 512 * 1024) {
      for (let i = 2; i >= 1; i--) {
        const from = `${file}.${i}`, to = `${file}.${i + 1}`;
        if (fs.existsSync(from)) fs.renameSync(from, to);
      }
      fs.renameSync(file, `${file}.1`);
    }
    fs.appendFileSync(file, JSON.stringify(record) + "\n", { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  } catch { /* Read-only/full disks cannot break a request. */ }
}
function logEvent(event, fields, trace) {
  const record = makeRecord(event, fields, trace);
  if (process.env.NODE_ENV !== "test") appendRecord(record);
}
function currentTrace() { return context.getStore(); }
module.exports = { runWithTrace, currentTrace, makeRecord, appendRecord, logEvent, safeCode };
