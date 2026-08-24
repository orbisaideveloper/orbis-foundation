// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const manager = require("../ai/AIProviderManager.cjs");
const originalProviders = manager.providers;
const originalActive = manager.activeProviderName;

afterEach(() => {
  manager.providers = originalProviders;
  manager.activeProviderName = originalActive;
  vi.restoreAllMocks();
});

describe("AIProviderManager bounded fallback", () => {
  it("tries at most one fallback and does not retry either provider", async () => {
    const first = {
      name: "first",
      generateChat: vi.fn().mockRejectedValue(
        Object.assign(new Error("unavailable"), {
          code: "PROVIDER_UNAVAILABLE",
        }),
      ),
    };
    const second = {
      name: "second",
      generateChat: vi.fn().mockResolvedValue({
        content: "fallback reply",
        provider: { name: "second", type: "local" },
      }),
    };
    const third = { name: "third", generateChat: vi.fn() };
    manager.providers = new Map([
      [first.name, first],
      [second.name, second],
      [third.name, third],
    ]);
    manager.activeProviderName = first.name;

    await expect(
      manager.generateChat([{ role: "user", content: "transient" }], {
        timeoutMs: 2_000,
      }),
    ).resolves.toMatchObject({ content: "fallback reply" });
    expect(first.generateChat).toHaveBeenCalledTimes(1);
    expect(second.generateChat).toHaveBeenCalledTimes(1);
    expect(second.generateChat).toHaveBeenCalledWith(expect.any(Array), {
      timeoutMs: 2_000,
    });
    expect(third.generateChat).not.toHaveBeenCalled();
  });
});
