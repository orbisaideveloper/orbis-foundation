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
      "Qwen/Qwen3-4B:featherless-ai",
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


describe("Deterministic capability-question fallback", () => {
  it("keeps capability questions on general chat without the semantic model", () => {
    expect(
      classifyTask([
        {
          role: "user",
          content: "তুমি coding করতে পারো?",
        },
      ]),
    ).toBe(TASKS.GENERAL_CHAT);

    expect(
      classifyTask([
        {
          role: "user",
          content: "tumi ki coding paro",
        },
      ]),
    ).toBe(TASKS.GENERAL_CHAT);

    expect(
      classifyTask([
        {
          role: "user",
          content: "Can you do coding?",
        },
      ]),
    ).toBe(TASKS.GENERAL_CHAT);

    expect(
      classifyTask([
        {
          role: "user",
          content: "Fix this coding bug",
        },
      ]),
    ).toBe(TASKS.CODING);
  });

  it("keeps Orbit primary and exposes Sage as the registry general-chat fallback", () => {
    const result = modelRouter.select(
      [
        {
          role: "user",
          content: "Hello",
        },
      ],
      {
        availableProviders: [HF_PROVIDER_NAME],
      },
    );

    expect(
      result.candidates.slice(0, 2).map(
        (candidate) => candidate.modelId,
      ),
    ).toEqual([
      "Qwen/Qwen3-4B:featherless-ai",
      "Qwen/Qwen3-8B:fastest",
    ]);
  });
});


describe("capability-question language variants", () => {
  const capabilityQuestions = [
    "তুমি coding করতে পারবে?",
    "আপনি programming জানেন?",
    "tumi coding korte parba?",
    "apni code korte parben?",
    "Can you code?",
    "Are you capable of programming?",
    "Do you know coding?",
  ];

  for (
    const content
    of capabilityQuestions
  ) {
    it(
      `keeps capability question on general-chat: ${content}`,
      () => {
        expect(
          classifyTask([
            {
              role: "user",
              content,
            },
          ]),
        ).toBe(
          TASKS.GENERAL_CHAT,
        );
      },
    );
  }

  const concreteTasks = [
    "Can you fix this coding bug?",
    "Can you review my code?",
    "তুমি এই কোডটা ফিক্স করতে পারবে?",
    "আপনি আমার code review করতে পারবেন?",
  ];

  for (
    const content
    of concreteTasks
  ) {
    it(
      `keeps concrete coding task on coding: ${content}`,
      () => {
        expect(
          classifyTask([
            {
              role: "user",
              content,
            },
          ]),
        ).toBe(
          TASKS.CODING,
        );
      },
    );
  }
});


describe("conservative coding fallback for explanation requests", () => {
  const explanationCases = [
    "Explain the difference between Promise.all and Promise.allSettled in JavaScript.",
    "What is a JavaScript closure?",
    "Ami Banglay bujhte chai: JavaScript closure ki? Banglay bojhao.",
  ];

  for (const content of explanationCases) {
    it(
      `keeps explanation on general-chat without semantic routing: ${content}`,
      () => {
        expect(
          classifyTask([
            {
              role: "user",
              content,
            },
          ]),
        ).toBe(TASKS.GENERAL_CHAT);
      },
    );
  }

  const codingCases = [
    "Write a JavaScript function named add.",
    "Debug this JavaScript function.",
    "Review this TypeScript code.",
    "এই JavaScript functionটা ফিক্স করো।",
  ];

  for (const content of codingCases) {
    it(
      `keeps explicit coding action on coding: ${content}`,
      () => {
        expect(
          classifyTask([
            {
              role: "user",
              content,
            },
          ]),
        ).toBe(TASKS.CODING);
      },
    );
  }
});


describe("repository verification fallback", () => {
  it("routes explicit repository verification as coding work", () => {
    expect(
      classifyTask([
        {
          role: "user",
          content:
            "Verify the changed repository area",
        },
      ]),
    ).toBe(TASKS.CODING);

    expect(
      classifyTask([
        {
          role: "user",
          content:
            "এই repository area যাচাই করো",
        },
      ]),
    ).toBe(TASKS.CODING);
  });
});


describe("negated coding actions are not affirmative coding intent", () => {
  it("keeps an English explanation on general-chat when repository writing is explicitly forbidden", () => {
    expect(
      classifyTask([
        {
          role: "user",
          content:
            "Answer only in English. Explain Promise.all and Promise.allSettled in JavaScript. Do not write repository code.",
        },
      ]),
    ).toBe(TASKS.GENERAL_CHAT);
  });

  it("still recognizes an actual Bengali inline-code fix while repository mutation is forbidden", () => {
    expect(
      classifyTask([
        {
          role: "user",
          content:
            "এই JavaScript function-এ bug আছে। functionটা ঠিক করে দাও। Repository বদলাবে না।",
        },
      ]),
    ).toBe(TASKS.CODING);
  });
});
