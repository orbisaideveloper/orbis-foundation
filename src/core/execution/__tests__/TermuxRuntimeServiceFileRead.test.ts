import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { TermuxRuntime } from "../runtimes/TermuxRuntime";
import { TermuxRuntimeService } from "../runtimes/TermuxRuntimeService";
import { RuntimeRegistry } from "../registry/RuntimeRegistry";
import { RuntimeLifecycleManager } from "../lifecycle/RuntimeLifecycleManager";

/**
 * TASK-018 (Section 3.A) — termux.file.read
 *
 * These tests exercise the REAL registration logic added to
 * TermuxRuntimeService.check() (not a hand-built synthetic registry), and
 * confirm the existing, unmodified ExecutionPolicyEngine /
 * SecureExecutionAuthorizationGate chain continues to route a SENSITIVE
 * capability to REQUIRE_APPROVAL without ever calling
 * TermuxRuntime.execute() — exactly as it already does for any other
 * SENSITIVE capability (see TermuxRuntimeServiceAuthorization.test.ts,
 * test 7, which is left untouched by this task).
 */

const RUNTIME_NAME = "TermuxRuntime";
const CAP_SYSTEM_INFO = "termux.system.info";
const CAP_FILE_READ = "termux.file.read";
// TASK-019 lint fix: sonarjs/no-duplicate-string flags 5+ repeats of the
// same literal — these were "package.json" / "README.md" typed inline
// at each call site. Centralized here instead.
const FILE_PACKAGE_JSON = "package.json";
const FILE_README = "README.md";

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

describe("TASK-018 (3.A): termux.file.read registration + authorization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("check() registers termux.file.read as SENSITIVE + requiresApproval, alongside the unchanged termux.system.info", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service = new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch([CAP_SYSTEM_INFO, CAP_FILE_READ]);
    await service.check();

    const fileReadCap = registry.getCapability(CAP_FILE_READ);
    expect(fileReadCap).toBeDefined();
    expect(fileReadCap?.riskLevel).toBe("SENSITIVE");
    expect(fileReadCap?.requiresApproval).toBe(true);
    expect(fileReadCap?.enabled).toBe(true);
    expect(fileReadCap?.runtime).toBe(RUNTIME_NAME);

    // Proof termux.system.info was not changed by this task.
    const systemInfoCap = registry.getCapability(CAP_SYSTEM_INFO);
    expect(systemInfoCap).toEqual({
      id: CAP_SYSTEM_INFO,
      name: "System Info",
      description: "Get structured system info",
      riskLevel: "SAFE",
      requiresApproval: false,
      enabled: true,
      runtime: RUNTIME_NAME,
    });
  });

  test("SENSITIVE termux.file.read is always REQUIRE_APPROVAL and never reaches TermuxRuntime.execute()", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service = new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch([CAP_SYSTEM_INFO, CAP_FILE_READ]);
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    const result = await service.executeCapability({
      requestId: "task018-1",
      capability: CAP_FILE_READ,
      input: { path: FILE_PACKAGE_JSON },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AUTHORIZATION_REQUIRE_APPROVAL");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test("existing termux.system.info authorization behavior is unaffected (still SAFE + ALLOW)", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service = new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch([CAP_SYSTEM_INFO, CAP_FILE_READ]);
    const executeSpy = vi
      .spyOn(TermuxRuntime.prototype, "execute")
      .mockResolvedValue({
        success: true,
        requestId: "task018-2",
        runtime: RUNTIME_NAME,
        output: { platform: "LINUX" },
        durationMs: 1,
      });

    const result = await service.executeCapability({
      requestId: "task018-2",
      capability: CAP_SYSTEM_INFO,
      input: {},
    });

    expect(result.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });
});

