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
const MODEL_REGISTRY_SOURCE = "model-registry";
const GENERAL_CHAT_TASK = "general-chat";
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
      source: MODEL_REGISTRY_SOURCE,
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
      source: MODEL_REGISTRY_SOURCE,
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
        content: "Fix this coding bug",
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

  it("hands the same conversation to Ollama when a routed worker returns structurally invalid output", async () => {
    const messages = [
      {
        role: "system",
        content:
          "ORBIS_TOOL_RESULT repository.read: bounded-result",
      },
      {
        role: "user",
        content:
          "এই কাজটা শেষ পর্যন্ত ঠিক করে দাও",
      },
    ];

    const huggingFace = {
      name: HF_PROVIDER_NAME,
      generateChat: vi.fn().mockResolvedValue({
        content: "not-valid-agent-json",
        provider: {
          name: HF_PROVIDER_NAME,
          type: "cloud",
          model:
            "Qwen/Qwen2.5-Coder-7B-Instruct:fastest",
        },
      }),
    };

    const ollama = {
      name: "Ollama",
      generateChat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          action: "final",
          answer: "বাকি কাজ সম্পূর্ণ হয়েছে।",
        }),
        provider: {
          name: "Ollama",
          type: "local",
          model: "fallback-model",
        },
      }),
    };

    manager.providers = new Map([
      [ollama.name, ollama],
      [huggingFace.name, huggingFace],
    ]);
    manager.activeProviderName = ollama.name;

    const result = await manager.generateChat(
      messages,
      {
        task: "coding",
        validateResponse: (response) => {
          try {
            const parsed =
              JSON.parse(response.content);
            return (
              parsed &&
              typeof parsed.action === "string"
            );
          } catch {
            return false;
          }
        },
      },
    );

    expect(
      huggingFace.generateChat.mock.calls[0][0],
    ).toBe(messages);

    expect(
      ollama.generateChat.mock.calls[0][0],
    ).toBe(messages);

    expect(result.provider.routing.attempts).toEqual([
      expect.objectContaining({
        provider: HF_PROVIDER_NAME,
        status: "failed",
        errorCode:
          "PROVIDER_RESPONSE_REJECTED",
      }),
      expect.objectContaining({
        provider: "Ollama",
        status: "success",
        errorCode: null,
      }),
    ]);
  });

});


describe("AIProviderManager same-provider registry fallback", () => {
  it("tries Sage after Orbit fails before falling back to another provider", async () => {
    const orbitModel =
      "Qwen/Qwen3-4B:featherless-ai";
    const sageModel =
      "Qwen/Qwen3-8B:fastest";
    const orbitUnavailableCode =
      "PROVIDER_UNAVAILABLE_503";

    const huggingFace = {
      name: HF_PROVIDER_NAME,
      generateChat: vi.fn().mockImplementation(
        async (_messages, options) => {
          if (options.model === orbitModel) {
            const error =
              new Error("orbit unavailable");
            error.code =
              orbitUnavailableCode;
            throw error;
          }

          if (options.model === sageModel) {
            return {
              content: "sage fallback",
              provider: {
                name: HF_PROVIDER_NAME,
                type: "cloud",
                model: sageModel,
              },
            };
          }

          throw new Error(
            `Unexpected model: ${options.model}`,
          );
        },
      ),
    };

    const ollama = {
      name: "Ollama",
      generateChat: vi.fn(),
    };

    manager.providers = new Map([
      [ollama.name, ollama],
      [huggingFace.name, huggingFace],
    ]);

    manager.activeProviderName =
      ollama.name;

    const result =
      await manager.generateChat(
        [
          {
            role: "user",
            content: "Hello",
          },
        ],
        {
          task: GENERAL_CHAT_TASK,
        },
      );

    expect(
      huggingFace.generateChat,
    ).toHaveBeenCalledTimes(3);

    expect(
      huggingFace.generateChat,
    ).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      {
        timeoutMs: 30_000,
        model: orbitModel,
      },
    );

    expect(
      huggingFace.generateChat,
    ).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      {
        timeoutMs: 30_000,
        model: orbitModel,
      },
    );

    expect(
      huggingFace.generateChat,
    ).toHaveBeenNthCalledWith(
      3,
      expect.any(Array),
      {
        timeoutMs: 30_000,
        model: sageModel,
      },
    );

    expect(
      ollama.generateChat,
    ).not.toHaveBeenCalled();

    expect(
      result.provider.routing,
    ).toMatchObject({
      task: GENERAL_CHAT_TASK,
      registryModelId:
        "hf-qwen3-8b-reasoning",
      codename: "Sage",
      source: MODEL_REGISTRY_SOURCE,
    });

    expect(
      result.provider.routing.attempts,
    ).toEqual([
      expect.objectContaining({
        model: orbitModel,
        status: "failed",
        errorCode:
          orbitUnavailableCode,
      }),
      expect.objectContaining({
        model: orbitModel,
        status: "failed",
        errorCode:
          orbitUnavailableCode,
      }),
      expect.objectContaining({
        model: sageModel,
        status: "success",
        errorCode: null,
      }),
    ]);
  });
});


