import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { TermuxRuntime } from "../runtimes/TermuxRuntime";
import { TermuxRuntimeService } from "../runtimes/TermuxRuntimeService";
import { RuntimeRegistry } from "../registry/RuntimeRegistry";
import { RuntimeLifecycleManager } from "../lifecycle/RuntimeLifecycleManager";
import { ICapability } from "../registry/CapabilityModel";
import { ControlledCapabilityExecution } from "../../brain/ControlledCapabilityExecution";

const RUNTIME_NAME = "TermuxRuntime";
const CAP_SAFE = "termux.system.info";
const CAP_PRIVILEGED = "task009.privileged.cap";
const CAP_SENSITIVE = "task009.sensitive.cap";
const CAP_DISABLED = "task009.disabled.cap";
const CAP_POLICY_DENIED = "termux.shell.diagnostics";
const CAP_UNKNOWN = "task009.unknown.cap";

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
      if (url.includes("/capability")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              runtime: RUNTIME_NAME,
              data: { platform: "ANDROID-TERMUX" },
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

function stubInvalidIdentityFetch() {
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
              identity: { valid: false },
              capabilities: [],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    }),
  );
}

function buildTestService(): TermuxRuntimeService {
  const registry = new RuntimeRegistry();
  const lifecycle = new RuntimeLifecycleManager();
  const registrant = new TermuxRuntime();

  const capabilities: ICapability[] = [
    {
      id: CAP_SAFE,
      name: "System Info",
      description: "Get structured system info",
      riskLevel: "SAFE",
      requiresApproval: false,
      enabled: true,
      runtime: RUNTIME_NAME,
    },
    {
      id: CAP_PRIVILEGED,
      name: "Privileged Test Capability",
      description: "TASK-009 test-only privileged capability",
      riskLevel: "PRIVILEGED",
      requiresApproval: false,
      enabled: true,
      runtime: RUNTIME_NAME,
    },
    {
      id: CAP_SENSITIVE,
      name: "Sensitive Test Capability",
      description: "TASK-009 test-only sensitive capability",
      riskLevel: "SENSITIVE",
      requiresApproval: true,
      enabled: true,
      runtime: RUNTIME_NAME,
    },
    {
      id: CAP_DISABLED,
      name: "Disabled Test Capability",
      description: "TASK-009 test-only disabled capability",
      riskLevel: "SAFE",
      requiresApproval: false,
      enabled: false,
      runtime: RUNTIME_NAME,
    },
    {
      id: CAP_POLICY_DENIED,
      name: "Shell-named Test Capability",
      description:
        "TASK-009 test-only capability whose id triggers ExecutionPolicyEngine's raw-command keyword denial",
      riskLevel: "SAFE",
      requiresApproval: false,
      enabled: true,
      runtime: RUNTIME_NAME,
    },
  ];

  registry.registerRuntime(registrant, capabilities);
  lifecycle.register(
    RUNTIME_NAME,
    registrant.getVersion(),
    capabilities.map((c) => c.id),
  );

  return new TermuxRuntimeService(registry, lifecycle);
}

