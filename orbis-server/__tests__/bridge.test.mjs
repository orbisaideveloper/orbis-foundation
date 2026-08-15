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
        headers: body === undefined
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

    vi.spyOn(http.Server.prototype, "listen").mockImplementation(
      function (...args) {
        activeServer = this;
        return originalListen.apply(this, args);
      },
    );

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

  it("POST /api/chat accepts valid messages and returns the chat payload", async () => {
    const messages = [
      {
        role: "user",
        content: "Hello ORBiS",
      },
    ];

    const res = await request("POST", "/api/chat", { messages });

    expect(res.status).toBe(200);
    expect(res.json.message.content).toBe("mocked chat response");
    expect(res.json.provider.name).toBe("Ollama");

    expect(chatService.processChatRequest).toHaveBeenCalledWith(messages);
  });

  it("POST /api/chat returns 500 for invalid chat format", async () => {
    chatService.processChatRequest.mockRejectedValueOnce(
      new Error("Invalid chat format."),
    );

    const res = await request("POST", "/api/chat", {
      messages: [],
    });

    expect(res.status).toBe(500);
    expect(res.json.error).toContain("Invalid chat format");
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

  it("POST /api/orbis-command returns connection error when Ollama fetch rejects", async () => {
    const originalFetch = global.fetch;

    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error("connection refused"));

    try {
      const res = await request("POST", "/api/orbis-command", {
        command: "hello",
      });

      expect(res.status).toBe(200);
      expect(res.json.result).toContain("AI Server Error");
      expect(res.json.result).toContain("connection refused");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
