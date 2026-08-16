import { describe, it, expect } from "vitest";

const { match, detectLanguage } = require("../ai/brain/ChatCapabilityIntentMatcher.cjs");

describe("TASK-013: ChatCapabilityIntentMatcher", () => {
  it("matches an English system-info phrase to termux.system.info", () => {
    expect(match("Show me system information")).toBe("termux.system.info");
    expect(match("what is my system info")).toBe("termux.system.info");
  });

  it("matches a Bengali system-info phrase to termux.system.info", () => {
    expect(match("আমার Termux system information দেখাও")).toBe(
      "termux.system.info",
    );
    expect(match("সিস্টেম তথ্য দেখাও")).toBe("termux.system.info");
  });

  it("is case-insensitive and tolerant of surrounding whitespace", () => {
    expect(match("   SYSTEM INFORMATION please   ")).toBe(
      "termux.system.info",
    );
  });

  it("returns null for normal conversation (never guesses)", () => {
    expect(match("Hello")).toBeNull();
    expect(match("Explain fractions")).toBeNull();
    expect(match("What is ORBIS?")).toBeNull();
    expect(match("আজকের খবর কী?")).toBeNull();
  });

  it("returns null for empty or non-string input", () => {
    expect(match("")).toBeNull();
    expect(match(undefined)).toBeNull();
    expect(match(null)).toBeNull();
  });

  it("only ever returns the fixed known capability id or null, never an arbitrary string", () => {
    const result = match("rm -rf / system information");
    expect(result === null || result === "termux.system.info").toBe(true);
  });

  it("detects Bengali vs English for reply-language selection only", () => {
    expect(detectLanguage("আমার সিস্টেম তথ্য দেখাও")).toBe("bn");
    expect(detectLanguage("show me system information")).toBe("en");
  });
});
