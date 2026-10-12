import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const GroqProvider = require("../ai/providers/GroqProvider.cjs");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function enabled() {
  vi.stubEnv("GROQ_ENABLED", "true");
  vi.stubEnv("GROQ_API_KEY", "test-key-not-real");
  vi.stubEnv("GROQ_MODEL", "qwen/qwen3.8-27b");
  return new GroqProvider();
}

it("disabled Groq makes no network request", async () => {
  vi.stubEnv("GROQ_ENABLED", "false");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(new GroqProvider().generateChat([]))
    .rejects.toMatchObject({ code: "PROVIDER_DISABLED" });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("missing key makes no network request", async () => {
  const provider = enabled();
  provider.token = null;
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(provider.generateChat([]))
    .rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("sends JSON requirements and preserves complete Bengali output", async () => {
  const provider = enabled();
  const content = JSON.stringify({ reply: "চন্দ্র 4.4391° ও শুক্র 22.1034°।" });
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{
      finish_reason: "stop", message: { content },
    }] }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const result = await provider.generateChat(
    [{ role: "user", content: "পঞ্চম ঘর বোঝাও" }],
    { responseFormat: "json_object", maxTokens: 2048 },
  );
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
  expect(JSON.parse(options.body)).toMatchObject({
    model: "qwen/qwen3.8-27b",
    response_format: { type: "json_object" },
    max_tokens: 2048, stream: false,
  });
  expect(result.content).toBe(content);
  expect(result.provider.name).toBe("Groq");
});

it.each([401, 403, 429, 500])("normalizes HTTP %s without exposing body", async status => {
  const provider = enabled();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
  await expect(provider.generateChat([])).rejects.toMatchObject({
    code: status === 401 || status === 403
      ? "PROVIDER_AUTH_FAILED" : `PROVIDER_UNAVAILABLE_${status}`,
  });
});

it("rejects truncated output", async () => {
  const provider = enabled();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{
      finish_reason: "length", message: { content: '{"reply":"অসম্পূর্ণ"}' },
    }] }),
  }));
  await expect(provider.generateChat([]))
    .rejects.toMatchObject({ code: "PROVIDER_RESPONSE_REJECTED" });
});

it("normalizes timeout errors", async () => {
  const provider = enabled();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
    Object.assign(new Error("test timeout"), { name: "AbortError" }),
  ));
  await expect(provider.generateChat([]))
    .rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
});

it("explicit Groq routing chooses only Groq", () => {
  const manager = require("../ai/AIProviderManager.cjs");
  const previous = manager.providers.get("Groq");
  const fake = { name: "Groq" };
  manager.providers.set("Groq", fake);
  try {
    const result = manager.buildCandidates([], { preferredProvider: "Groq" }, fake);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].provider).toBe(fake);
  } finally {
    if (previous) manager.providers.set("Groq", previous);
    else manager.providers.delete("Groq");
  }
});

it("Maya requests Groq when enabled", async () => {
  enabled();
  const { generateMayaResult } = require("../ai/maya/MayaService.cjs");
  const generateChat = vi.fn().mockResolvedValue({
    content: '{"reply":"আপনার প্রশ্নের উত্তর।"}',
  });
  await generateMayaResult({ generateChat }, {
    capability: "general.chat", language: "bn",
    input: { messages: [{ role: "user", content: "নমস্কার" }] },
  });
  expect(generateChat.mock.calls[0][1].preferredProvider).toBe("Groq");
});
