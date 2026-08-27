// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  askAI,
  createReadlineInterface,
  formatAiSuggestionForTerminal,
  displayAiSuggestion,
  runHealer,
} = require("../ai-healer.cjs");

afterEach(() => vi.restoreAllMocks());

describe("AI Healer", () => {
  it("requests one non-streaming suggestion from the configured local endpoint", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      json: vi.fn().mockResolvedValue({ response: "Check the failing hook." }),
    });

    await expect(askAI("lint failed")).resolves.toBe("Check the failing hook.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/generate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: "qwen2.5",
      prompt: "lint failed",
      stream: false,
    });
  });

  it("returns a generic failure without logging request details", async () => {
    const privateFailure = new Error("provider failed for private prompt");
    vi.spyOn(global, "fetch").mockRejectedValue(privateFailure);
    const logged = [];
    vi.spyOn(console, "error").mockImplementation((...values) => {
      logged.push(values.join(" "));
    });

    await expect(askAI("private prompt")).resolves.toBeNull();
    expect(logged.join(" ")).toContain("Unable to request an AI suggestion");
    expect(logged.join(" ")).not.toContain("private prompt");
  });

  it("formats bounded terminal-safe suggestions and displays only that result", () => {
    expect(
      formatAiSuggestionForTerminal("\u001b[2JUse\r\nthis\u0007 advice"),
    ).toBe("[2JUse\nthis advice");
    expect(formatAiSuggestionForTerminal(" \n\t ")).toBeNull();
    expect(formatAiSuggestionForTerminal(42)).toBeNull();
    expect(formatAiSuggestionForTerminal("x".repeat(4001))).toHaveLength(4000);

    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    displayAiSuggestion("Safe suggestion");
    expect(write).toHaveBeenCalledWith(
      "\n💡 [AI Suggestion]:\n\x1b[36mSafe suggestion\x1b[0m\n\n",
    );
  });

  it("creates the readline interface only when the interactive flow needs it", () => {
    const readline = require("node:readline");
    const close = vi.fn();
    const interfaceMock = { close };
    const createInterface = vi
      .spyOn(readline, "createInterface")
      .mockReturnValue(interfaceMock);

    expect(createReadlineInterface()).toBe(interfaceMock);
    expect(createInterface).toHaveBeenCalledWith({
      input: process.stdin,
      output: process.stdout,
    });
  });

  it("handles unavailable, accepted, and declined suggestions without writing files", async () => {
    const log = vi.fn();
    const exit = vi.fn();
    const requestSuggestion = vi.fn().mockResolvedValue(null);
    const createInterface = vi.fn();

    await runHealer({
      errorType: "lint failed",
      requestSuggestion,
      log,
      exit,
      createInterface,
    });

    expect(requestSuggestion).toHaveBeenCalledWith(
      expect.stringContaining("lint failed"),
    );
    expect(createInterface).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);

    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const acceptClose = vi.fn();
    const acceptExit = vi.fn();
    await runHealer({
      requestSuggestion: vi.fn().mockResolvedValue("Apply the safe fix."),
      log,
      exit: acceptExit,
      createInterface: () => ({
        question: (_prompt, answer) => answer("Y"),
        close: acceptClose,
      }),
    });
    expect(write).toHaveBeenCalledWith(
      "\n💡 [AI Suggestion]:\n\x1b[36mApply the safe fix.\x1b[0m\n\n",
    );
    expect(acceptExit).toHaveBeenCalledWith(0);
    expect(acceptClose).toHaveBeenCalledOnce();

    const declineClose = vi.fn();
    const declineExit = vi.fn();
    await runHealer({
      requestSuggestion: vi.fn().mockResolvedValue("Apply the safe fix."),
      log,
      exit: declineExit,
      createInterface: () => ({
        question: (_prompt, answer) => answer("n"),
        close: declineClose,
      }),
    });
    expect(declineExit).toHaveBeenCalledWith(1);
    expect(declineClose).toHaveBeenCalledOnce();
  });
});
