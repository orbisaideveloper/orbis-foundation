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
  it("manifests only wired chat routes and callable Admin data routes", () => {
    expect(chatCapabilityRegistry.list().map((item) => item.id)).toEqual([
      "termux.system.info",
      "termux.file.read",
      "web.search.tavily",
      "provider.chat",
      "foundation.table.search",
      "foundation.pdf.read",
      "foundation.xlsx.read",
      "foundation.xlsx.create",
    ]);
    expect(chatCapabilityRegistry.get("foundation.pdf.create")).toBeNull();
    expect(chatCapabilityRegistry.get("foundation.image.inspect")).toBeNull();
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
    expect(execute.mock.calls[0][1].weatherLocationResolved).toBe(true);
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
      expiresAt: NOW - 1_000 + MAX_CLARIFICATION_AGE_MS,
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
    expect(execute.mock.calls.at(-1)[0].at(-1).content).toBe("latest news বলো");

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

  it("keeps an invalid Bengali weather follow-up bounded and never merges it", async () => {
    const pending = {
      kind: "weather-location",
      originalRequest: "আজকের ওয়েদারটা একটু বলবে আমাকে",
      createdAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
    };
    const execute = vi.fn().mockResolvedValue({
      message: { role: "assistant", content: "কোন জায়গার weather?" },
      provider: {
        name: "ORBIS Brain (Web)",
        type: "WEB_SEARCH_CLARIFICATION",
      },
    });
    const orchestrator = new FoundationChatOrchestrator(undefined, () => NOW);
    const result = await orchestrator.orchestrate(
      {
        messages: [{ role: "user", content: "বলবে আমাকে" }],
        pendingClarification: pending,
      },
      execute,
    );

    expect(execute.mock.calls[0][0].at(-1).content).toBe(
      pending.originalRequest,
    );
    expect(result.clarification).toEqual({ state: "pending", pending });
  });

  it("replaces pending weather only with a complete new weather request", async () => {
    const execute = vi.fn().mockResolvedValue({
      message: { role: "assistant", content: "result" },
      provider: { name: "ORBIS Brain (Web)", type: "WEB_SEARCH" },
    });
    const orchestrator = new FoundationChatOrchestrator(undefined, () => NOW);
    const result = await orchestrator.orchestrate(
      {
        messages: [{ role: "user", content: "শিলিগুড়ির weather টা বলো" }],
        pendingClarification: {
          kind: "weather-location",
          originalRequest: "আজকের ওয়েদারটা একটু বলবে আমাকে",
          createdAt: NOW - 1_000,
          expiresAt: NOW + 60_000,
        },
      },
      execute,
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].at(-1).content).toBe(
      "শিলিগুড়ির weather টা বলো",
    );
    expect(result.clarification.state).toBe("replaced");
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
