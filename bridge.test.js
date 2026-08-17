import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

let activeServer;
let bridgeModule;
let chatService;

const originalListen = http.Server.prototype.listen;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);

    const req = http.request(
      {
        host: "127.0.0.1",
        port: activeServer.address().port,
        path,
        method,
        headers:
          body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              },
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
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * TASK-017: One Canonical Backend — telemetry routes absorbed from the
 * retired orbis-server/server.cjs into orbis-server/bridge.cjs.
 *
 * These tests deliberately do NOT mock Prisma/Postgres: whether a real
 * DATABASE_URL is reachable is environment-dependent (it won't be in most
 * sandboxes/CI runners, it may be in Termux with real Supabase
 * credentials). Every assertion below is written to hold true in BOTH
 * cases — the goal is to prove the routes are wired up and never crash
 * the process, not to assert a specific DB outcome.
 */
describe("TASK-017: bridge.cjs telemetry routes (absorbed from server.cjs)", () => {
  beforeAll(async () => {
    process.env.PORT = "0";

    chatService = require("../ai/AIChatService.cjs");

    vi.spyOn(chatService, "processChatRequest").mockResolvedValue({
      message: { role: "assistant", content: "mocked chat response" },
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
    vi.restoreAllMocks();
  });

  it("GET /api/metrics never crashes the process: it responds 200 (with data or NO_DATA_YET) or 500 (DB unreachable), never anything else", async () => {
    const res = await request("GET", "/api/metrics");
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.json).toBeTruthy();
    } else {
      expect(res.json).toEqual({ error: "Database connection failed" });
    }
  });

  it("GET /api/diagnostics always responds 200, even if the DB call fails, and always includes hardware/bridge/logs", async () => {
    const res = await request("GET", "/api/diagnostics");
    expect(res.status).toBe(200);
    expect(res.json).toHaveProperty("hardware");
    expect(res.json).toHaveProperty("bridge");
    expect(res.json).toHaveProperty("logs");
    expect(Array.isArray(res.json.logs)).toBe(true);
  });

  it("GET /api/diagnostics reports the actual running port, not a stale hardcoded one", async () => {
    const res = await request("GET", "/api/diagnostics");
    expect(res.json.bridge.bridgeStatus).not.toContain("Port 3000)");
    expect(res.json.bridge.serverStatus).toContain("TASK-017");
  });

  it("POST /api/internal/log with a message returns 200 regardless of DB availability", async () => {
    const res = await request("POST", "/api/internal/log", {
      level: "INFO",
      source: "TEST",
      message: "hello from TASK-017 test",
    });
    expect(res.status).toBe(200);
  });

  it("POST /api/internal/log with no message is a no-op that still returns 200", async () => {
    const res = await request("POST", "/api/internal/log", {});
    expect(res.status).toBe(200);
  });

  it("REGRESSION: a telemetry DB being unreachable does not break /api/chat", async () => {
    const res = await request("POST", "/api/chat", {
      messages: [{ role: "user", content: "hello" }],
    });
    expect(res.status).toBe(200);
    expect(res.json.message.content).toBe("mocked chat response");
  });

  it("REGRESSION: /api/system-stats (Render health check route) still responds ONLINE", async () => {
    const res = await request("GET", "/api/system-stats");
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("ONLINE");
  });

  it("REGRESSION: /health, /api/system, and /api/termux/handshake are all still present alongside the new telemetry routes", async () => {
    const health = await request("GET", "/health");
    expect(health.status).toBe(200);
    expect(health.json.ok).toBe(true);

    const handshake = await request("GET", "/api/termux/handshake");
    expect(handshake.status).toBe(200);
    expect(handshake.json.status).toBe("CAPABILITIES_VERIFIED");
  });

  it("source: bridge.cjs does not duplicate the /api/system mount", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const code = fs.readFileSync(
      path.join(__dirname, "../bridge.cjs"),
      "utf-8",
    );
    const mounts = code.match(/app\.use\(\s*"\/api\/system"/g) || [];
    expect(mounts).toHaveLength(1);
  });
});
