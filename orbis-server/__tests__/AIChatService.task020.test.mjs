import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let AIChatService;
let memoryEngine;
let providerManager;
let tavilySearch;
let brainRuntime;

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
  vi.spyOn(brainRuntime.brainRequestGateway, "submit");

  vi.spyOn(providerManager, "getActiveProvider").mockReturnValue({
    generateChat: vi.fn().mockResolvedValue({
      content: "normal ai reply",
      provider: { name: "Ollama", type: "local" },
    }),
  });

  vi.spyOn(tavilySearch, "search").mockResolvedValue(
    "[stub tavily answer]",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TASK-020 Phase 1-A: 'ওয়েদার' temporal keyword fix", () => {
  const regressionCases = [
    "আজকের আবহাওয়া কেমন?",
    "আজকের weather কেমন?",
    "আজকের ওয়েদার কেমন?",
    "Siliguri weather বলো",
    "শিলিগুড়ির weather টা বলো",
    "আমি শিলিগুড়ি ওয়েদার রিপোর্ট চেয়েছি ঢাকার না",
  ];

  it.each(regressionCases)(
    "%s -> reaches the realtime/web-search path, never falls through to Ollama",
    async (message) => {
      const result = await AIChatService.processChatRequest([
        { role: "user", content: message },
      ]);

      expect(providerManager.getActiveProvider).not.toHaveBeenCalled();
      expect(["WEB_SEARCH", "WEB_SEARCH_CLARIFICATION"]).toContain(
        result.provider.type,
      );
    },
  );

  it("a message with no temporal/weather keyword at all still falls through to Ollama (unchanged baseline)", async () => {
    const result = await AIChatService.processChatRequest([
      { role: "user", content: "Hello" },
    ]);

    expect(providerManager.getActiveProvider).toHaveBeenCalled();
    expect(result.message.content).toBe("normal ai reply");
  });
});

describe("TASK-020 Phase 1-B: realtime context safety (no silent default location)", () => {
  it("a weather question with no location asks for clarification and does NOT call Tavily", async () => {
    const result = await AIChatService.processChatRequest([
      { role: "user", content: "আজকের weather report দাও" },
    ]);

    expect(tavilySearch.search).not.toHaveBeenCalled();
    expect(result.provider.type).toBe("WEB_SEARCH_CLARIFICATION");
    expect(result.message.content).toContain("জায়গার");
  });

  it("the same clarification is asked in English when the message was English", async () => {
    const result = await AIChatService.processChatRequest([
      { role: "user", content: "give me today's weather report" },
    ]);

    expect(tavilySearch.search).not.toHaveBeenCalled();
    expect(result.message.content.toLowerCase()).toContain("location");
  });

  it("a weather question WITH a location proceeds to Tavily, and the location is preserved verbatim (never invented)", async () => {
    const message = "শিলিগুড়ির weather টা বলো";

    await AIChatService.processChatRequest([
      { role: "user", content: message },
    ]);

    expect(tavilySearch.search).toHaveBeenCalledWith(message, "bn");
  });

  it("never invents a specific city (Dhaka/Kolkata/etc.) anywhere in the clarification reply", async () => {
    const result = await AIChatService.processChatRequest([
      { role: "user", content: "আজকের আবহাওয়া কেমন?" },
    ]);

    const forbidden = ["dhaka", "ঢাকা", "kolkata", "কলকাতা"];
    const lowerContent = result.message.content.toLowerCase();
    for (const city of forbidden) {
      expect(lowerContent).not.toContain(city);
    }
  });

  it("non-weather temporal queries (news/price/latest) are unaffected by the weather-only safety check", async () => {
    const result = await AIChatService.processChatRequest([
      { role: "user", content: "latest news update" },
    ]);

    expect(tavilySearch.search).toHaveBeenCalled();
    expect(result.provider.type).toBe("WEB_SEARCH");
  });
});

