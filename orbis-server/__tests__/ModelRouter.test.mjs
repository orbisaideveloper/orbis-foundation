// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const HF_PROVIDER_NAME = "Hugging Face";

const {
  TASKS,
  modelRegistry,
} = require("../ai/models/ModelRegistry.cjs");

const {
  classifyTask,
  modelRouter,
} = require("../ai/models/ModelRouter.cjs");

describe("Phase 2 model routing", () => {
  it("classifies coding requests and selects the coder model automatically", () => {
    const messages = [
      {
        role: "user",
        content: "Fix this TypeScript bug",
      },
    ];

    expect(classifyTask(messages)).toBe(TASKS.CODING);

    expect(
      modelRouter.select(messages, {
        availableProviders: [HF_PROVIDER_NAME],
      }),
    ).toMatchObject({
      task: TASKS.CODING,
      candidates: [
        {
          id: "hf-qwen25-coder-7b",
          modelId: "Qwen/Qwen2.5-Coder-7B-Instruct:fastest",
        },
      ],
    });
  });

  it("classifies repository patch requests as coding work", () => {
    expect(
      classifyTask([
        {
          role: "user",
          content: "Patch this without tests",
        },
      ]),
    ).toBe(TASKS.CODING);
  });

  it("routes reasoning work independently from general chat", () => {
    const reasoning = modelRouter.select(
      [
        {
          role: "user",
          content: "Analyze the architecture trade-offs",
        },
      ],
      {
        availableProviders: [HF_PROVIDER_NAME],
      },
    );

    const general = modelRouter.select(
      [
        {
          role: "user",
          content: "Hello, how are you?",
        },
      ],
      {
        availableProviders: [HF_PROVIDER_NAME],
      },
    );

    expect(reasoning.task).toBe(TASKS.REASONING);
    expect(reasoning.candidates[0].modelId).toBe(
      "Qwen/Qwen3-8B:fastest",
    );

    expect(general.task).toBe(TASKS.GENERAL_CHAT);
    expect(general.candidates[0].modelId).toBe(
      "Qwen/Qwen3-4B:fastest",
    );
  });

  it("keeps unsupported multimodal and embedding roles registered but disabled", () => {
    const vision = modelRegistry.get("hf-qwen25-vl-7b");
    const embedding =
      modelRegistry.get("hf-embedding-placeholder");

    expect(vision).toMatchObject({
      enabled: false,
      tasks: [TASKS.VISION],
    });

    expect(embedding).toMatchObject({
      enabled: false,
      tasks: [TASKS.EMBEDDING],
    });

    expect(
      modelRouter.select(
        [
          {
            role: "user",
            content: "Describe this image",
          },
        ],
        {
          requirements: { vision: true },
          availableProviders: [HF_PROVIDER_NAME],
        },
      ).candidates,
    ).toEqual([]);
  });
});