/**
 * TASK-019 — end-to-end regression for the exact bug this task fixes:
 * a termux.file.read request with a real path in `input` must still have
 * that exact path when it finally reaches TermuxRuntime.execute() after
 * approval — proving PendingApprovalStore.create() -> resolve() ->
 * TermuxRuntimeService.resolveApproval() never drops or resets `input`.
 * (The other half of the original bug — matchRequest() ever creating an
 * approval with input:{} in the first place — is covered separately in
 * orbis-server/__tests__/ChatCapabilityIntentMatcher.test.mjs and
 * orbis-server/__tests__/AIChatService.brain.test.mjs.)
 */
describe("TASK-019: termux.file.read full approval -> execution round trip", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("package.json: approval preserves input.path through to execute()", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service = new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch([CAP_SYSTEM_INFO, CAP_FILE_READ]);
    const executeSpy = vi
      .spyOn(TermuxRuntime.prototype, "execute")
      .mockResolvedValue({
        success: true,
        requestId: "task019-pkg",
        runtime: RUNTIME_NAME,
        output: { path: FILE_PACKAGE_JSON, content: "{}" },
        durationMs: 1,
      });

    const first = await service.executeCapability({
      requestId: "task019-pkg",
      capability: CAP_FILE_READ,
      input: { path: FILE_PACKAGE_JSON },
    });

    expect(first.success).toBe(false);
    expect(first.approvalRequired).toBe(true);
    expect(typeof first.approvalToken).toBe("string");
    expect(executeSpy).not.toHaveBeenCalled();

    const approved = await service.resolveApproval(
      first.approvalToken as string,
      "APPROVE",
    );

    expect(approved.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    // The exact regression this task fixes: the path must still be
    // package.json at execution time, never {} / undefined.
    expect(executeSpy.mock.calls[0][0].input).toEqual({
      path: FILE_PACKAGE_JSON,
    });
  });

  test("README.md: approval preserves input.path through to execute()", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service = new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch([CAP_SYSTEM_INFO, CAP_FILE_READ]);
    const executeSpy = vi
      .spyOn(TermuxRuntime.prototype, "execute")
      .mockResolvedValue({
        success: true,
        requestId: "task019-readme",
        runtime: RUNTIME_NAME,
        output: { path: FILE_README, content: "# ORBIS" },
        durationMs: 1,
      });

    const first = await service.executeCapability({
      requestId: "task019-readme",
      capability: CAP_FILE_READ,
      input: { path: FILE_README },
    });

    const approved = await service.resolveApproval(
      first.approvalToken as string,
      "APPROVE",
    );

    expect(approved.success).toBe(true);
    expect(executeSpy.mock.calls[0][0].input).toEqual({ path: FILE_README });
  });

  test("rejecting the approval never reaches execute()", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service = new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch([CAP_SYSTEM_INFO, CAP_FILE_READ]);
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    const first = await service.executeCapability({
      requestId: "task019-reject",
      capability: CAP_FILE_READ,
      input: { path: FILE_PACKAGE_JSON },
    });

    const rejected = await service.resolveApproval(
      first.approvalToken as string,
      "REJECT",
    );

    expect(rejected.success).toBe(false);
    expect(rejected.error).toBe("APPROVAL_REJECTED");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test("an approval created with input:{} (the old bug's shape) still authorizes fine but never magically gains a path — proves the fix belongs upstream in the matcher, not here", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service = new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch([CAP_SYSTEM_INFO, CAP_FILE_READ]);
    const executeSpy = vi
      .spyOn(TermuxRuntime.prototype, "execute")
      .mockResolvedValue({
        success: true,
        requestId: "task019-empty",
        runtime: RUNTIME_NAME,
        output: {},
        durationMs: 1,
      });

    const first = await service.executeCapability({
      requestId: "task019-empty",
      capability: CAP_FILE_READ,
      input: {},
    });

    const approved = await service.resolveApproval(
      first.approvalToken as string,
      "APPROVE",
    );

    // Authorization/execution layer behaves exactly as designed: it
    // faithfully forwards whatever input it was given. This is why the
    // real fix (never create such an approval from chat text in the
    // first place) belongs in ChatCapabilityIntentMatcher.matchRequest(),
    // not here.
    expect(approved.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy.mock.calls[0][0].input).toEqual({});
  });
});