describe("AIProviderManager authentication boundary", () => {
  it("fails fast on provider authentication errors without masking them", async () => {
    const AUTH_ERROR_CODE =
      "PROVIDER_AUTH_FAILED";

    const originalProviders =
      manager.providers;

    const originalActiveProvider =
      manager.activeProviderName;

    const originalLastRouting =
      manager.lastRouting;

    const authenticationError =
      Object.assign(
        new Error(
          "authentication failed",
        ),
        {
          code: AUTH_ERROR_CODE,
        },
      );

    const huggingFace = {
      name: HF_PROVIDER_NAME,
      generateChat:
        vi.fn().mockRejectedValue(
          authenticationError,
        ),
    };

    const ollama = {
      name: "Ollama",
      generateChat:
        vi.fn().mockResolvedValue({
          content:
            "must not be reached",
          provider: {
            name: "Ollama",
            type: "local",
            model: "local",
          },
        }),
    };

    try {
      manager.providers =
        new Map([
          [ollama.name, ollama],
          [
            huggingFace.name,
            huggingFace,
          ],
        ]);

      manager.activeProviderName =
        ollama.name;

      await expect(
        manager.generateChat(
          [
            {
              role: "user",
              content: "Hello",
            },
          ],
          {
            task:
              GENERAL_CHAT_TASK,
          },
        ),
      ).rejects.toMatchObject({
        code: AUTH_ERROR_CODE,
      });

      expect(
        huggingFace.generateChat,
      ).toHaveBeenCalledTimes(1);

      expect(
        ollama.generateChat,
      ).not.toHaveBeenCalled();

      expect(
        manager.lastRouting,
      ).toMatchObject({
        status: "failed",
        task: GENERAL_CHAT_TASK,
        errorCode:
          AUTH_ERROR_CODE,
      });

      expect(
        manager.lastRouting
          .attempts,
      ).toHaveLength(1);
    } finally {
      manager.providers =
        originalProviders;

      manager.activeProviderName =
        originalActiveProvider;

      manager.lastRouting =
        originalLastRouting;
    }
  });
});

