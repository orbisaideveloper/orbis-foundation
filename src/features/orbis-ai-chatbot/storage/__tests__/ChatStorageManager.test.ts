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
});
