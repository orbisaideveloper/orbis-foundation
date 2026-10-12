// @vitest-environment node
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const AIProvider = require("../ai/providers/AIProvider.cjs");
const GroqProvider = require("../ai/providers/GroqProvider.cjs");
const HFProvider = require("../ai/providers/HuggingFaceProvider.cjs");
const OllamaProvider = require("../ai/providers/OllamaProvider.cjs");
const { runWithTrace } = require("../ai/maya/MayaDiagnostics.cjs");
const TOKEN = "fixture-token-not-real";
const UNAVAILABLE = "PROVIDER_UNAVAILABLE";
const MESSAGE = "fixture reply";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it("requires subclasses to implement generation", async () => {
  await expect(new AIProvider("fixture", "internal", "none").generateChat())
    .rejects.toThrow("must be implemented by the provider");
});

it("registers enabled Groq and fails closed for missing preferred providers", () => {
  vi.stubEnv("GROQ_ENABLED", "true");
  const singleton = require("../ai/AIProviderManager.cjs");
  const manager = new singleton.constructor();
  const groq = manager.providers.get("Groq");
  expect(groq).toBeInstanceOf(GroqProvider);
  expect(manager.buildCandidates([], { preferredProvider: "Groq", task: "reasoning" }, null).candidates[0].provider).toBe(groq);
  const ollama = manager.providers.get("Ollama");
  expect(manager.buildCandidates([], { preferredProvider: "Ollama", task: "reasoning" }, null).candidates[0].provider).toBe(ollama);
  for (const preferredProvider of ["Groq", "Ollama"]) {
    manager.providers.delete(preferredProvider);
    expect(() => manager.buildCandidates([], { preferredProvider }, null)).toThrow(UNAVAILABLE);
  }
});

it("aborts the underlying Groq request at its bounded deadline", async () => {
  vi.stubEnv("GROQ_ENABLED", "true");
  vi.stubEnv("GROQ_API_KEY", TOKEN);
  vi.useFakeTimers();
  let signal;
  vi.stubGlobal("fetch", vi.fn((_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  }));
  const provider = new GroqProvider();
  const result = expect(provider.generateChat([], { timeoutMs: 1000 })).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(1000);
  await result;
  expect(signal.aborted).toBe(true);
  expect(provider.getMetadata().health.state).toBe("UNAVAILABLE");
  expect(vi.getTimerCount()).toBe(0);
});

it.each([null, new Error("private upstream text")])("normalizes unexpected Groq failures without leaking their details", async error => {
  vi.stubEnv("GROQ_ENABLED", "true");
  vi.stubEnv("GROQ_API_KEY", TOKEN);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
  await expect(new GroqProvider().generateChat([])).rejects.toMatchObject({ code: UNAVAILABLE, message: UNAVAILABLE });
});

it("records HF readiness metadata and normalizes both recognized and unknown errors", async () => {
  vi.stubEnv("HF_TOKEN", TOKEN);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({
    choices: [{ message: { content: MESSAGE, reasoning_content: "private reasoning" }, finish_reason: "stop" }],
    usage: { completion_tokens: 5 },
  }) });
  vi.stubGlobal("fetch", fetchMock);
  const provider = new HFProvider();
  expect((await runWithTrace(() => provider.generateChat([]))).content).toBe(MESSAGE);
  fetchMock.mockRejectedValueOnce(new Error("private transport failure"));
  await expect(runWithTrace(() => provider.generateChat([]))).rejects.toMatchObject({ code: UNAVAILABLE });
  fetchMock.mockRejectedValueOnce(Object.assign(new Error("private auth body"), { code: "PROVIDER_AUTH_FAILED" }));
  await expect(runWithTrace(() => provider.generateChat([]))).rejects.toMatchObject({ code: "PROVIDER_AUTH_FAILED" });
});

it("sends local Ollama JSON mode and a token budget without exposing cloud-only options", async () => {
  vi.stubEnv("OLLAMA_API_KEY", "");
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ done: true, message: { content: MESSAGE } }) });
  vi.stubGlobal("fetch", fetchMock);
  const local = new OllamaProvider();
  expect((await local.generateChat([], { responseFormat: "json_object", maxTokens: 256 })).content).toBe(MESSAGE);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ format: "json", options: { num_predict: 256 } });
  vi.stubEnv("OLLAMA_API_KEY", TOKEN);
  await new OllamaProvider().generateChat([], { responseFormat: "json_object" });
  const cloudBody = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(cloudBody).not.toHaveProperty("format");
  expect(cloudBody).not.toHaveProperty("options");
});

it.each([{ done: false }, { done_reason: "length" }, null])("rejects incomplete or absent Ollama results", async data => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const provider = new OllamaProvider();
  await expect(provider.generateChat([])).rejects.toMatchObject({ code: UNAVAILABLE });
  expect(provider.getMetadata().health.state).toBe("UNAVAILABLE");
});


it("rejects absent HF credentials and accepts alternate optional reasoning metadata", async () => {
  vi.stubEnv("HF_TOKEN", TOKEN);
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({
    choices: [{ message: { content: MESSAGE, reasoning: "private alternate reasoning" }, finish_reason: "stop" }],
  }) });
  vi.stubGlobal("fetch", fetchMock);
  const provider = new HFProvider();
  provider.token = null;
  await expect(runWithTrace(() => provider.generateChat([]))).rejects.toMatchObject({ code: UNAVAILABLE });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(provider.getMetadata().health.state).toBe("UNAVAILABLE");
  provider.token = TOKEN;
  expect((await runWithTrace(() => provider.generateChat([]))).content).toBe(MESSAGE);
  expect(provider.getMetadata().health.state).toBe("AVAILABLE");
});
