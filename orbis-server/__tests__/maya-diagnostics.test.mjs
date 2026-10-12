import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { runWithTrace, currentTrace, makeRecord, appendRecord } = require("../ai/maya/MayaDiagnostics.cjs");

describe("private bounded Maya diagnostics", () => {
  it("ignores arbitrary fields and unsafe strings", () => runWithTrace(() => {
    const record = makeRecord("provider.failed", {
      code: "token-secret", model: "token-secret", token: "token-secret",
      message: "birth-secret", userId: "identity-secret", content: "question-secret",
      status: 503, durationMs: 25,
    });
    expect(record.code).toBe("UNKNOWN");
    expect(record.model).toBe("other");
    expect(JSON.stringify(record)).not.toMatch(/secret/);
    expect(makeRecord("token-secret")).toBeNull();
  }));
  it("isolates overlapping asynchronous requests and retains their context", async () => {
    const trace = async () => runWithTrace(async () => {
      const before = currentTrace().id;
      await new Promise(resolve => setTimeout(resolve, 2));
      expect(makeRecord("validation.accepted").correlationId).toBe(before);
      return before;
    });
    const [a, b] = await Promise.all([trace(), trace()]);
    expect(a).not.toBe(b);
    expect(makeRecord("request.start")).toBeNull();
  });
  it("rotates logs, enforces private files and tolerates failed writes", () => {
    const dir = mkdtempSync(join(tmpdir(), "maya-diagnostics-"));
    try {
      const record = runWithTrace(() => makeRecord("request.start"));
      const file = join(dir, "events.jsonl");
      for (let i = 0; i < 5; i++) {
        writeFileSync(file, "x".repeat(512 * 1024));
        appendRecord(record, dir);
      }
      expect(readFileSync(file, "utf8")).toContain(record.correlationId);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(statSync(file + ".1").mode & 0o777).toBe(0o600);
      expect(() => statSync(file + ".4")).toThrow();
      expect(() => appendRecord(record, file)).not.toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
