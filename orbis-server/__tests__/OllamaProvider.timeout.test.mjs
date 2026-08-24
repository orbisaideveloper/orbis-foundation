// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OllamaProvider = require("../ai/providers/OllamaProvider.cjs");

afterEach(() => vi.restoreAllMocks());

describe("Ollama provider timeout and health", () => {
  it("aborts a bounded request and reports a normalized timeout", async () => {
    vi.spyOn(global, "fetch").mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            const error = new Error("aborted with sensitive provider details");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const provider = new OllamaProvider();
    await expect(
      provider.generateChat([{ role: "user", content: "private input" }], {
        timeoutMs: 1,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
    expect(provider.getMetadata().health.state).toBe("UNAVAILABLE");
  });
});
