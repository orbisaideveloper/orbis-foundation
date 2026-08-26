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

  // Compiled Brain runtime boundary (built via `npm run build:brain-runtime`).
  // AIChatService.cjs requires this same resolved file lazily inside
  // loadBrainRequestGateway(), so spying on the object here affects the
  // exact instance it uses (Node caches modules by resolved absolute path).
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

describe("TASK-013: AIChatService Brain capability routing (STEP 1.5)", () => {
  it("routes a matched capability phrase through brainRequestGateway.submit()", async () => {
    const submitSpy = vi
      .spyOn(brainRuntime.brainRequestGateway, "submit")
      .mockResolvedValue({
        success: true,
        requestId: "req-1",
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
        durationMs: 5,
      });

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "show me system information" },
    ]);

    expect(submitSpy).toHaveBeenCalledWith({
      capabilityId: "termux.system.info",
      input: {},
    });
    expect(result.provider.type).toBe("BRAIN_CAPABILITY");
    expect(result.message.content).toContain("Platform: LINUX");
  });

  it("reports a DENY decision in plain language and does not fall through to Ollama", async () => {
    vi.spyOn(brainRuntime.brainRequestGateway, "submit").mockResolvedValue({
      success: false,
      requestId: "req-2",
      runtime: "TermuxRuntime",
      error: "AUTHORIZATION_DENY: capability disabled",
      durationMs: 1,
    });

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "system information" },
    ]);

    expect(result.provider.type).toBe("BRAIN_CAPABILITY");
    expect(result.message.content.toLowerCase()).toContain("not authorized");
    expect(providerManager.getActiveProvider).not.toHaveBeenCalled();
  });

  it("reports a REQUIRE_APPROVAL decision without falling through to Ollama", async () => {
    vi.spyOn(brainRuntime.brainRequestGateway, "submit").mockResolvedValue({
      success: false,
      requestId: "req-3",
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

  it("replies in Bengali when the matched message was in Bengali", async () => {
    vi.spyOn(brainRuntime.brainRequestGateway, "submit").mockResolvedValue({
      success: true,
      requestId: "req-4",
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
      durationMs: 5,
    });

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "আমার সিস্টেম তথ্য দেখাও" },
    ]);

    expect(result.message.content).toContain("প্ল্যাটফর্ম");
  });

  it.each([
    "मेरा सिस्टम इन्फो दिखाओ",
    "system ka info dikhao",
    "amar system info dekhao",
  ])("routes multilingual voice-style system commands: %s", async (message) => {
    const submitSpy = vi
      .spyOn(brainRuntime.brainRequestGateway, "submit")
      .mockResolvedValue({
        success: true,
        requestId: "voice-command-1",
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
        durationMs: 5,
      });

    await AIChatService.processChatRequest([
      { role: "user", content: message },
    ]);

    expect(submitSpy).toHaveBeenCalledWith({
      capabilityId: "termux.system.info",
      input: {},
    });
  });

  it("leaves normal conversation untouched (no Brain call for unmatched messages)", async () => {
    const submitSpy = vi.spyOn(brainRuntime.brainRequestGateway, "submit");

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "Hello" },
    ]);

    expect(submitSpy).not.toHaveBeenCalled();
    expect(result.message.content).toBe("normal ai reply");
  });
});

describe("TASK-019: generic termux.file.read phrase asks which file instead of approving input:{}", () => {
  it("asks (in English) which allow-listed file, and never calls the Brain gateway", async () => {
    const submitSpy = vi.spyOn(brainRuntime.brainRequestGateway, "submit");

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "read file" },
    ]);

    expect(submitSpy).not.toHaveBeenCalled();
    expect(providerManager.getActiveProvider).not.toHaveBeenCalled();
    expect(result.provider.type).toBe("BRAIN_CAPABILITY");
    expect(result.message.content.toLowerCase()).toContain("package.json");
    expect(result.message.content.toLowerCase()).toContain("readme.md");
  });

  it("asks (in Bengali) which allow-listed file when the message was Bengali", async () => {
    const submitSpy = vi.spyOn(brainRuntime.brainRequestGateway, "submit");

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "ফাইল পড়ো" },
    ]);

    expect(submitSpy).not.toHaveBeenCalled();
    expect(result.message.content).toContain("package.json");
  });

  it("still submits to the Brain gateway once a specific allow-listed file is named", async () => {
    const submitSpy = vi
      .spyOn(brainRuntime.brainRequestGateway, "submit")
      .mockResolvedValue({
        success: false,
        requestId: "task019-chat-1",
        runtime: "TermuxRuntime",
        error: "AUTHORIZATION_REQUIRE_APPROVAL: needs approval",
        approvalRequired: true,
        approvalToken: "test-token-value-1234567890",
        durationMs: 1,
      });

    const result = await AIChatService.processChatRequest([
      { role: "user", content: "read file package.json" },
    ]);

    expect(submitSpy).toHaveBeenCalledWith({
      capabilityId: "termux.file.read",
      input: { path: "package.json" },
    });
    expect(providerManager.getActiveProvider).not.toHaveBeenCalled();
    expect(result.message.content.toLowerCase()).toContain("approval");
  });
});
