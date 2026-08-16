import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let activeServer;
let bridgeModule;

const originalListen = http.Server.prototype.listen;

function request(method, reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: activeServer.address().port,
        path: reqPath,
        method,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (_) {}
          resolve({ status: res.statusCode, text, json });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// A fresh scratch directory of fixture audit reports for each test, so the
// real docs/AUDIT_REPORTS/ history is never touched or depended upon for
// the synthetic scenarios (TASK-011 discovery, future tasks, duplicate
// FINAL warnings, etc).
let fixtureDir;

function writeFixture(name, content) {
  fs.writeFileSync(path.join(fixtureDir, name), content, "utf8");
}

beforeAll(async () => {
  process.env.PORT = "0";

  // The real ai/source-api dependencies must resolve even though this
  // suite doesn't exercise them; requiring bridge.cjs pulls them in the
  // same way the existing bridge test does.
  const chatService = require("../ai/AIChatService.cjs");
  vi.spyOn(chatService, "processChatRequest").mockResolvedValue({
    message: { role: "assistant", content: "mocked" },
    provider: { name: "Ollama", type: "local", model: "tinyllama:latest" },
  });

  vi.spyOn(http.Server.prototype, "listen").mockImplementation(
    function (...args) {
      activeServer = this;
      return originalListen.apply(this, args);
    },
  );

  bridgeModule = require("../bridge.cjs");

  await new Promise((resolve, reject) => {
    if (activeServer.listening) return resolve();
    activeServer.once("listening", resolve);
    activeServer.once("error", reject);
  });
});

afterAll(async () => {
  if (activeServer && activeServer.listening) {
    await new Promise((resolve) => activeServer.close(resolve));
  }
});

beforeEach(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-fixture-"));
});

