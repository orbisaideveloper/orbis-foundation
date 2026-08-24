import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatStorageManager,
  DEFAULT_CHAT_STORAGE_BUDGET_BYTES,
  STORAGE_WARNING_RATIO,
} from "../ChatStorageManager";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ChatStorageManager privacy contract", () => {
  it("keeps consent partitioned by profile and defaults to 500 MB", () => {
    const storage = new ChatStorageManager();
    expect(DEFAULT_CHAT_STORAGE_BUDGET_BYTES).toBe(500 * 1024 * 1024);
    expect(STORAGE_WARNING_RATIO).toBe(0.8);
    expect(storage.getConsent("account-a")).toBeNull();
    storage.setConsent("account-a", "accepted");
    storage.setConsent("account-b", "declined");
    expect(storage.getConsent("account-a")).toBe("accepted");
    expect(storage.getConsent("account-b")).toBe("declined");
    expect(storage.getLearningConsent("account-a")).toBeNull();
    storage.setLearningConsent("account-a", "accepted");
    storage.setLearningConsent("account-b", "declined");
    expect(storage.getLearningConsent("account-a")).toBe("accepted");
    expect(storage.getLearningConsent("account-b")).toBe("declined");
  });

  it("creates one stable device-local anonymous profile", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "anonymous-id" });
    const storage = new ChatStorageManager();
    expect(storage.getOrCreateAnonymousProfileId()).toBe(
      "anonymous-anonymous-id",
    );
    expect(storage.getOrCreateAnonymousProfileId()).toBe(
      "anonymous-anonymous-id",
    );
  });

  it("fails with a bounded error when IndexedDB initialization hangs", async () => {
    vi.stubGlobal("indexedDB", { open: vi.fn(() => ({})) });
    const storage = new ChatStorageManager();
    await expect(storage.init(5)).rejects.toThrow("STORAGE_INIT_TIMEOUT");
  });

  it.each([
    ["getPendingClarification", "clarifications", ["account-a", "chat-a"]],
    ["getCachedResponse", "responseCache", ["cache-key"]],
  ] as const)(
    "deletes expired records transactionally through %s",
    async (method, expectedStore, args) => {
      const deleted: string[] = [];
      const value = { expiresAt: Date.now() - 1 };
      const request: Record<string, unknown> = { result: value };
      const store = {
        get: vi.fn(() => {
          queueMicrotask(() => (request.onsuccess as () => void)());
          return request;
        }),
        delete: vi.fn((key: string) => deleted.push(key)),
      };
      const transaction: Record<string, any> = {
        objectStore: vi.fn(() => store),
      };
      const storage = new ChatStorageManager();
      (storage as any).db = {
        transaction: vi.fn((storeName: string, mode: string) => {
          expect(storeName).toBe(expectedStore);
          expect(mode).toBe("readwrite");
          setTimeout(() => transaction.oncomplete?.(), 0);
          return transaction;
        }),
      };

      await expect((storage[method] as any)(...args)).resolves.toBeNull();
      expect(deleted).toEqual([
        method === "getPendingClarification" ? "account-a:chat-a" : "cache-key",
      ]);
    },
  );
});
