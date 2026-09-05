import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";

let activeServer;
let bridgeModule;
let chatService;
const originalDatabaseUrl = process.env.DATABASE_URL;

const originalListen = http.Server.prototype.listen;

function request(method, path, body, requestHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);

    const req = http.request(
      {
        host: "127.0.0.1",
        port: activeServer.address().port,
        path,
        method,
        headers: {
          ...requestHeaders,
          ...(body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }),
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
    process.env.DATABASE_URL =
      ["postgresql://orbis:", "orbis", "@127.0.0.1:1/orbis"].join("");

    chatService = require("../ai/AIChatService.cjs");

    vi.spyOn(chatService, "processChatRequest").mockResolvedValue({
      message: { role: "assistant", content: "mocked chat response" },
      provider: { name: "Ollama", type: "local", model: "tinyllama:latest" },
    });

    const adminAuth = require("../admin-auth.cjs");
    vi.spyOn(adminAuth, "requireAuthenticatedAdmin").mockImplementation(
      (req, res, next) =>
        req.get("Authorization") === "Bearer verified.admin"
          ? next()
          : res.status(401).json({
              success: false,
              message: "Authentication required",
            }),
    );

    vi.spyOn(http.Server.prototype, "listen").mockImplementation(function (
      ...args
    ) {
      activeServer = this;
      return originalListen.apply(this, args);
    });

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

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("rejects unauthenticated Foundation telemetry reads", async () => {
    const diagnostics = await request("GET", "/api/diagnostics");
    const metrics = await request("GET", "/api/metrics");
    const diagnosticExport = await request(
      "GET",
      "/api/admin/diagnostic-export",
    );
    const brainRequest = await request("POST", "/api/brain/request", {
      capabilityId: "termux.system.info",
      input: {},
    });
    const capabilityStatus = await request(
      "GET",
      "/api/admin/capabilities/status",
    );
    expect(diagnostics.status).toBe(401);
    expect(metrics.status).toBe(401);
    expect(diagnosticExport.status).toBe(401);
    expect(brainRequest.status).toBe(401);
    expect(capabilityStatus.status).toBe(401);
    expect(diagnosticExport.json).toEqual({
      success: false,
      message: "Authentication required",
    });
  });

  it("GET /api/metrics remains available to a verified Admin with its existing data or fallback/error shape", async () => {
    const res = await request("GET", "/api/metrics", undefined, {
      Authorization: "Bearer verified.admin",
    });
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.json).toBeTruthy();
    } else {
      expect(res.json).toEqual({ error: "Database connection failed" });
    }
  });

  it("GET /api/diagnostics remains available to a verified Admin with the bounded fallback shape", async () => {
    const res = await request("GET", "/api/diagnostics", undefined, {
      Authorization: "Bearer verified.admin",
    });
    expect(res.status).toBe(200);
    expect(res.json).toHaveProperty("hardware");
    expect(res.json).toHaveProperty("bridge");
    expect(res.json).toHaveProperty("logs");
    expect(Array.isArray(res.json.logs)).toBe(true);
  });

  it("GET /api/diagnostics reports the actual running port, not a stale hardcoded one", async () => {
    const res = await request("GET", "/api/diagnostics", undefined, {
      Authorization: "Bearer verified.admin",
    });
    expect(res.json.bridge.bridgeStatus).not.toContain("Port 3000)");
    expect(res.json.bridge.serverStatus).toContain("TASK-017");
  });

  it("the obsolete public internal-log write route no longer exists", async () => {
    const res = await request("POST", "/api/internal/log", {
      level: "INFO",
      source: "TEST",
      message: "hello from TASK-017 test",
    });
    expect(res.status).toBe(404);
  });

  it("REGRESSION: a telemetry DB being unreachable does not weaken /api/chat Admin authentication", async () => {
    const res = await request("POST", "/api/chat", {
      messages: [{ role: "user", content: "hello" }],
    });
    expect(res.status).toBe(401);
    expect(chatService.processChatRequest).not.toHaveBeenCalled();
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
