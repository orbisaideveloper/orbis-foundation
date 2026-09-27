// @vitest-environment node

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const HF_PROVIDER_NAME = "Hugging Face";
const CODER_REGISTRY_ID = "hf-qwen25-coder-7b";
const PROVIDER_FALLBACK_SOURCE = "provider-fallback";
const manager = require("../ai/AIProviderManager.cjs");

const originalProviders = manager.providers;
const originalActive = manager.activeProviderName;
const originalLastRouting = manager.lastRouting;

afterEach(() => {
  manager.providers = originalProviders;
  manager.activeProviderName = originalActive;
  manager.lastRouting = originalLastRouting;
  vi.restoreAllMocks();
});

describe("AIProviderManager automatic model routing", () => {
  it("passes the selected coder model to Hugging Face without user model selection", async () => {
    const huggingFace = {
      name: HF_PROVIDER_NAME,
      generateChat: vi.fn().mockResolvedValue({
        content: "coded reply",
        provider: {
          name: HF_PROVIDER_NAME,
          type: "cloud",
          model: "selected",
        },
      }),
    };

    const ollama = {
      name: "Ollama",
      generateChat: vi.fn(),
    };

    manager.providers = new Map([
      [ollama.name, ollama],
      [huggingFace.name, huggingFace],
    ]);

    manager.activeProviderName = ollama.name;

    const result = await manager.generateChat([
      {
        role: "user",
        content: "Debug this JavaScript function",
      },
    ]);

    expect(huggingFace.generateChat).toHaveBeenCalledWith(
      expect.any(Array),
      {
        timeoutMs: 30_000,
        model: "Qwen/Qwen2.5-Coder-7B-Instruct:fastest",
      },
    );

    expect(ollama.generateChat).not.toHaveBeenCalled();

    expect(result.provider.routing).toMatchObject({
      task: "coding",
      registryModelId: CODER_REGISTRY_ID,
      codename: "Forge",
      source: "model-registry",
    });

    expect(result.provider.routing.attempts).toEqual([
      expect.objectContaining({
        provider: HF_PROVIDER_NAME,
        registryModelId: CODER_REGISTRY_ID,
        codename: "Forge",
        status: "success",
        errorCode: null,
      }),
    ]);

    expect(manager.lastRouting).toMatchObject({
      status: "success",
      task: "coding",
      registryModelId: CODER_REGISTRY_ID,
      codename: "Forge",
      provider: HF_PROVIDER_NAME,
      source: "model-registry",
      errorCode: null,
      at: expect.any(String),
    });

    expect(manager.lastRouting.attempts).toHaveLength(1);
  });

  it("uses only one provider fallback when the routed provider is unavailable", async () => {
    const huggingFace = {
      name: HF_PROVIDER_NAME,
      generateChat: vi.fn().mockRejectedValue(
        Object.assign(
          new Error("unavailable"),
          {
            code: "PROVIDER_UNAVAILABLE",
          },
        ),
      ),
    };

    const ollama = {
      name: "Ollama",
      generateChat: vi.fn().mockResolvedValue({
        content: "local fallback",
        provider: {
          name: "Ollama",
          type: "local",
          model: "local",
        },
      }),
    };

    manager.providers = new Map([
      [ollama.name, ollama],
      [huggingFace.name, huggingFace],
    ]);

    manager.activeProviderName = ollama.name;

    const result = await manager.generateChat([
      {
        role: "user",
        content: "Explain this coding bug",
      },
    ]);

    expect(huggingFace.generateChat).toHaveBeenCalledTimes(1);
    expect(ollama.generateChat).toHaveBeenCalledTimes(1);

    expect(result.provider.routing.source).toBe(
      PROVIDER_FALLBACK_SOURCE,
    );

    expect(result.provider.routing.attempts).toHaveLength(2);
    expect(result.provider.routing.attempts[0]).toMatchObject({
      provider: HF_PROVIDER_NAME,
      codename: "Forge",
      status: "failed",
      errorCode: "PROVIDER_UNAVAILABLE",
    });
    expect(result.provider.routing.attempts[1]).toMatchObject({
      provider: "Ollama",
      status: "success",
      source: PROVIDER_FALLBACK_SOURCE,
    });

    expect(manager.lastRouting).toMatchObject({
      status: "success",
      task: "coding",
      provider: "Ollama",
      source: PROVIDER_FALLBACK_SOURCE,
      at: expect.any(String),
    });

    expect(manager.lastRouting.attempts).toHaveLength(2);
  });
});
