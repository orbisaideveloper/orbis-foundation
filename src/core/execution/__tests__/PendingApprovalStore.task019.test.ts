import { describe, expect, it, vi } from "vitest";
import { PendingApprovalStore } from "../authorization/PendingApprovalStore";

const CAPABILITY_ID = "termux.file.read";
const FILE_KEY = "package.json";

describe("TASK-019 PendingApprovalStore", () => {
  const request = {
    requestId: "brain-req-test-1",
    capability: CAPABILITY_ID,
    input: { path: FILE_KEY },
    requestedRuntime: "TermuxRuntime",
  } as any;

  it("creates a high-entropy expiring approval bound to the exact request", () => {
    const store = new PendingApprovalStore(180000);
    const pending = store.create(request);
    expect(pending.token.length).toBeGreaterThanOrEqual(40);
    expect(pending.capabilityId).toBe(CAPABILITY_ID);
    expect(pending.input).toEqual({ path: FILE_KEY });
    expect(pending.requestId).toBe(request.requestId);
    expect(pending.expiresAt).toBeGreaterThan(pending.createdAt);
  });

  it("approves exactly once and rejects replay", () => {
    const store = new PendingApprovalStore();
    const pending = store.create(request);
    const first = store.resolve(pending.token, "APPROVE");
    const second = store.resolve(pending.token, "APPROVE");
    expect(first.resolution).toBe("APPROVED");
    expect(first.request?.input).toEqual({ path: FILE_KEY });
    expect(second.resolution).toBe("REPLAY");
  });

  it("rejects without returning an executable request", () => {
    const store = new PendingApprovalStore();
    const pending = store.create(request);
    const result = store.resolve(pending.token, "REJECT");
    expect(result.resolution).toBe("REJECTED");
    expect(result.request).toBeUndefined();
  });

  it("expires pending approval", () => {
    vi.useFakeTimers();
    try {
      const store = new PendingApprovalStore(1000);
      const pending = store.create(request);
      vi.advanceTimersByTime(1001);
      expect(store.resolve(pending.token, "APPROVE").resolution).toBe(
        "EXPIRED",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
