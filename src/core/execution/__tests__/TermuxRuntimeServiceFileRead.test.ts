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
      input: { path: "package.json" },
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