afterEach(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe("buildObservatoryTasks (unit, fixture-driven)", () => {
  it("produces unique task IDs even with several tasks present", () => {
    writeFixture("001_2026-01-01_00-00-00.md", "TASK: TASK-001 — First\nSTATUS: PASS\n");
    writeFixture("002_2026-01-02_00-00-00.md", "TASK: TASK-002 — Second\nSTATUS: PASS\n");
    writeFixture("003_2026-01-03_00-00-00.md", "TASK: TASK-003 — Third\nSTATUS: PASS\n");

    const tasks = bridgeModule.buildObservatoryTasks(fixtureDir);
    const ids = tasks.map((t) => t.task);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
  });

  it("resolves duplicate TASK-008 style reports (FINAL + PENDING) to exactly one card", () => {
    writeFixture(
      "008_PENDING_LOCAL_VERIFICATION.md",
      "TASK: TASK-008 — Pending\nSTATUS: IMPLEMENTATION COMPLETE — LOCAL QUALITY GATES NOT YET RUN\n",
    );
    writeFixture(
      "008_FINAL_AUDIT_REPORT.md",
      "TASK: TASK-008 — Brain <-> Local Termux Capability Discovery\nSTATUS: COMPLETED — VERIFIED\n",
    );

    const tasks = bridgeModule.buildObservatoryTasks(fixtureDir);
    const task008 = tasks.filter((t) => t.task === "TASK-008");

    expect(task008).toHaveLength(1);
  });

  it("prefers the FINAL report over a PENDING report for the same task", () => {
    writeFixture(
      "008_PENDING_LOCAL_VERIFICATION.md",
      "TASK: TASK-008 — Pending\nSTATUS: IMPLEMENTATION COMPLETE — LOCAL QUALITY GATES NOT YET RUN\n",
    );
    writeFixture(
      "008_FINAL_AUDIT_REPORT.md",
      "TASK: TASK-008 — Brain <-> Local Termux Capability Discovery\nSTATUS: COMPLETED — VERIFIED\n",
    );

    const tasks = bridgeModule.buildObservatoryTasks(fixtureDir);
    const task008 = tasks.find((t) => t.task === "TASK-008");

    expect(task008.auditFile).toContain("008_FINAL_AUDIT_REPORT.md");
    expect(task008.status).toMatch(/COMPLETED/i);
  });

  it("emits a console warning (and picks deterministically) when multiple FINAL reports exist for one task", () => {
    writeFixture("020_FINAL_AUDIT_REPORT_A.md", "TASK: TASK-020 — A\nSTATUS: PASS\n");
    writeFixture("020_FINAL_AUDIT_REPORT_B.md", "TASK: TASK-020 — B\nSTATUS: PASS\n");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const tasks = bridgeModule.buildObservatoryTasks(fixtureDir);
      const task020 = tasks.filter((t) => t.task === "TASK-020");

      expect(task020).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Multiple FINAL audit reports found for TASK-020"),
      );

      // Deterministic: running it again gives the same chosen file.
      const tasksAgain = bridgeModule.buildObservatoryTasks(fixtureDir);
      expect(tasksAgain.find((t) => t.task === "TASK-020").auditFile).toBe(
        task020[0].auditFile,
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("discovers TASK-011 automatically when 011_FINAL_AUDIT_REPORT.md exists, with no bridge.cjs changes needed", () => {
    writeFixture(
      "011_FINAL_AUDIT_REPORT.md",
      "**Task:** TASK-011\n**Title:** Audit-driven Observatory\n**Status:** COMPLETED\n\n## 1. Objective\n\nMake Observatory discovery fully audit-driven.\n",
    );

    const tasks = bridgeModule.buildObservatoryTasks(fixtureDir);
    const task011 = tasks.find((t) => t.task === "TASK-011");

    expect(task011).toBeDefined();
    expect(task011.status).toMatch(/COMPLETED/i);
  });

  it("discovers future tasks (e.g. TASK-012) with zero code changes", () => {
    writeFixture("012_FINAL_AUDIT_REPORT.md", "TASK: TASK-012 — Future work\nSTATUS: PASS\n");

    const tasks = bridgeModule.buildObservatoryTasks(fixtureDir);
    expect(tasks.find((t) => t.task === "TASK-012")).toBeDefined();
  });

  it("returns an empty task list when the audit directory does not exist", () => {
    const tasks = bridgeModule.buildObservatoryTasks(
      path.join(fixtureDir, "does-not-exist"),
    );
    expect(tasks).toEqual([]);
  });
});

describe("GET /api/termux-observatory (integration, real repo audit reports)", () => {
  it("returns TASK-009 exactly once", async () => {
    const res = await request("GET", "/api/termux-observatory");
    const matches = res.json.tasks.filter((t) => t.task === "TASK-009");
    expect(matches).toHaveLength(1);
  });

  it("returns TASK-010 exactly once", async () => {
    const res = await request("GET", "/api/termux-observatory");
    const matches = res.json.tasks.filter((t) => t.task === "TASK-010");
    expect(matches).toHaveLength(1);
  });

  it("returns TASK-008 exactly once, resolved from the FINAL report", async () => {
    const res = await request("GET", "/api/termux-observatory");
    const matches = res.json.tasks.filter((t) => t.task === "TASK-008");
    expect(matches).toHaveLength(1);
    expect(matches[0].auditFile).toContain("FINAL");
  });

  it("preserves the existing response shape (title, purpose, work, completed, auditedTasks, progress, tasks, next)", async () => {
    const res = await request("GET", "/api/termux-observatory");

    expect(res.status).toBe(200);
    expect(res.json).toEqual(
      expect.objectContaining({
        title: expect.any(String),
        purpose: expect.any(String),
        work: expect.any(String),
        completed: expect.any(Number),
        auditedTasks: expect.any(Number),
        progress: expect.any(Number),
        tasks: expect.any(Array),
        next: expect.any(String),
      }),
    );

    for (const task of res.json.tasks) {
      expect(task).toEqual(
        expect.objectContaining({
          task: expect.any(String),
          status: expect.any(String),
          passed: expect.any(Boolean),
          objective: expect.any(String),
          implementationSummary: expect.any(String),
          dependencies: expect.any(Array),
          filesByLayer: expect.any(Object),
          commit: expect.any(String),
          auditFile: expect.any(String),
          date: expect.any(String),
          implementer: expect.any(String),
        }),
      );
    }
  });

  it("has no duplicate task IDs across the live response", async () => {
    const res = await request("GET", "/api/termux-observatory");
    const ids = res.json.tasks.map((t) => t.task);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("source: no hardcoded TASK-001..007 task array", () => {
  it("bridge.cjs does not contain a static baseTasks/hardcoded array of TASK-001..007 objects", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../bridge.cjs"),
      "utf8",
    );

    // The old implementation had literal task strings back-to-back inside a
    // hand-written array. Guard against that pattern coming back.
    expect(source).not.toMatch(/task:\s*"TASK-001"[\s\S]*task:\s*"TASK-002"/);
    expect(source).toContain("buildObservatoryTasks");
    expect(source).toContain("resolveAuditGroups");
  });
});
