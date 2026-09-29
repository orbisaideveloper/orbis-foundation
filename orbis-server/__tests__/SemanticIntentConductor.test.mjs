// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);

const {
  TASKS,
} = require("../ai/models/ModelRegistry.cjs");

const {
  SemanticIntentConductor,
  boundedConversation,
  parseSemanticIntent,
} = require("../ai/brain/SemanticIntentConductor.cjs");

describe("SemanticIntentConductor", () => {
  it("accepts a semantic capability question instead of trusting a coding keyword", async () => {
    const generate = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        task: "general-chat",
        interaction: "capability-question",
        responseLanguage: "bn",
        confidence: "high",
        clarificationRequired: false,
      }),
    });

    const conductor =
      new SemanticIntentConductor({ generate });

    const result = await conductor.interpret(
      [
        {
          role: "user",
          content: "tumi ki coding paro",
        },
      ],
      {
        fallbackTask: TASKS.CODING,
      },
    );

    expect(result).toEqual({
      task: TASKS.GENERAL_CHAT,
      interaction: "capability-question",
      responseLanguage: "bn",
      confidence: "high",
      clarificationRequired: false,
      source: "semantic-model",
    });

    expect(generate).toHaveBeenCalledOnce();
  });

  it("falls back safely when model output is invalid", async () => {
    const conductor =
      new SemanticIntentConductor({
        generate: vi.fn().mockResolvedValue({
          content: "not valid routing json",
        }),
      });

    await expect(
      conductor.interpret(
        [{ role: "user", content: "Fix this bug" }],
        { fallbackTask: TASKS.CODING },
      ),
    ).resolves.toEqual({
      task: TASKS.CODING,
      interaction: "conversation",
      responseLanguage: "same",
      confidence: "low",
      clarificationRequired: false,
      source: "deterministic-fallback",
    });
  });


  it("keeps an explicit Bengali analysis request on reasoning when the semantic model downgrades it to conversation", async () => {
    const generate = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        task: "general-chat",
        interaction: "conversation",
        responseLanguage: "bn",
        confidence: "high",
        clarificationRequired: false,
      }),
    });

    const conductor = new SemanticIntentConductor({
      generate,
    });

    await expect(
      conductor.interpret(
        [
          {
            role: "user",
            content:
              "শুধু বাংলায় বিশ্লেষণ করে বলো: ১২ লিটার থেকে ৩ লিটার ফেরত এলে নেট কত এবং কেন?",
          },
        ],
        {
          fallbackTask: TASKS.REASONING,
        },
      ),
    ).resolves.toMatchObject({
      task: TASKS.REASONING,
      interaction: "analysis-request",
      responseLanguage: "bn",
      confidence: "high",
      clarificationRequired: false,
      source: "semantic-model",
    });
  });

  it("rejects extra model-controlled routing fields", () => {
    expect(
      parseSemanticIntent(
        JSON.stringify({
          task: "coding",
          interaction: "task-request",
          responseLanguage: "same",
          confidence: "high",
          clarificationRequired: false,
          capabilityId: "termux.repository.patch",
        }),
      ),
    ).toBeNull();
  });

  it("bounds context and excludes system messages", () => {
    const messages = [
      {
        role: "system",
        content: "private system instruction",
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message-${index}`,
      })),
    ];

    const result = boundedConversation(messages);

    expect(result).toHaveLength(8);
    expect(
      result.some(
        (message) => message.role === "system",
      ),
    ).toBe(false);
    expect(result.at(-1)?.content).toBe("message-9");
  });
});


describe("SemanticIntentConductor unavailable-model fallback", () => {
  it("uses the corrected deterministic capability fallback without changing task intent", async () => {
    const conductor =
      new SemanticIntentConductor({
        generate: vi.fn().mockRejectedValue(
          Object.assign(
            new Error("provider unavailable"),
            {
              code:
                "PROVIDER_UNAVAILABLE_503",
            },
          ),
        ),
      });

    await expect(
      conductor.interpret(
        [
          {
            role: "user",
            content:
              "তুমি coding করতে পারো?",
          },
        ],
        {
          fallbackTask:
            TASKS.GENERAL_CHAT,
        },
      ),
    ).resolves.toMatchObject({
      task: TASKS.GENERAL_CHAT,
      source:
        "deterministic-fallback",
    });
  });
});
