import { RuntimeRegistry } from "../registry/RuntimeRegistry";
import { ExecutionPolicyEngine } from "../policy/ExecutionPolicyEngine";
import { ICapability, CapabilityRiskLevel } from "../registry/CapabilityModel";
import { IExecutionRuntime } from "../interfaces/IExecutionRuntime";
import { IExecutionRequest } from "../interfaces/IExecutionRequest";

const RUNTIME_NAME = "MockNodeRuntime";
const CAP_SAFE = "test.safe";
const CAP_SENSITIVE = "test.sensitive";
const CAP_PRIVILEGED = "test.privileged";

describe("TASK-002: Secure Execution Policy & Runtime Registry (Full Coverage)", () => {
  let registry: RuntimeRegistry;
  let policy: ExecutionPolicyEngine;
  let mockRuntime: IExecutionRuntime;

  beforeEach(() => {
    registry = new RuntimeRegistry();
    policy = new ExecutionPolicyEngine(registry);

    mockRuntime = {
      getName: () => RUNTIME_NAME,
      getVersion: () => "1.0.0",
      getSupportedCapabilities: () => [CAP_SAFE, CAP_SENSITIVE, CAP_PRIVILEGED],
      initialize: async () => {},
      healthCheck: async () => true,
      execute: async () => ({
        success: true,
        requestId: "test",
        runtime: RUNTIME_NAME,
        durationMs: 10,
      }),
      shutdown: async () => {},
    };
  });

  test("1. Runtime registration and lookup pass correctly", () => {
    registry.registerRuntime(mockRuntime, []);
    expect(registry.getRuntime(RUNTIME_NAME)).toBeDefined();
    expect(registry.listRuntimes()).toContain(RUNTIME_NAME);
  });

  test("2. Duplicate runtime registration is REJECTED", () => {
    registry.registerRuntime(mockRuntime, []);
    expect(() => registry.registerRuntime(mockRuntime, [])).toThrow(
      /already registered/,
    );
  });

  test("3. Unknown runtime capability is DENIED", () => {
    const request: IExecutionRequest = {
      requestId: "1",
      capability: "unknown.cap",
      input: {},
    };
    expect(policy.evaluate(request)).toBe("DENY");
  });

  test("4. Safe registered capability returns ALLOW", () => {
    const safeCap: ICapability = {
      id: CAP_SAFE,
      name: "Safe Task",
      description: "",
      riskLevel: "SAFE",
      requiresApproval: false,
      enabled: true,
      runtime: RUNTIME_NAME,
    };
    registry.registerRuntime(mockRuntime, [safeCap]);

    const request: IExecutionRequest = {
      requestId: "2",
      capability: CAP_SAFE,
      input: {},
    };
    expect(policy.evaluate(request)).toBe("ALLOW");
  });

  test("5. Sensitive capability returns REQUIRE_APPROVAL", () => {
    const sensitiveCap: ICapability = {
      id: CAP_SENSITIVE,
      name: "Sensitive Task",
      description: "",
      riskLevel: "SENSITIVE",
      requiresApproval: true,
      enabled: true,
      runtime: RUNTIME_NAME,
    };
    registry.registerRuntime(mockRuntime, [sensitiveCap]);

    const request: IExecutionRequest = {
      requestId: "3",
      capability: CAP_SENSITIVE,
      input: {},
    };
    expect(policy.evaluate(request)).toBe("REQUIRE_APPROVAL");
  });

  test("6. Privileged capability is strictly DENIED", () => {
    const privCap: ICapability = {
      id: CAP_PRIVILEGED,
      name: "Root Task",
      description: "",
      riskLevel: "PRIVILEGED",
      requiresApproval: false,
      enabled: true,
      runtime: RUNTIME_NAME,
    };
    registry.registerRuntime(mockRuntime, [privCap]);

    const request: IExecutionRequest = {
      requestId: "4",
      capability: CAP_PRIVILEGED,
      input: {},
    };
    expect(policy.evaluate(request)).toBe("DENY");
  });

  test("7. Arbitrary shell or restricted keywords in capability are DENIED", () => {
    const badCaps = [
      "shell.cmd",
      "bash.exec",
      "sh.run",
      "raw_command.test",
      "exec.now",
    ];
    badCaps.forEach((cap) => {
      const request: IExecutionRequest = {
        requestId: "5",
        capability: cap,
        input: {},
      };
      expect(policy.evaluate(request)).toBe("DENY");
    });
  });

  test("8. Runtime removal clears its capabilities and returns true/false correctly", () => {
    const safeCap: ICapability = {
      id: CAP_SAFE,
      name: "Safe Task",
      description: "",
      riskLevel: "SAFE",
      requiresApproval: false,
      enabled: true,
      runtime: RUNTIME_NAME,
    };
    registry.registerRuntime(mockRuntime, [safeCap]);

    expect(registry.unregisterRuntime("NonExistent")).toBe(false);
    expect(registry.unregisterRuntime(RUNTIME_NAME)).toBe(true);
    expect(registry.getRuntime(RUNTIME_NAME)).toBeUndefined();
    expect(registry.getCapability(CAP_SAFE)).toBeUndefined();

    const request: IExecutionRequest = {
      requestId: "6",
      capability: CAP_SAFE,
      input: {},
    };
    expect(policy.evaluate(request)).toBe("DENY");
  });

  test("9. Registering duplicate capability rolls back runtime and throws error", () => {
    const cap1: ICapability = {
      id: CAP_SAFE,
      name: "T1",
      description: "",
      riskLevel: "SAFE",
      requiresApproval: false,
      enabled: true,
      runtime: RUNTIME_NAME,
    };
    registry.registerRuntime(mockRuntime, [cap1]);

    const mockRuntime2: IExecutionRuntime = {
      ...mockRuntime,
      getName: () => "MockRuntime2",
    };
    const cap2: ICapability = {
      id: CAP_SAFE,
      name: "T2",
      description: "",
      riskLevel: "SAFE",
      requiresApproval: false,
      enabled: true,
      runtime: "MockRuntime2",
    };

    expect(() => registry.registerRuntime(mockRuntime2, [cap2])).toThrow(
      /already registered in the system/,
    );
    expect(registry.getRuntime("MockRuntime2")).toBeUndefined();
  });

  test("10. Request without capability or null request returns DENY", () => {
    expect(policy.evaluate(null as any)).toBe("DENY");
    expect(
      policy.evaluate({ requestId: "7", capability: "", input: {} } as any),
    ).toBe("DENY");
  });

  test("11. Disabled capability returns DENY", () => {
    const disabledCap: ICapability = {
      id: "test.disabled",
      name: "Disabled",
      description: "",
      riskLevel: "SAFE",
      requiresApproval: false,
      enabled: false,
      runtime: RUNTIME_NAME,
    };
    registry.registerRuntime(mockRuntime, [disabledCap]);
    const request: IExecutionRequest = {
      requestId: "8",
      capability: "test.disabled",
      input: {},
    };
    expect(policy.evaluate(request)).toBe("DENY");
  });

  test("12. Capability with unknown or missing runtime returns DENY", () => {
    const orphanCap: ICapability = {
      id: "test.orphan",
      name: "Orphan",
      description: "",
      riskLevel: "SAFE",
      requiresApproval: false,
      enabled: true,
      runtime: "GhostRuntime",
    };
    registry.registerRuntime(mockRuntime, [orphanCap]);
    const request: IExecutionRequest = {
      requestId: "9",
      capability: "test.orphan",
      input: {},
    };
    expect(policy.evaluate(request)).toBe("DENY");
  });

  test("13. Safe capability with requiresApproval flag returns REQUIRE_APPROVAL", () => {
    const approvalCap: ICapability = {
      id: "test.approval",
      name: "Appr",
      description: "",
      riskLevel: "SAFE",
      requiresApproval: true,
      enabled: true,
      runtime: RUNTIME_NAME,
    };
    registry.registerRuntime(mockRuntime, [approvalCap]);
    const request: IExecutionRequest = {
      requestId: "10",
      capability: "test.approval",
      input: {},
    };
    expect(policy.evaluate(request)).toBe("REQUIRE_APPROVAL");
  });

  test("14. Unrecognized risk level falls through and returns DENY", () => {
    const weirdCap: ICapability = {
      id: "test.weird",
      name: "Weird",
      description: "",
      riskLevel: "EXTREME" as CapabilityRiskLevel,
      requiresApproval: false,
      enabled: true,
      runtime: RUNTIME_NAME,
    };
    registry.registerRuntime(mockRuntime, [weirdCap]);
    const request: IExecutionRequest = {
      requestId: "11",
      capability: "test.weird",
      input: {},
    };
    expect(policy.evaluate(request)).toBe("DENY");
  });

  test("15. Direct capability and runtime listing verifications", () => {
    expect(registry.listRuntimes()).toEqual([]);
    registry.registerRuntime(mockRuntime, []);
    expect(registry.listRuntimes()).toEqual([RUNTIME_NAME]);
    expect(registry.getCapability("non.existent.cap")).toBeUndefined();
  });
});
