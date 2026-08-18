import { describe, it, expect } from "vitest";

const { match, matchRequest, detectLanguage } = require("../ai/brain/ChatCapabilityIntentMatcher.cjs");

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

describe("TASK-019: ChatCapabilityIntentMatcher.matchRequest() file-read routing", () => {
  it("resolves package.json from English variants", () => {
    expect(matchRequest("read file package.json")).toEqual({
      capabilityId: "termux.file.read",
      input: { path: "package.json" },
      needsInput: false,
    });
    expect(matchRequest("open the file package json")).toEqual({
      capabilityId: "termux.file.read",
      input: { path: "package.json" },
      needsInput: false,
    });
  });

  it("resolves package.json from the Bengali variant", () => {
    expect(matchRequest("ফাইল পড়ো প্যাকেজ জেসন")).toEqual({
      capabilityId: "termux.file.read",
      input: { path: "package.json" },
      needsInput: false,
    });
  });

  it("resolves README.md from English variants, including the bare 'readme' form", () => {
    expect(matchRequest("read file README.md")).toEqual({
      capabilityId: "termux.file.read",
      input: { path: "README.md" },
      needsInput: false,
    });
    expect(matchRequest("show file contents readme")).toEqual({
      capabilityId: "termux.file.read",
      input: { path: "README.md" },
      needsInput: false,
    });
  });

  it("resolves README.md from the Bengali variant", () => {
    expect(matchRequest("ফাইল দেখাও রিডমি")).toEqual({
      capabilityId: "termux.file.read",
      input: { path: "README.md" },
      needsInput: false,
    });
  });

  it("TASK-019 regression: a generic file-read phrase with no determinable file asks for one instead of producing input:{}", () => {
    const result = matchRequest("read file");
    expect(result).toEqual({
      capabilityId: "termux.file.read",
      input: {},
      needsInput: true,
    });
  });

  it("never resolves an arbitrary or traversal-style filename, even if present in the message", () => {
    const result = matchRequest("read file ../../etc/passwd");
    expect(result.needsInput).toBe(true);
    expect(result.input).toEqual({});
  });

  it("system.info requests are unaffected and never set needsInput", () => {
    expect(matchRequest("show me system information")).toEqual({
      capabilityId: "termux.system.info",
      input: {},
      needsInput: false,
    });
  });

  it("returns null for unmatched conversation, same as match()", () => {
    expect(matchRequest("Hello")).toBeNull();
  });
});
