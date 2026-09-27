import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_TOKEN = "test-token";
const TEST_MODEL = "test/model";
const TEST_MESSAGE = "Hello";

const ORIGINAL_ENV = {
  HF_TOKEN: process.env.HF_TOKEN,
  HF_MODEL: process.env.HF_MODEL,
  HF_CHAT_COMPLETIONS_URL: process.env.HF_CHAT_COMPLETIONS_URL,
};

const loadProvider = async () => {
  vi.resetModules();
  const module = await import("../ai/providers/HuggingFaceProvider.cjs");
  return module.default || module;
};

afterEach(() => {
  vi.restoreAllMocks();

  for (const key of Object.keys(ORIGINAL_ENV)) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
});

describe("HuggingFaceProvider", () => {
  it("uses the configured token and OpenAI-compatible response", async () => {
    process.env.HF_TOKEN = TEST_TOKEN;
    process.env.HF_MODEL = TEST_MODEL;
    process.env.HF_CHAT_COMPLETIONS_URL =
      "https://example.test/v1/chat/completions";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hello from HF" } }],
        }),
        { status: 200 },
      ),
    );

    const Provider = await loadProvider();
    const provider = new Provider();

    const result = await provider.generateChat(
      [{ role: "user", content: TEST_MESSAGE }],
      { timeoutMs: 5_000 },
    );

    expect(result.content).toBe("Hello from HF");
    expect(result.provider.name).toBe("Hugging Face");
    expect(result.provider.model).toBe(TEST_MODEL);
    expect(result.provider.health.state).toBe("AVAILABLE");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];

    expect(url).toBe("https://example.test/v1/chat/completions");
    expect(request.headers.Authorization).toBe("Bearer test-token");

    expect(JSON.parse(request.body)).toEqual({
      model: TEST_MODEL,
      messages: [{ role: "user", content: TEST_MESSAGE }],
      stream: false,
    });
  });

  it("fails closed when HF_TOKEN is missing", async () => {
    delete process.env.HF_TOKEN;

    const fetchMock = vi.spyOn(globalThis, "fetch");

    const Provider = await loadProvider();
    const provider = new Provider();

    await expect(
      provider.generateChat([{ role: "user", content: TEST_MESSAGE }]),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(provider.getMetadata().health.state).toBe("UNAVAILABLE");
  });

  it("normalizes authentication failures", async () => {
    process.env.HF_TOKEN = TEST_TOKEN;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unauthorized", { status: 401 }),
    );

    const Provider = await loadProvider();
    const provider = new Provider();

    await expect(
      provider.generateChat([{ role: "user", content: TEST_MESSAGE }]),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });

    expect(provider.getMetadata().health.state).toBe("UNAVAILABLE");
  });

  it("normalizes request timeouts", async () => {
    process.env.HF_TOKEN = TEST_TOKEN;

    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, request) =>
        new Promise((_, reject) => {
          request.signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );

    const Provider = await loadProvider();
    const provider = new Provider();

    await expect(
      provider.generateChat(
        [{ role: "user", content: TEST_MESSAGE }],
        { timeoutMs: 1_000 },
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });

    expect(provider.getMetadata().health.state).toBe("UNAVAILABLE");
  });
});