describe("AIProviderManager bounded transient Hugging Face retry", () => {
  it("retries the first Hugging Face registry candidate once on a transient 503", async () => {
    const transient =
      Object.assign(
        new Error(
          "PROVIDER_UNAVAILABLE_503",
        ),
        {
          code:
            "PROVIDER_UNAVAILABLE_503",
        },
      );

    const huggingFace = {
      name: HF_PROVIDER_NAME,
      generateChat: vi
        .fn()
        .mockRejectedValueOnce(
          transient,
        )
        .mockResolvedValueOnce({
          content:
            "recovered coding reply",
          provider: {
            name:
              HF_PROVIDER_NAME,
            type: "cloud",
            model:
              "Qwen/Qwen2.5-Coder-7B-Instruct:fastest",
          },
        }),
    };

    const ollama = {
      name: "Ollama",
      generateChat: vi.fn(),
    };

    manager.providers = new Map([
      [ollama.name, ollama],
      [
        huggingFace.name,
        huggingFace,
      ],
    ]);

    manager.activeProviderName =
      ollama.name;

    const result =
      await manager.generateChat(
        [
          {
            role: "user",
            content:
              "Fix this JavaScript bug.",
          },
        ],
        {
          task: "coding",
        },
      );

    expect(
      huggingFace.generateChat,
    ).toHaveBeenCalledTimes(2);

    expect(
      ollama.generateChat,
    ).not.toHaveBeenCalled();

    expect(
      result.provider.routing.attempts,
    ).toEqual([
      expect.objectContaining({
        provider:
          HF_PROVIDER_NAME,
        status: "failed",
        errorCode:
          "PROVIDER_UNAVAILABLE_503",
      }),
      expect.objectContaining({
        provider:
          HF_PROVIDER_NAME,
        status: "success",
        errorCode: null,
      }),
    ]);
  });

  it("does not retry provider authentication failures", async () => {
    const authentication =
      Object.assign(
        new Error(
          "PROVIDER_AUTH_FAILED",
        ),
        {
          code:
            "PROVIDER_AUTH_FAILED",
        },
      );

    const huggingFace = {
      name: HF_PROVIDER_NAME,
      generateChat:
        vi.fn().mockRejectedValue(
          authentication,
        ),
    };

    const ollama = {
      name: "Ollama",
      generateChat: vi.fn(),
    };

    manager.providers = new Map([
      [ollama.name, ollama],
      [
        huggingFace.name,
        huggingFace,
      ],
    ]);

    manager.activeProviderName =
      ollama.name;

    await expect(
      manager.generateChat(
        [
          {
            role: "user",
            content:
              "Fix this JavaScript bug.",
          },
        ],
        {
          task: "coding",
        },
      ),
    ).rejects.toMatchObject({
      code:
        "PROVIDER_AUTH_FAILED",
    });

    expect(
      huggingFace.generateChat,
    ).toHaveBeenCalledOnce();

    expect(
      ollama.generateChat,
    ).not.toHaveBeenCalled();
  });

  it("preserves an informative Hugging Face status when a later local fallback is only generically unavailable", async () => {
    const hfUnavailable =
      Object.assign(
        new Error(
          "PROVIDER_UNAVAILABLE_503",
        ),
        {
          code:
            "PROVIDER_UNAVAILABLE_503",
        },
      );

    const localUnavailable =
      Object.assign(
        new Error(
          "PROVIDER_UNAVAILABLE",
        ),
        {
          code:
            "PROVIDER_UNAVAILABLE",
        },
      );

    const huggingFace = {
      name: HF_PROVIDER_NAME,
      generateChat:
        vi.fn().mockRejectedValue(
          hfUnavailable,
        ),
    };

    const ollama = {
      name: "Ollama",
      generateChat:
        vi.fn().mockRejectedValue(
          localUnavailable,
        ),
    };

    manager.providers = new Map([
      [ollama.name, ollama],
      [
        huggingFace.name,
        huggingFace,
      ],
    ]);

    manager.activeProviderName =
      ollama.name;

    await expect(
      manager.generateChat(
        [
          {
            role: "user",
            content:
              "Fix this JavaScript bug.",
          },
        ],
        {
          task: "coding",
        },
      ),
    ).rejects.toMatchObject({
      code:
        "PROVIDER_UNAVAILABLE_503",
      routingAttempts:
        expect.arrayContaining([
          expect.objectContaining({
            provider:
              HF_PROVIDER_NAME,
            errorCode:
              "PROVIDER_UNAVAILABLE_503",
          }),
          expect.objectContaining({
            provider: "Ollama",
            errorCode:
              "PROVIDER_UNAVAILABLE",
          }),
        ]),
    });
  });
});
