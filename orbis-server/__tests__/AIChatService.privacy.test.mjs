// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const providerManager = require("../ai/AIProviderManager.cjs");
const service = require("../ai/AIChatService.cjs");

afterEach(() => vi.restoreAllMocks());

describe("AIChatService content-safe logging", () => {
  it("does not log raw messages or provider details on failure", async () => {
    const raw = "private prompt secret-123";
    vi.spyOn(providerManager, "generateChat").mockRejectedValue(
      new Error(`provider failed while handling ${raw}`),
    );
    const logged = [];
    vi.spyOn(console, "error").mockImplementation((...values) => {
      logged.push(values.join(" "));
    });

    await expect(
      service.processChatRequest([{ role: "user", content: raw }]),
    ).rejects.toThrow("CHAT_BACKEND_UNAVAILABLE");
    expect(logged.join(" ")).not.toContain(raw);
    expect(logged.join(" ")).not.toContain("provider failed");
  });
});
