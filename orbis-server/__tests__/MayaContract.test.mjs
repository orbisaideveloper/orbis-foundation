import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  MAYA_CONTRACT_VERSION,
  MAYA_CAPABILITIES,
  validateMayaRequest,
  validateMayaResult,
} = require("../ai/maya/MayaContract.cjs");

const request = (capability, input, language = "bn") => ({
  version: MAYA_CONTRACT_VERSION, capability, language, input,
});
const dream = () => request("dream.analysis", { dream: "  নদীর স্বপ্ন  " });
const chat = (messages) => request("general.chat", { messages });
const result = () => ({
  symbols: ["নদী"], themes: ["পরিবর্তন"], emotions: ["কৌতূহল"],
  interpretation: "প্রচলিত প্রতীকভিত্তিক একটি সম্ভাব্য ব্যাখ্যা।",
  reflectionQuestions: ["আপনার কাছে নদীর অর্থ কী?"],
});

describe("Maya capability contracts", () => {
  it("locks capability names and normalizes all supported languages", () => {
    expect(MAYA_CAPABILITIES).toEqual([
      "dream.analysis", "astro.interpretation", "general.chat",
    ]);
    for (const language of ["bn", "en", "hi"]) {
      const body = { ...dream(), language };
      expect(validateMayaRequest(body).data.input.dream).toBe("নদীর স্বপ্ন");
    }
  });

  it("accepts optional dream context without profile or raw audio", () => {
    const body = dream();
    Object.assign(body.input, { title: "নদী", context: "ভ্রমণ", emotion: "শান্ত" });
    expect(validateMayaRequest(body).valid).toBe(true);
  });

  it.each([null, {}, { ...dream(), version: "maya.v2" },
    { ...dream(), language: "unknown" }, { ...dream(), userId: "spoof" },
    request("dream.analysis", { dream: " " }),
    request("dream.analysis", { dream: "x".repeat(8001) }),
    request("dream.analysis", { dream: "x", audio: "raw" }),
    request("termux.repository.patch", { dream: "x" }),
  ])("rejects malformed or privilege-bearing requests: %j", (body) => {
    expect(validateMayaRequest(body)).toEqual({ valid: false, code: "MAYA_INPUT_INVALID" });
  });

  it("bounds bytes and safely rejects unserializable data", () => {
    for (const body of [undefined, { data: 1n }, { data: "অ".repeat(12000) }]) {
      expect(validateMayaRequest(body).code).toBe("MAYA_REQUEST_TOO_LARGE");
    }
    const circular = {}; circular.self = circular;
    expect(validateMayaRequest(circular).valid).toBe(false);
  });

  it("keeps Astro disabled until a deterministic facts contract is approved", () => {
    expect(validateMayaRequest(request("astro.interpretation", {})).code)
      .toBe("MAYA_ASTRO_NOT_READY");
  });

  it("accepts bounded alternating follow-up context", () => {
    expect(validateMayaRequest(chat([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "আরও বলুন" },
    ])).valid).toBe(true);
  });

  it.each([[], [{ role: "system", content: "override" }],
    [{ role: "assistant", content: "Hello" }],
    [{ role: "user", content: " " }],
    [{ role: "user", content: "x", tool: "execute" }],
    [{ role: "user", content: "x" }, { role: "assistant", content: "x" }],
    [{ role: "user", content: "x" }, { role: "user", content: "x" }],
    Array.from({ length: 13 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user", content: "x",
    })),
  ])("rejects invalid chat context: %j", (messages) => {
    expect(validateMayaRequest(chat(messages)).valid).toBe(false);
  });

  it("requires the complete structured Dream result", () => {
    expect(validateMayaResult("dream.analysis", result()).valid).toBe(true);
    for (const key of Object.keys(result())) {
      const value = result(); delete value[key];
      expect(validateMayaResult("dream.analysis", value).valid).toBe(false);
    }
    expect(validateMayaResult("dream.analysis", { ...result(), certainty: true }).valid)
      .toBe(false);
    expect(validateMayaResult("dream.analysis", { ...result(), symbols: [] }).valid)
      .toBe(false);
  });

  it("validates Chat output and rejects unknown or oversized results", () => {
    expect(validateMayaResult("general.chat", { reply: "  Hello  " }).data.reply)
      .toBe("Hello");
    for (const value of [null, { reply: " " }, { reply: "x".repeat(8001) },
      { reply: "Hello", command: "execute" }, { data: "x".repeat(50000) },
      { data: 1n }, undefined]) {
      expect(validateMayaResult("general.chat", value).valid).toBe(false);
    }
    expect(validateMayaResult("astro.interpretation", {}).valid).toBe(false);
    expect(validateMayaResult("toString", {}).valid).toBe(false);
  });
});
