import { describe, expect, it, vi } from "vitest";
import {
  CHAT_CACHE_TTL_MS,
  DeviceChatRequestCache,
  cacheKey,
  classifyFreshness,
  normalizeChatQuery,
} from "../DeviceChatRequestCache";

describe("device-local normalized query cache", () => {
  it("normalizes equivalent queries and assigns explicit freshness classes", () => {
    expect(normalizeChatQuery("  Kolkata   WEATHER? ")).toBe("kolkata weather");
    expect(classifyFreshness("আজকের weather বলো")).toBe("weather");
    expect(classifyFreshness("latest news")).toBe("news");
    expect(classifyFreshness("BTC price")).toBe("price");
    expect(CHAT_CACHE_TTL_MS.price).toBeLessThan(CHAT_CACHE_TTL_MS.weather);
    expect(CHAT_CACHE_TTL_MS.weather).toBeLessThan(CHAT_CACHE_TTL_MS.stable);
  });

  it("uses pending clarification context in the profile-partitioned key", () => {
    const pending = {
      kind: "weather-location" as const,
      originalRequest: "আজকের weather বলো",
      createdAt: 1,
      expiresAt: 2,
    };
    expect(cacheKey("account-a", "কলকাতা", pending)).toContain("account-a:");
    expect(cacheKey("account-a", "কলকাতা", pending)).not.toBe(
      cacheKey("account-b", "কলকাতা", pending),
    );
    expect(cacheKey("account-a", "কলকাতা", pending, "chat-a")).not.toBe(
      cacheKey("account-a", "কলকাতা", pending, "chat-b"),
    );
  });

  it("deduplicates concurrent identical requests and never serves expired volatile data", async () => {
    let now = 1_000;
    const records = new Map<string, any>();
    const storage = {
      getCachedResponse: vi.fn(async (key: string) => records.get(key) || null),
      saveCachedResponse: vi.fn(async (value: any) =>
        records.set(value.key, value),
      ),
    };
    const cache = new DeviceChatRequestCache(storage, () => now);
    let resolveRequest!: (value: any) => void;
    const request = vi.fn(
      () =>
        new Promise<any>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const options = {
      profileId: "account-a",
      query: "Kolkata weather",
      persistent: true,
      request,
    };
    const first = cache.run(options);
    const second = cache.run(options);
    await Promise.resolve();
    resolveRequest({
      message: { role: "assistant", content: "fresh" },
      provider: { name: "Tavily", type: "WEB_SEARCH" },
    });
    await expect(first).resolves.toMatchObject({ cached: false });
    await expect(second).resolves.toMatchObject({ cached: false });
    expect(request).toHaveBeenCalledTimes(1);

    now += CHAT_CACHE_TTL_MS.weather + 1;
    const refreshed = vi.fn().mockResolvedValue({
      message: { role: "assistant", content: "new" },
      provider: { name: "Tavily", type: "WEB_SEARCH" },
    });
    await cache.run({ ...options, request: refreshed });
    expect(refreshed).toHaveBeenCalledTimes(1);
  });
});
