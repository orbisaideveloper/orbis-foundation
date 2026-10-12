// @vitest-environment node
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { buildMayaMessages, generateMayaResult, namedChartFacts } = require("../ai/maya/MayaService.cjs");
const VISION_MODEL = "qwen/qwen3.8-27b";
const RESULT = { reply: "পরীক্ষার উত্তর" };
const IMAGE = { kind: "image", name: "fixture.jpg", content: "data:image/jpeg;base64,/9j/2Q==" };
function request(attachments) {
  return { version: "maya.v1", capability: "general.chat", language: "bn", input: {
    messages: [{ role: "user", content: "বুঝতে পারলে" }], ...(attachments ? { attachments } : {}),
  } };
}
function manager() { return { generateChat: vi.fn().mockResolvedValue({ content: JSON.stringify(RESULT) }) }; }
afterEach(() => vi.unstubAllEnvs());

it("uses reviewed Bengali guidance as language context without granting execution", () => {
  const messages = buildMayaMessages(request());
  const examples = messages.find(message => message.content.includes("Reviewed Bengali language examples"));
  expect(examples.role).toBe("system");
  expect(examples.content).toContain("never factual evidence or execution authorization");
});

it("renders English, Hindi and fallback chart labels from supplied facts", () => {
  const ids = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"];
  const chart = { ascendant: 0, planets: ids.map((id, index) => ({ id, sign: index, house: index + 1, degree: 2, retrograde: index > 6 })) };
  for (const [language, sun, sign] of [["en", "Sun", "Aries"], ["hi", "सूर्य", "मेष"], ["unsupported", "Sun", "Aries"]]) {
    const result = namedChartFacts(chart, language);
    expect(result.planets[0]).toMatchObject({ planet: sun, sign });
    expect(result.houses[0].ruler).toBe(language === "hi" ? "मंगल" : "Mars");
  }
});

it("routes credentialed Ollama and uses registry routing when cloud credentials are incomplete", async () => {
  vi.stubEnv("GROQ_ENABLED", "false");
  vi.stubEnv("OLLAMA_URL", "https://fixture.test");
  vi.stubEnv("OLLAMA_MODEL", "fixture-model");
  vi.stubEnv("OLLAMA_API_KEY", "fixture-key");
  const provider = manager();
  await generateMayaResult(provider, request());
  expect(provider.generateChat.mock.calls[0][1].preferredProvider).toBe("Ollama");
  vi.stubEnv("OLLAMA_API_KEY", "");
  await generateMayaResult(provider, request());
  expect(provider.generateChat.mock.calls[1][1].preferredProvider).toBeUndefined();
});

it("passes permitted image transport to Groq, and rejects an incompatible configured model", async () => {
  vi.stubEnv("GROQ_ENABLED", "true");
  vi.stubEnv("GROQ_MODEL", "");
  const provider = manager();
  expect(await generateMayaResult(provider, request([IMAGE]))).toEqual(RESULT);
  expect(provider.generateChat.mock.calls[0][1].preferredProvider).toBe("Groq");
  expect(provider.generateChat.mock.calls[0][0].at(-1).content[1].image_url.url).toBe(IMAGE.content);
  vi.stubEnv("GROQ_MODEL", VISION_MODEL);
  await generateMayaResult(provider, request([IMAGE]));
  vi.stubEnv("GROQ_MODEL", "incompatible-model");
  await expect(generateMayaResult(provider, request([IMAGE]))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  expect(provider.generateChat).toHaveBeenCalledTimes(2);
});
