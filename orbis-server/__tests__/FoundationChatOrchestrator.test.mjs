// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  FoundationChatOrchestrator,
  MAX_CLARIFICATION_AGE_MS,
} = require("../ai/FoundationChatOrchestrator.cjs");
const { chatCapabilityRegistry } = require("../ai/ChatCapabilityRegistry.cjs");

const NOW = 1_800_000_000_000;

describe("FoundationChatOrchestrator clarification continuity", () => {
  it("manifests only wired Foundation, Tavily, and provider routes", () => {
    expect(chatCapabilityRegistry.list().map((item) => item.id)).toEqual([
      "termux.system.info",
      "termux.file.read",
      "web.search.tavily",
      "provider.chat",
    ]);
    expect(JSON.stringify(chatCapabilityRegistry.list())).not.toMatch(
      /pdf|xlsx|spreadsheet|attachment|image/i,
    );
  });
  it("reconstructs the Bengali weather request from a short location answer", async () => {
    const execute = vi.fn().mockResolvedValue({
      message: { role: "assistant", content: "কলকাতার weather result" },
      provider: { name: "ORBIS Brain (Web)", type: "WEB_SEARCH" },
    });
    const orchestrator = new FoundationChatOrchestrator(undefined, () => NOW);
    const result = await orchestrator.orchestrate(
      {
        messages: [{ role: "user", content: "কলকাতা" }],
        pendingClarification: {
          kind: "weather-location",
          originalRequest: "আজকের weather বলো",
          createdAt: NOW - 1_000,
          expiresAt: NOW + 60_000,
        },
      },
      execute,
    );

    expect(execute.mock.calls[0][0].at(-1).content).toBe(
      "আজকের weather বলো কলকাতা",
    );
    expect(execute.mock.calls[0][1].route).toBe("web-search");
    expect(result.clarification.state).toBe("resolved");
  });

  it("reconstructs a file clarification without weakening capability routing", async () => {
    const execute = vi.fn().mockResolvedValue({
      message: { role: "assistant", content: "approval required" },
      provider: { name: "ORBIS Brain", type: "BRAIN_CAPABILITY" },
    });
    const orchestrator = new FoundationChatOrchestrator(undefined, () => NOW);
    await orchestrator.orchestrate(
      {
        messages: [{ role: "user", content: "package.json" }],
        pendingClarification: {
          kind: "capability-input",
          originalRequest: "read file",
          createdAt: NOW - 1_000,
          expiresAt: NOW + 60_000,
        },
      },
      execute,
    );
    expect(execute.mock.calls[0][0].at(-1).content).toBe(
      "read file package.json",
    );
    expect(execute.mock.calls[0][1]).toMatchObject({
      route: "foundation-capability",
      capabilityId: "termux.file.read",
    });
  });

  it("supports cancellation, replacement, and expiry without merging", async () => {
    const pending = {
      kind: "weather-location",
      originalRequest: "today weather",
      createdAt: NOW - 1_000,
      expiresAt: NOW + MAX_CLARIFICATION_AGE_MS,
    };
    const orchestrator = new FoundationChatOrchestrator(undefined, () => NOW);
    const execute = vi.fn().mockResolvedValue({
      message: { role: "assistant", content: "ok" },
      provider: { name: "Ollama", type: "local" },
    });

    const cancelled = await orchestrator.orchestrate(
      {
        messages: [{ role: "user", content: "বাতিল" }],
        pendingClarification: pending,
      },
      execute,
    );
    expect(cancelled.clarification.state).toBe("cancelled");
    expect(cancelled.route).toBe("clarification-cancel");
    expect(execute).not.toHaveBeenCalled();

    const replaced = await orchestrator.orchestrate(
      {
        messages: [{ role: "user", content: "latest news বলো" }],
        pendingClarification: pending,
      },
      execute,
    );
    expect(replaced.clarification.state).toBe("replaced");

    const expired = await orchestrator.orchestrate(
      {
        messages: [{ role: "user", content: "কলকাতা" }],
        pendingClarification: { ...pending, expiresAt: NOW - 1 },
      },
      execute,
    );
    expect(expired.clarification.state).toBe("expired");
    expect(execute.mock.calls.at(-1)[0].at(-1).content).toBe("কলকাতা");
  });

  it("records only deterministic route-selection duration", async () => {
    let tick = 100;
    const orchestrator = new FoundationChatOrchestrator(
      undefined,
      () => tick++,
    );
    const result = await orchestrator.orchestrate(
      { messages: [{ role: "user", content: "hello" }] },
      async () => ({
        message: { role: "assistant", content: "hi" },
        provider: { name: "Ollama", type: "local" },
      }),
    );
    expect(result.routingDurationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(result)).not.toContain("hello");
  });
});
