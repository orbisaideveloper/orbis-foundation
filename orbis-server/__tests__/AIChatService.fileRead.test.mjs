import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let AIChatService;
let memoryEngine;
let providerManager;
let tavilySearch;
let brainRuntime;

const CAPABILITY_FILE_READ = "termux.file.read";

beforeEach(() => {
  vi.resetModules();

  memoryEngine = require("../ai/brain/MemoryEngine.cjs");
  providerManager = require("../ai/AIProviderManager.cjs");
  tavilySearch = require("../ai/tools/TavilySearch.cjs");
  brainRuntime = require("../brain-runtime/brain/BrainRequestGateway.js");
  AIChatService = require("../ai/AIChatService.cjs");

  vi.spyOn(memoryEngine, "retrieveMemory").mockResolvedValue({
    brainKnowledge: null,
    memoryContext: null,
  });
  vi.spyOn(memoryEngine, "learnFromUser").mockResolvedValue(undefined);

  vi.spyOn(providerManager, "getActiveProvider").mockReturnValue({
    generateChat: vi.fn().mockResolvedValue({
      content: "normal ai reply",
      provider: { name: "Ollama", type: "local" },
    }),
  });

  vi.spyOn(tavilySearch, "search").mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TASK-018 (3.A): AIChatService Brain capability routing for termux.file.read", () => {
  it("routes a matched file-read phrase through brainRequestGateway.submit()", async () => {
    const submitSpy = vi
      .spyOn(brainRuntime.brainRequestGateway, "submit")
      .mockResolvedValue({
        success: false,
        requestId: "req-fr-1",
        runtime: "TermuxRuntime",
        error: "AUTHORIZATION_REQUIRE_APPROVAL: Action requires explicit approval",
        durationMs: 1,
      });

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "read file" },
    ]);

    expect(submitSpy).toHaveBeenCalledWith({
      capabilityId: CAPABILITY_FILE_READ,
      input: {},
    });
    expect(result.provider.type).toBe("BRAIN_CAPABILITY");
  });

  it("reports REQUIRE_APPROVAL in plain language and does not fall through to Ollama", async () => {
    vi.spyOn(brainRuntime.brainRequestGateway, "submit").mockResolvedValue({
      success: false,
      requestId: "req-fr-2",
      runtime: "TermuxRuntime",
      error: "AUTHORIZATION_REQUIRE_APPROVAL: needs approval",
      durationMs: 1,
    });

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "please read file" },
    ]);

    expect(result.provider.type).toBe("BRAIN_CAPABILITY");
    expect(result.message.content.toLowerCase()).toContain("approval");
    expect(providerManager.getActiveProvider).not.toHaveBeenCalled();
  });

  it("reports REQUIRE_APPROVAL in Bengali when the matched message was in Bengali", async () => {
    vi.spyOn(brainRuntime.brainRequestGateway, "submit").mockResolvedValue({
      success: false,
      requestId: "req-fr-3",
      runtime: "TermuxRuntime",
      error: "AUTHORIZATION_REQUIRE_APPROVAL: needs approval",
      durationMs: 1,
    });

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "ফাইল দেখাও" },
    ]);

    expect(result.message.content).toContain("অনুমোদন");
  });

  it("does not fall through to Ollama even when the Brain reports success", async () => {
    vi.spyOn(brainRuntime.brainRequestGateway, "submit").mockResolvedValue({
      success: true,
      requestId: "req-fr-4",
      runtime: "TermuxRuntime",
      output: { path: "package.json", content: '{"name":"orbis"}' },
      durationMs: 2,
    });

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "read file" },
    ]);

    expect(result.provider.type).toBe("BRAIN_CAPABILITY");
    expect(result.message.content).toContain("package.json");
    expect(providerManager.getActiveProvider).not.toHaveBeenCalled();
  });

  it("leaves normal conversation untouched (no Brain call for unmatched messages)", async () => {
    const submitSpy = vi.spyOn(brainRuntime.brainRequestGateway, "submit");

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "Hello there" },
    ]);

    expect(submitSpy).not.toHaveBeenCalled();
    expect(result.message.content).toBe("normal ai reply");
  });
});
