// @vitest-environment node
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const diagnostics = require("../ai/maya/MayaDiagnostics.cjs");
const EVENT = "provider.ready";
const LOG_NAME = "events.jsonl";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("allowlists diagnostic metadata without leaking arbitrary values", () => {
  const trace = { id: "fixture-correlation" };
  const fields = { capability: "dream.analysis", phase: "provider", code: "PROVIDER_TIMEOUT", reason: "JSON_INVALID",
    model: "Qwen/Qwen3-8B:fastest", finishReason: "stop", reasoningPresent: false,
    status: 200, durationMs: 0, contentLength: 100, completionTokens: 10, token: "never-log-this" };
  const record = diagnostics.makeRecord(EVENT, fields, trace);
  expect(record).toMatchObject({ correlationId: trace.id, ...Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "token")) });
  expect(record).not.toHaveProperty("token");
  expect(diagnostics.makeRecord(EVENT, { capability: "unknown", phase: "unknown", status: -1, durationMs: 1.2,
    contentLength: 1e9 + 1, completionTokens: Number.NaN, finishReason: "unknown", reasoningPresent: "true" }, trace))
    .not.toHaveProperty("capability");
  expect(diagnostics.makeRecord(EVENT, {}, null)).toBeNull();
  expect(diagnostics.safeCode(null)).toBe("UNKNOWN");
  expect(diagnostics.safeCode({ message: "MAYA_TIMEOUT" })).toBe("MAYA_TIMEOUT");
  expect(diagnostics.safeCode({ code: "PROVIDER_UNAVAILABLE_503" })).toBe("PROVIDER_UNAVAILABLE_503");
});

it("never follows directory or rotated-file symlinks", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "orbis-log-links-"));
  const target = path.join(directory, "private-target");
  const logs = path.join(directory, "logs");
  const alias = path.join(directory, "alias");
  try {
    fs.mkdirSync(logs);
    fs.writeFileSync(target, "preserve");
    fs.symlinkSync(logs, alias);
    const record = diagnostics.runWithTrace(() => diagnostics.makeRecord(EVENT));
    diagnostics.appendRecord(null, logs);
    diagnostics.appendRecord(record, alias);
    expect(fs.existsSync(path.join(logs, LOG_NAME))).toBe(false);
    fs.symlinkSync(target, path.join(logs, LOG_NAME + ".2"));
    diagnostics.appendRecord(record, logs);
    expect(fs.readFileSync(target, "utf8")).toBe("preserve");
    expect(fs.existsSync(path.join(logs, LOG_NAME))).toBe(false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

it("writes traced events in production and skips persistence in tests", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "orbis-log-home-"));
  vi.spyOn(os, "homedir").mockReturnValue(directory);
  try {
    vi.stubEnv("NODE_ENV", "production");
    diagnostics.runWithTrace(() => diagnostics.logEvent(EVENT));
    const file = path.join(directory, ".config/orbis/maya-diagnostics", LOG_NAME);
    const before = fs.readFileSync(file, "utf8");
    expect(JSON.parse(before).event).toBe(EVENT);
    vi.stubEnv("NODE_ENV", "test");
    diagnostics.runWithTrace(() => diagnostics.logEvent(EVENT));
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
