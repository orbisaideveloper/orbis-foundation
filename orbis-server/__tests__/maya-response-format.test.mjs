import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { parseMayaResponse, generateMayaResult, buildMayaMessages } = require("../ai/maya/MayaService.cjs");
const manager = require("../ai/AIProviderManager.cjs");
const HuggingFaceProvider = require("../ai/providers/HuggingFaceProvider.cjs");
const originalToken = process.env.HF_TOKEN;
afterEach(() => {
  vi.restoreAllMocks();
  if (originalToken === undefined) delete process.env.HF_TOKEN;
  else process.env.HF_TOKEN = originalToken;
});
describe("Maya output format interoperability", () => {
  it("accepts complete JSON wrappers without accepting prose or malformed JSON", () => {
    for (const content of ['{"reply":"নমস্কার"}', '```json\n{"reply":"নমস্কার"}\n```', '<think>private reasoning</think>\n{"reply":"নমস্কার"}', '<think></think>\n```json\n{"reply":"নমস্কার"}\n```']) {
      expect(parseMayaResponse("general.chat", { content })).toEqual({ reply: "নমস্কার" });
    }
    for (const content of ['plain text', 'prefix {"reply":"নমস্কার"}', '{"reply":"নমস্কার"} trailing', '<think>unfinished {"reply":"নমস্কার"}', '```json\n{}\n```', '{"reply":"নমস্কার","extra":true}']) {
      expect(parseMayaResponse("general.chat", { content })).toBeNull();
    }
  });
  it("preserves chart contradiction rejection inside transport wrappers", () => {
    const chart = { ascendant: 291, planets: [{ id: "Sun", sign: 0 }] };
    expect(parseMayaResponse("astro.interpretation", { content: '```json\n{"reply":"আপনার লগ্ন কর্কট।"}\n```' }, chart)).toBeNull();
    expect(parseMayaResponse("astro.interpretation", { content: '```json\n{"reply":"আপনার লগ্ন মকর।"}\n```' }, chart)).toEqual({ reply: "আপনার লগ্ন মকর।" });
  });
  it("requests bounded JSON through canonical routing and leaves default callers unchanged", async () => {
    const request = { capability: "general.chat", language: "bn", input: { messages: [{ role: "user", content: "হ্যালো" }] } };
    const provider = { generateChat: vi.fn().mockResolvedValue({ content: '{"reply":"হ্যালো"}' }) };
    await generateMayaResult(provider, request);
    const options = provider.generateChat.mock.calls[0][1];
    expect(options).toMatchObject({ responseFormat: "json_object", maxTokens: 2048, timeoutMs: 25000 });
    expect(buildMayaMessages(request)[0].content).toContain("/no_think");
    expect(manager.buildRequestOptions({ model: { modelId: "test/model" } }, options)).toMatchObject({ responseFormat: "json_object", maxTokens: 2048, model: "test/model" });
    expect(manager.buildRequestOptions({}, {})).toEqual({ timeoutMs: 30000 });
  });
  it("sends output controls to HF without changing default provider request bodies", async () => {
    process.env.HF_TOKEN = "private-test-only";
    const transport = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"Hello"}' } }] }), { status: 200 }));
    await new HuggingFaceProvider().generateChat([{ role: "user", content: "Hello" }], { responseFormat: "json_object", maxTokens: 2048 });
    expect(JSON.parse(transport.mock.calls[0][1].body)).toMatchObject({ response_format: { type: "json_object" }, max_tokens: 2048 });
  });
});
