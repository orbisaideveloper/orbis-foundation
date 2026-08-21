import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { TermuxRuntime } from "../runtimes/TermuxRuntime";
import { TermuxRuntimeService } from "../runtimes/TermuxRuntimeService";
import { RuntimeRegistry } from "../registry/RuntimeRegistry";
import { RuntimeLifecycleManager } from "../lifecycle/RuntimeLifecycleManager";

/**
 * TASK-020 (Part 3) — Approval State Synchronization.
 *
 * Proves the exact bug this task fixes: a valid, human-approved
 * approval token must never be permanently lost to a transient/
 * environmental failure (bridge momentarily unreachable) that has
 * nothing to do with whether the approval itself was valid. Before this
 * fix, PendingApprovalStore.resolve() irreversibly consumed the token
 * before bridge connectivity / re-authorization were even checked, so a
 * single transient blip burned the token permanently.
 */

const RUNTIME_NAME = "TermuxRuntime";
const CAP_SYSTEM_INFO = "termux.system.info";
const CAP_FILE_READ = "termux.file.read";
const FILE_PACKAGE_JSON = "package.json";
// Lint (sonarjs/no-duplicate-string): centralized, same pattern already
// used elsewhere in this repo (see TermuxRuntimeServiceFileRead.test.ts).
const APPROVE = "APPROVE" as const;

function stubConnectedFetch(discoveredCapabilityIds: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              runtime: RUNTIME_NAME,
              platform: "android-termux",
            }),
        });
      }
      if (url.includes("/handshake")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              identity: { valid: true },
              capabilities: discoveredCapabilityIds.map((id) => ({ id })),
              status: "CAPABILITIES_VERIFIED",
            }),
        });
      }
      return Promise.reject(new Error(`Unexpected URL in test: ${url}`));
    }),
  );
}

function stubUnreachableFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Connection refused")),
  );
}

describe("TASK-020: TermuxRuntimeService approval token survives a transient bridge failure", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("token created while connected, approved while bridge is transiently unreachable, then successfully retried once connected again", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service = new TermuxRuntimeService(registry, lifecycle);

    // 1) Bridge is connected: create the pending approval as usual.
    stubConnectedFetch([CAP_SYSTEM_INFO, CAP_FILE_READ]);
    const created = await service.executeCapability({
      requestId: "task020-sync-1",
      capability: CAP_FILE_READ,
      input: { path: FILE_PACKAGE_JSON },
    });
    expect(created.approvalRequired).toBe(true);
    const token = created.approvalToken as string;
    expect(typeof token).toBe("string");

    // 2) Bridge goes down right as the human approves.
    stubUnreachableFetch();
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");
    const duringOutage = await service.resolveApproval(token, APPROVE);

    expect(duringOutage.success).toBe(false);
    expect(duringOutage.error).toContain("BRIDGE_UNREACHABLE");
    expect(executeSpy).not.toHaveBeenCalled();

    // 3) Bridge recovers. THE SAME TOKEN — never re-issued — is retried
    // and now succeeds. Before this fix, the token would already have
    // been permanently consumed in step 2 and this call would return
    // APPROVAL_REPLAY / APPROVAL_INVALID instead of actually executing.
    stubConnectedFetch([CAP_SYSTEM_INFO, CAP_FILE_READ]);
    executeSpy.mockResolvedValue({
      success: true,
      requestId: "task020-sync-1",
      runtime: RUNTIME_NAME,
      output: { path: FILE_PACKAGE_JSON, content: "{}" },
      durationMs: 1,
    });

    const retried = await service.resolveApproval(token, APPROVE);

    expect(retried.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy.mock.calls[0][0].input).toEqual({
      path: FILE_PACKAGE_JSON,
    });
  });

  test("a token consumed by a genuine, non-transient denial (capability disabled) cannot be retried", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service = new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch([CAP_SYSTEM_INFO, CAP_FILE_READ]);
    const created = await service.executeCapability({
      requestId: "task020-sync-2",
      capability: CAP_FILE_READ,
      input: { path: FILE_PACKAGE_JSON },
    });
    const token = created.approvalToken as string;

    // Simulate the capability being disabled (e.g. by an admin) between
    // the original request and the approval — a genuine, non-transient
    // reason the request must never be allowed to execute.
    const cap = registry.getCapability(CAP_FILE_READ);
    expect(cap).toBeDefined();
    if (cap) cap.enabled = false;

    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");
    const result = await service.resolveApproval(token, APPROVE);

    expect(result.success).toBe(false);
    expect(result.error).toContain("AUTHORIZATION_DENIED");
    expect(executeSpy).not.toHaveBeenCalled();

    // The token is now terminally consumed — it must NOT be retryable,
    // unlike the transient BRIDGE_UNREACHABLE case above.
    const retried = await service.resolveApproval(token, APPROVE);
    expect(retried.success).toBe(false);
    expect(retried.error).toContain("APPROVAL_REPLAY");
  });

  test("concurrent double-approve of the same token never executes twice", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service = new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch([CAP_SYSTEM_INFO, CAP_FILE_READ]);
    const created = await service.executeCapability({
      requestId: "task020-sync-3",
      capability: CAP_FILE_READ,
      input: { path: FILE_PACKAGE_JSON },
    });
    const token = created.approvalToken as string;

    const executeSpy = vi
      .spyOn(TermuxRuntime.prototype, "execute")
      .mockResolvedValue({
        success: true,
        requestId: "task020-sync-3",
        runtime: RUNTIME_NAME,
        output: { path: FILE_PACKAGE_JSON, content: "{}" },
        durationMs: 1,
      });

    const [first, second] = await Promise.all([
      service.resolveApproval(token, APPROVE),
      service.resolveApproval(token, APPROVE),
    ]);

    const successes = [first, second].filter((r) => r.success);
    expect(successes.length).toBe(1);
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });
});