describe("TASK-020 Phase 1-D: Tavily language steering (best-effort)", () => {
  it("passes 'bn' for a Bengali message", async () => {
    const message = "শিলিগুড়ির weather টা বলো";
    await AIChatService.processChatRequest([
      { role: "user", content: message },
    ]);
    expect(tavilySearch.search).toHaveBeenCalledWith(message, "bn");
  });

  it("detectLanguage() (not a guess) decides steering — 'বলো' makes this Bengali even though the message also contains English words", async () => {
    const message = "Siliguri weather বলো";
    // contains Bengali script ("বলো"), so detectLanguage() -> "bn" per its
    // existing, unmodified implementation; verifies the real function is
    // used rather than assuming pure-English detection from mixed input
    await AIChatService.processChatRequest([
      { role: "user", content: message },
    ]);
    expect(tavilySearch.search).toHaveBeenCalledWith(message, "bn");
  });

  it("passes 'en' for a message with no Bengali script at all", async () => {
    const message = "latest stock price today";
    await AIChatService.processChatRequest([
      { role: "user", content: message },
    ]);
    expect(tavilySearch.search).toHaveBeenCalledWith(message, "en");
  });
});

describe("TASK-020 Phase 1-E: Ollama anti-fabrication system message", () => {
  it("prepends exactly one system message before generateChat() is called, for an unmatched (fallback) message", async () => {
    let capturedMessages;
    vi.spyOn(providerManager, "getActiveProvider").mockReturnValue({
      generateChat: vi.fn().mockImplementation(async (messages) => {
        capturedMessages = messages;
        return { content: "reply", provider: { name: "Ollama", type: "local" } };
      }),
    });

    await AIChatService.processChatRequest([
      { role: "user", content: "Hello" },
    ]);

    const systemMessages = capturedMessages.filter((m) => m.role === "system");
    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0].content.toLowerCase()).toContain("live");
    expect(capturedMessages[capturedMessages.length - 1].role).toBe("user");
  });

  it("the same anti-fabrication message is present for a Bengali fallback message", async () => {
    let capturedMessages;
    vi.spyOn(providerManager, "getActiveProvider").mockReturnValue({
      generateChat: vi.fn().mockImplementation(async (messages) => {
        capturedMessages = messages;
        return { content: "reply", provider: { name: "Ollama", type: "local" } };
      }),
    });

    await AIChatService.processChatRequest([
      { role: "user", content: "কেমন আছো?" },
    ]);

    const systemMessages = capturedMessages.filter((m) => m.role === "system");
    expect(systemMessages).toHaveLength(1);
  });

  it("original conversation history remains intact alongside the new system message", async () => {
    let capturedMessages;
    vi.spyOn(providerManager, "getActiveProvider").mockReturnValue({
      generateChat: vi.fn().mockImplementation(async (messages) => {
        capturedMessages = messages;
        return { content: "reply", provider: { name: "Ollama", type: "local" } };
      }),
    });

    await AIChatService.processChatRequest([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello!" },
      { role: "user", content: "how are you" },
    ]);

    const nonSystem = capturedMessages.filter((m) => m.role !== "system");
    expect(nonSystem).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello!" },
      { role: "user", content: "how are you" },
    ]);
  });

  it("the anti-fabrication message is NOT sent for Brain-capability replies (system.info)", async () => {
    vi.spyOn(brainRuntime.brainRequestGateway, "submit").mockResolvedValue({
      success: true,
      requestId: "req-020-1",
      runtime: "TermuxRuntime",
      output: {
        platform: "LINUX",
        architecture: "arm64",
        nodeVersion: "v22.0.0",
        termuxVersion: "0.118.0",
        cpuCores: 8,
        memoryFreeGB: "1.00",
        memoryTotalGB: "4.00",
      },
      durationMs: 1,
    });

    await AIChatService.processChatRequest([
      { role: "user", content: "system information" },
    ]);

    expect(providerManager.getActiveProvider).not.toHaveBeenCalled();
  });
});

describe("TASK-020 Phase 1: regression — existing routing unchanged", () => {
  it("STEP 1.5 capability routing (termux.system.info) still works exactly as before", async () => {
    vi.spyOn(brainRuntime.brainRequestGateway, "submit").mockResolvedValue({
      success: false,
      requestId: "req-020-2",
      runtime: "TermuxRuntime",
      error: "AUTHORIZATION_REQUIRE_APPROVAL: needs approval",
      durationMs: 1,
    });

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "system info" },
    ]);

    expect(result.message.content.toLowerCase()).toContain("approval");
    expect(providerManager.getActiveProvider).not.toHaveBeenCalled();
  });

  it("TASK-019 termux.file.read needsInput branch still works exactly as before", async () => {
    const result = await AIChatService.processChatRequest([
      { role: "user", content: "read file" },
    ]);

    expect(result.message.content.toLowerCase()).toContain("package.json");
    expect(providerManager.getActiveProvider).not.toHaveBeenCalled();
  });
});
