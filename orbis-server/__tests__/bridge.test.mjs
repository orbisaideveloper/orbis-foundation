import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";

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

          resolve({
            status: res.statusCode,
            headers: res.headers,
            text,
            json,
          });
        });
      },
    );

    req.on("error", reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

describe("ORBiS Server Bridge API", () => {
  beforeAll(async () => {
    process.env.PORT = "0";

    chatService = require("../ai/AIChatService.cjs");

    vi.spyOn(chatService, "processChatRequest").mockResolvedValue({
      message: {
        role: "assistant",
        content: "mocked chat response",
      },
      provider: {
        name: "Ollama",
        type: "local",
        model: "tinyllama:latest",
      },
    });

    vi.spyOn(http.Server.prototype, "listen").mockImplementation(function (
      ...args
    ) {
      activeServer = this;
      return originalListen.apply(this, args);
    });

    bridgeModule = require("../bridge.cjs");

    await new Promise((resolve, reject) => {
      const started = () => resolve();

      if (activeServer.listening) {
        resolve();
        return;
      }

      activeServer.once("listening", started);
      activeServer.once("error", reject);
    });
  });

  afterAll(async () => {
    if (activeServer && activeServer.listening) {
      await new Promise((resolve) => activeServer.close(resolve));
    }

    vi.restoreAllMocks();
  });

  it("GET /api/system-stats returns system metrics", async () => {
    const res = await request("GET", "/api/system-stats");

    expect(res.status).toBe(200);
    expect(res.json.status).toBe("ONLINE");
    expect(res.json).toHaveProperty("cpuCores");
    expect(res.json).toHaveProperty("cpuModel");
    expect(res.json).toHaveProperty("ramUsedPercent");
    expect(res.json).toHaveProperty("uptime");
  });

  it("GET /api/ai/providers/status returns the real active provider", async () => {
    const res = await request("GET", "/api/ai/providers/status");

    expect(res.status).toBe(200);
    expect(res.json.activeProvider).toBeDefined();
    expect(res.json.activeProvider.name).toBe("Ollama");
    expect(res.json.allProviders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Ollama",
        }),
      ]),
    );
  });

  it("POST /api/chat rejects requests without a verified session", async () => {
    const messages = [
      {
        role: "user",
        content: "Hello ORBiS",
      },
    ];

    const res = await request("POST", "/api/chat", { messages });

    expect(res.status).toBe(401);
    expect(chatService.processChatRequest).not.toHaveBeenCalled();
  });

  it("POST /api/chat does not validate or expose errors before authentication", async () => {
    const res = await request("POST", "/api/chat", {
      messages: [],
    });

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.json)).not.toContain("Invalid chat format");
  });

  it("GET /api/termux-observatory returns observatory data", async () => {
    const res = await request("GET", "/api/termux-observatory");

    expect(res.status).toBe(200);
    expect(res.status).toBe(200);
  });

  it("POST /api/orbis-command handles tree command", async () => {
    const res = await request("POST", "/api/orbis-command", {
      command: "tree",
    });

    expect(res.status).toBe(200);
    expect(res.json.result).toContain("LIVE SOURCE CODE DIRECTORY");
  });

  it("POST /api/orbis-command handles Bengali tree command", async () => {
    const res = await request("POST", "/api/orbis-command", {
      command: "ট্রি",
    });

    expect(res.status).toBe(200);
    expect(res.json.result).toContain("LIVE SOURCE CODE DIRECTORY");
  });

  it("POST /api/orbis-command strips ai prefix before sending to Ollama", async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      body: null,
    });

    try {
      const res = await request("POST", "/api/orbis-command", {
        command: "ai: status",
      });

      expect(res.status).toBe(503);
      expect(res.json.result).toContain("AI Server Error");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/generate"),
        expect.objectContaining({
          method: "POST",
        }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("POST /api/orbis-command streams Ollama response", async () => {
    const originalFetch = global.fetch;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            JSON.stringify({
              response: "System Initialized.",
            }) + "\n",
          ),
        );

        controller.enqueue(
          new TextEncoder().encode(
            JSON.stringify({
              response: " ORBiS Ready.",
            }) + "\n",
          ),
        );

        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });

    try {
      const res = await request("POST", "/api/orbis-command", {
        command: "status",
      });

      expect(res.status).toBe(200);
      expect(res.text).toContain("System Initialized.");
      expect(res.text).toContain("ORBiS Ready.");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("POST /api/orbis-command sanitizes provider errors when Ollama fetch rejects", async () => {
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));

    try {
      const res = await request("POST", "/api/orbis-command", {
        command: "hello",
      });

      expect(res.status).toBe(503);
      expect(res.json.result).toBe("AI provider unavailable.");
      expect(res.json.result).not.toContain("connection refused");
    } finally {
      global.fetch = originalFetch;
    }
  });

  // TASK-018/019: POST /api/termux/capability — termux.file.read handler.
  // This route is the last line of defense (defense-in-depth): even if
  // every upstream authorization layer were somehow bypassed, this
  // handler itself still refuses anything but the two hardcoded
  // allow-listed keys.
  describe("POST /api/termux/capability — termux.file.read", () => {
    it("reads package.json when given the exact allow-listed key", async () => {
      const res = await request("POST", "/api/termux/capability", {
        capability: "termux.file.read",
        input: { path: "package.json" },
      });

      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
      expect(res.json.data.path).toBe("package.json");
      expect(res.json.data.content).toContain("orbis-foundation");
    });

    it("reads README.md when given the exact allow-listed key", async () => {
      const res = await request("POST", "/api/termux/capability", {
        capability: "termux.file.read",
        input: { path: "README.md" },
      });

      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
      expect(res.json.data.path).toBe("README.md");
    });

    it("returns PATH_REQUIRED when no path is given (the exact TASK-019 symptom)", async () => {
      const res = await request("POST", "/api/termux/capability", {
        capability: "termux.file.read",
        input: {},
      });

      expect(res.status).toBe(400);
      expect(res.json.error).toBe("PATH_REQUIRED");
    });

    it("rejects a traversal-style path", async () => {
      const res = await request("POST", "/api/termux/capability", {
        capability: "termux.file.read",
        input: { path: "../../etc/passwd" },
      });

      expect(res.status).toBe(403);
      expect(res.json.error).toBe("PATH_NOT_ALLOWED");
    });

    it("rejects an absolute path", async () => {
      const res = await request("POST", "/api/termux/capability", {
        capability: "termux.file.read",
        input: { path: "/etc/passwd" },
      });

      expect(res.status).toBe(403);
      expect(res.json.error).toBe("PATH_NOT_ALLOWED");
    });

    it("rejects a filename that is not in the allow-list", async () => {
      const res = await request("POST", "/api/termux/capability", {
        capability: "termux.file.read",
        input: { path: "server.cjs" },
      });

      expect(res.status).toBe(403);
      expect(res.json.error).toBe("PATH_NOT_ALLOWED");
    });
  });
});