describe("TASK-009: Policy + Authorization enforced at TermuxRuntimeService.executeCapability()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("1. Connected + authorized SAFE capability succeeds with real structured result", async () => {
    const service = buildTestService();
    stubConnectedFetch([CAP_SAFE]);
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    const result = await service.executeCapability({
      requestId: "task009-1",
      capability: CAP_SAFE,
      input: {},
    });

    expect(result.success).toBe(true);
    expect(result.requestId).toBe("task009-1");
    expect(result.output).toBeDefined();
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  test("2. Disconnected bridge denies execution; execute() never called", async () => {
    const service = buildTestService();
    stubUnreachableFetch();
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    const result = await service.executeCapability({
      requestId: "task009-2",
      capability: CAP_SAFE,
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("BRIDGE_UNREACHABLE");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test("3. Invalid identity denies execution", async () => {
    const service = buildTestService();
    stubInvalidIdentityFetch();
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    const result = await service.executeCapability({
      requestId: "task009-3",
      capability: CAP_SAFE,
      input: {},
    });

    expect(result.success).toBe(false);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test("4. Unknown capability denies execution", async () => {
    const service = buildTestService();
    stubConnectedFetch([CAP_SAFE]);
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    const result = await service.executeCapability({
      requestId: "task009-4",
      capability: CAP_UNKNOWN,
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AUTHORIZATION_DENIED");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test("5. Disabled capability denies execution", async () => {
    const service = buildTestService();
    stubConnectedFetch([CAP_SAFE, CAP_DISABLED]);
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    const result = await service.executeCapability({
      requestId: "task009-5",
      capability: CAP_DISABLED,
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AUTHORIZATION_DENIED");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test("6. PRIVILEGED capability denies execution", async () => {
    const service = buildTestService();
    stubConnectedFetch([CAP_SAFE, CAP_PRIVILEGED]);
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    const result = await service.executeCapability({
      requestId: "task009-6",
      capability: CAP_PRIVILEGED,
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AUTHORIZATION_DENIED");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test("7. SENSITIVE / approval-required capability does not execute", async () => {
    const service = buildTestService();
    stubConnectedFetch([CAP_SAFE, CAP_SENSITIVE]);
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    const result = await service.executeCapability({
      requestId: "task009-7",
      capability: CAP_SENSITIVE,
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AUTHORIZATION_REQUIRE_APPROVAL");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test("8. Policy DENY prevents execution", async () => {
    const service = buildTestService();
    stubConnectedFetch([CAP_SAFE, CAP_POLICY_DENIED]);
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    const result = await service.executeCapability({
      requestId: "task009-8",
      capability: CAP_POLICY_DENIED,
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AUTHORIZATION_DENIED");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test("9. Authorized request reaches execution exactly once", async () => {
    const service = buildTestService();
    stubConnectedFetch([CAP_SAFE]);
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    await service.executeCapability({
      requestId: "task009-9",
      capability: CAP_SAFE,
      input: {},
    });

    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  test("10. Multiple DENY/REQUIRE_APPROVAL calls never execute", async () => {
    const service = buildTestService();
    stubConnectedFetch([CAP_SAFE, CAP_PRIVILEGED, CAP_SENSITIVE, CAP_DISABLED]);
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    await service.executeCapability({
      requestId: "task009-10a",
      capability: CAP_PRIVILEGED,
      input: {},
    });
    await service.executeCapability({
      requestId: "task009-10b",
      capability: CAP_SENSITIVE,
      input: {},
    });
    await service.executeCapability({
      requestId: "task009-10c",
      capability: CAP_DISABLED,
      input: {},
    });
    await service.executeCapability({
      requestId: "task009-10d",
      capability: CAP_UNKNOWN,
      input: {},
    });

    expect(executeSpy).not.toHaveBeenCalled();
  });

  test("11. ControlledCapabilityExecution is a thin pass-through", async () => {
    const service = buildTestService();
    stubConnectedFetch([CAP_SAFE]);
    const executeCapabilitySpy = vi.spyOn(service, "executeCapability");

    const controlled = new ControlledCapabilityExecution(service);
    const result = await controlled.execute({
      requestId: "task009-11",
      capability: CAP_SAFE,
      input: {},
    });

    expect(executeCapabilitySpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  test("12. ControlledCapabilityExecution forwards DENY unchanged", async () => {
    const service = buildTestService();
    stubConnectedFetch([CAP_SAFE, CAP_PRIVILEGED]);
    const executeSpy = vi.spyOn(TermuxRuntime.prototype, "execute");

    const controlled = new ControlledCapabilityExecution(service);
    const result = await controlled.execute({
      requestId: "task009-12",
      capability: CAP_PRIVILEGED,
      input: {},
    });

    expect(result.success).toBe(false);
    expect(executeSpy).not.toHaveBeenCalled();
  });
});
