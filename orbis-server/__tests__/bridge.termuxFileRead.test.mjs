import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";

/**
 * TASK-018 (Section 3.A) — termux.file.read
 *
 * Direct HTTP-level tests against POST /api/termux/capability, mirroring
 * the existing bridge.test.mjs harness pattern. These test the hardcoded
 * allow-list enforcement in bridge.cjs directly (not through the full
 * Brain/authorization chain, since a SENSITIVE capability like
 * termux.file.read is always resolved to REQUIRE_APPROVAL before it would
 * ever reach this handler in production — see
 * TermuxRuntimeServiceFileRead.test.ts and AIChatService.fileRead.test.mjs
 * for that layer).
 */

let activeServer;
let chatService;

const originalListen = http.Server.prototype.listen;

const CAPABILITY_FILE_READ = "termux.file.read";
const CAPABILITY_SYSTEM_INFO = "termux.system.info";
const ALLOWED_KEY = "package.json";

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
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("TASK-018 (3.A): POST /api/termux/capability — termux.file.read", () => {
  beforeAll(async () => {
    process.env.PORT = "0";

    chatService = require("../ai/AIChatService.cjs");
    vi.spyOn(chatService, "processChatRequest").mockResolvedValue({
      message: { role: "assistant", content: "mocked chat response" },
      provider: { name: "Ollama", type: "local", model: "tinyllama:latest" },
    });

    vi.spyOn(http.Server.prototype, "listen").mockImplementation(function (
      ...args
    ) {
      activeServer = this;
      return originalListen.apply(this, args);
    });

    require("../bridge.cjs");

    await new Promise((resolve, reject) => {
      if (activeServer.listening) {
        resolve();
        return;
      }
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

  it("reads an allow-listed file successfully", async () => {
    const res = await request("POST", "/api/termux/capability", {
      capability: CAPABILITY_FILE_READ,
      input: { path: ALLOWED_KEY },
    });

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.capability).toBe(CAPABILITY_FILE_READ);
    expect(res.json.data.path).toBe(ALLOWED_KEY);
    expect(typeof res.json.data.content).toBe("string");
    expect(res.json.data.content.length).toBeGreaterThan(0);
  });

  it("rejects a disallowed (not-in-allow-list) key", async () => {
    const res = await request("POST", "/api/termux/capability", {
      capability: CAPABILITY_FILE_READ,
      input: { path: "secrets.env" },
    });

    expect(res.status).toBe(403);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("PATH_NOT_ALLOWED");
  });

  it("rejects a path traversal attempt", async () => {
    const res = await request("POST", "/api/termux/capability", {
      capability: CAPABILITY_FILE_READ,
      input: { path: "../../../../etc/passwd" },
    });

    expect(res.status).toBe(403);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("PATH_NOT_ALLOWED");
  });

  it("rejects an absolute filesystem path", async () => {
    const res = await request("POST", "/api/termux/capability", {
      capability: CAPABILITY_FILE_READ,
      input: { path: "/etc/passwd" },
    });

    expect(res.status).toBe(403);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("PATH_NOT_ALLOWED");
  });

  it("rejects a missing path with PATH_REQUIRED", async () => {
    const res = await request("POST", "/api/termux/capability", {
      capability: CAPABILITY_FILE_READ,
    });

    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("PATH_REQUIRED");
  });

  it("rejects command/exec/shell/args fields, same as every other capability", async () => {
    const res = await request("POST", "/api/termux/capability", {
      capability: CAPABILITY_FILE_READ,
      input: { path: ALLOWED_KEY },
      exec: "rm -rf /",
    });

    expect(res.status).toBe(403);
    expect(res.json.error).toBe("CAPABILITY_NOT_AUTHORIZED");
  });

  it("does not change existing termux.system.info behavior", async () => {
    const res = await request("POST", "/api/termux/capability", {
      capability: CAPABILITY_SYSTEM_INFO,
    });

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.capability).toBe(CAPABILITY_SYSTEM_INFO);
    expect(res.json.data).toHaveProperty("platform");
    expect(res.json.data).toHaveProperty("nodeVersion");
  });
});
