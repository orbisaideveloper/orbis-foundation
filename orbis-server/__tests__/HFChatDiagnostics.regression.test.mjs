import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const HuggingFaceProvider = require("../ai/providers/HuggingFaceProvider.cjs");
const {
  classifyTask,
  modelRouter,
} = require("../ai/models/ModelRouter.cjs");
const {
  TASKS,
} = require("../ai/models/ModelRegistry.cjs");

describe("HF chat diagnostics regression", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.HF_TOKEN;
    delete process.env.HF_MODEL;
    delete process.env.HF_CHAT_COMPLETIONS_URL;
  });

  it("preserves non-auth HTTP status for safe routing diagnostics", async () => {
    process.env.HF_TOKEN = "test-token";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );

    const provider = new HuggingFaceProvider();

    await expect(
      provider.generateChat([
        { role: "user", content: "Hello" },
      ]),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE_429",
    });

    expect(provider.getMetadata().health.state).toBe(
      "UNAVAILABLE",
    );
  });

  it("routes the observed Bengali-English JavaScript prompt as coding", () => {
    const messages = [
      {
        role: "user",
        content:
          "JavaScript-এ add(a, b) নামে একটি simple function লিখে দাও",
      },
    ];

    expect(classifyTask(messages)).toBe(TASKS.CODING);

    const selection = modelRouter.select(messages, {
      availableProviders: ["Hugging Face"],
    });

    expect(selection.task).toBe(TASKS.CODING);
    expect(selection.candidates[0]).toMatchObject({
      id: "hf-qwen25-coder-7b",
      modelId:
        "Qwen/Qwen2.5-Coder-7B-Instruct:fastest",
    });
  });
});
