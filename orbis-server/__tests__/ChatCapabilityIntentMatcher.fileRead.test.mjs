import { describe, it, expect } from "vitest";

const { match, detectLanguage } = require("../ai/brain/ChatCapabilityIntentMatcher.cjs");

const CAP_FILE_READ = "termux.file.read";
const CAP_SYSTEM_INFO = "termux.system.info";

describe("TASK-018 (3.A): ChatCapabilityIntentMatcher termux.file.read mapping", () => {
  it("matches an English file-read phrase to termux.file.read", () => {
    expect(match("read file")).toBe(CAP_FILE_READ);
    expect(match("please show file contents")).toBe(CAP_FILE_READ);
    expect(match("open the file")).toBe(CAP_FILE_READ);
  });

  it("matches a Bengali file-read phrase to termux.file.read", () => {
    expect(match("ফাইল দেখাও")).toBe(CAP_FILE_READ);
    expect(match("আমার ফাইল পড়ো")).toBe(CAP_FILE_READ);
  });

  it("is case-insensitive and tolerant of surrounding whitespace", () => {
    expect(match("   READ FILE please   ")).toBe(CAP_FILE_READ);
  });

  it("never extracts a path from the message itself (returns only the fixed capabilityId)", () => {
    const result = match("read file ../../etc/passwd");
    expect(result).toBe(CAP_FILE_READ);
  });

  it("does not confuse file-read phrases with system-info phrases", () => {
    expect(match("show system information")).toBe(CAP_SYSTEM_INFO);
    expect(match("read file")).not.toBe(CAP_SYSTEM_INFO);
  });

  it("returns null for normal conversation (never guesses)", () => {
    expect(match("Hello")).toBeNull();
    expect(match("Tell me a story")).toBeNull();
  });

  it("detects Bengali vs English for reply-language selection only", () => {
    expect(detectLanguage("ফাইল দেখাও")).toBe("bn");
    expect(detectLanguage("read file")).toBe("en");
  });
});
