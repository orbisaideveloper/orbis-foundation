import { describe, expect, it, vi } from "vitest";
import { PendingApprovalStore } from "../authorization/PendingApprovalStore";

/**
 * TASK-020 (Part 3) — Approval State Synchronization.
 *
 * Verifies the PENDING -> RESERVED -> CONSUMED token lifecycle: an
 * APPROVE decision reserves (rather than immediately burning) a token,
 * a concurrent/replayed resolve() against a RESERVED token is rejected,
 * confirm() finalizes it, and release() returns it to PENDING so it can
 * be retried within its original TTL after a transient failure — the
 * core guarantee this task adds: an active, human-approved token must
 * never be permanently lost to a transient/environmental failure.
 */

const CAPABILITY_ID = "termux.file.read";
const FILE_KEY = "package.json";
// Lint (sonarjs/no-duplicate-string): centralized, same pattern already
// used elsewhere in this repo (see TermuxRuntimeServiceFileRead.test.ts).
const APPROVE = "APPROVE" as const;
const REJECT = "REJECT" as const;

describe("TASK-020 PendingApprovalStore: PENDING -> RESERVED -> CONSUMED", () => {
  const request = {
    requestId: "brain-req-task020-1",
    capability: CAPABILITY_ID,
    input: { path: FILE_KEY },
    requestedRuntime: "TermuxRuntime",
  } as any;

  it("APPROVE reserves the token (does not immediately consume it)", () => {
    const store = new PendingApprovalStore();
    const pending = store.create(request);

    const resolved = store.resolve(pending.token, APPROVE);

    expect(resolved.resolution).toBe("APPROVED");
    expect(resolved.request?.input).toEqual({ path: FILE_KEY });
  });

  it("a second resolve() against a RESERVED token is rejected as REPLAY (no double-execution)", () => {
    const store = new PendingApprovalStore();
    const pending = store.create(request);

    store.resolve(pending.token, APPROVE);
    const second = store.resolve(pending.token, APPROVE);

    expect(second.resolution).toBe("REPLAY");
  });

  it("release() returns a RESERVED token to PENDING so it can be resolved again", () => {
    const store = new PendingApprovalStore();
    const pending = store.create(request);

    store.resolve(pending.token, APPROVE);
    const released = store.release(pending.token);
    expect(released).toBe(true);

    // The same token is valid again — proves an active approval is not
    // lost after a transient failure.
    const retried = store.resolve(pending.token, APPROVE);
    expect(retried.resolution).toBe("APPROVED");
    expect(retried.request?.input).toEqual({ path: FILE_KEY });
  });

  it("confirm() finalizes a RESERVED token; it can never be resolved again", () => {
    const store = new PendingApprovalStore();
    const pending = store.create(request);

    store.resolve(pending.token, APPROVE);
    const confirmed = store.confirm(pending.token);
    expect(confirmed).toBe(true);

    const again = store.resolve(pending.token, APPROVE);
    expect(again.resolution).toBe("REPLAY");
  });

  it("confirm() is a no-op (returns false) on a token that is not RESERVED", () => {
    const store = new PendingApprovalStore();
    const pending = store.create(request);

    // Still PENDING — never approved.
    expect(store.confirm(pending.token)).toBe(false);
  });

  it("release() is a no-op (returns false) on a token that is not RESERVED", () => {
    const store = new PendingApprovalStore();
    const pending = store.create(request);

    expect(store.release(pending.token)).toBe(false);
  });

  it("release() finalizes (does not resurrect) a RESERVED token that has since expired", () => {
    vi.useFakeTimers();
    try {
      const store = new PendingApprovalStore(1000);
      const pending = store.create(request);

      store.resolve(pending.token, APPROVE);
      vi.advanceTimersByTime(1001);

      expect(store.release(pending.token)).toBe(false);
      expect(store.resolve(pending.token, APPROVE).resolution).toBe("REPLAY");
    } finally {
      vi.useRealTimers();
    }
  });

  it("REJECT remains an immediate, final decision (unchanged behavior)", () => {
    const store = new PendingApprovalStore();
    const pending = store.create(request);

    const result = store.resolve(pending.token, REJECT);

    expect(result.resolution).toBe("REJECTED");
    expect(result.request).toBeUndefined();
    // A rejected token is terminal — release()/confirm() cannot revive it.
    expect(store.release(pending.token)).toBe(false);
    expect(store.confirm(pending.token)).toBe(false);
  });
});
