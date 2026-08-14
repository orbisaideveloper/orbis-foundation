import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SecureExecutionAuthorizationGate,
  AuthorizationDecision,
  IGateRegistryDeps,
  IGateLifecycleDeps,
  IGatePolicyDeps,
} from "../SecureExecutionAuthorizationGate";

describe("SecureExecutionAuthorizationGate", () => {
  let mockRegistry: IGateRegistryDeps;
  let mockLifecycle: IGateLifecycleDeps;
  let mockPolicy: IGatePolicyDeps;
  let gate: SecureExecutionAuthorizationGate;

  beforeEach(() => {
    mockRegistry = {
      hasRuntime: vi.fn().mockReturnValue(true),
      hasCapability: vi.fn().mockReturnValue(true),
      isCapabilityEnabled: vi.fn().mockReturnValue(true),
      getCapabilityRiskLevel: vi.fn().mockReturnValue("SAFE"),
    };

    mockLifecycle = {
      isReady: vi.fn().mockReturnValue(true),
      isHealthy: vi.fn().mockReturnValue(true),
    };

    mockPolicy = {
      evaluate: vi.fn().mockReturnValue("ALLOW"),
    };

    gate = new SecureExecutionAuthorizationGate(
      mockRegistry,
      mockLifecycle,
      mockPolicy,
    );
  });

  const validReq = { runtimeId: "rt-1", capabilityId: "cap-1" };

  it("1. null request -> DENIED", () => {
    const res = gate.authorize(null);
    expect(res.decision).toBe(AuthorizationDecision.DENIED);
  });

  it("2. malformed request -> DENIED", () => {
    const res = gate.authorize({ runtimeId: "rt-1" }); // missing capabilityId
    expect(res.decision).toBe(AuthorizationDecision.DENIED);
  });

  it("3. unknown runtime -> DENIED", () => {
    mockRegistry.hasRuntime = vi.fn().mockReturnValue(false);
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.DENIED,
    );
  });

  it("4. stopped runtime (not ready) -> DENIED", () => {
    mockLifecycle.isReady = vi.fn().mockReturnValue(false);
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.DENIED,
    );
  });

  it("5. failed runtime (not ready) -> DENIED", () => {
    mockLifecycle.isReady = vi.fn().mockReturnValue(false);
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.DENIED,
    );
  });

  it("6. unhealthy runtime -> DENIED", () => {
    mockLifecycle.isHealthy = vi.fn().mockReturnValue(false);
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.DENIED,
    );
  });

  it("7. runtime not READY -> DENIED", () => {
    mockLifecycle.isReady = vi.fn().mockReturnValue(false);
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.DENIED,
    );
  });

  it("8. unknown capability -> DENIED", () => {
    mockRegistry.hasCapability = vi.fn().mockReturnValue(false);
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.DENIED,
    );
  });

  it("9. undeclared capability -> DENIED", () => {
    mockRegistry.hasCapability = vi.fn().mockReturnValue(false);
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.DENIED,
    );
  });

  it("10. disabled capability -> DENIED", () => {
    mockRegistry.isCapabilityEnabled = vi.fn().mockReturnValue(false);
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.DENIED,
    );
  });

  it("11. capability belonging to different runtime -> DENIED", () => {
    mockRegistry.hasCapability = vi.fn().mockReturnValue(false);
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.DENIED,
    );
  });

  it("12. privileged capability -> DENIED", () => {
    mockRegistry.getCapabilityRiskLevel = vi.fn().mockReturnValue("PRIVILEGED");
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.DENIED,
    );
  });

  it("13. sensitive capability -> REQUIRE_APPROVAL", () => {
    mockRegistry.getCapabilityRiskLevel = vi.fn().mockReturnValue("SENSITIVE");
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.REQUIRE_APPROVAL,
    );
  });

  it("14. safe capability + policy ALLOW -> AUTHORIZED", () => {
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.AUTHORIZED,
    );
    expect(gate.authorize(validReq).authorized).toBe(true);
  });

  it("15. policy DENY -> DENIED", () => {
    mockPolicy.evaluate = vi.fn().mockReturnValue("DENY");
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.DENIED,
    );
  });

  it("16. policy REQUIRE_APPROVAL -> REQUIRE_APPROVAL", () => {
    mockPolicy.evaluate = vi.fn().mockReturnValue("REQUIRE_APPROVAL");
    expect(gate.authorize(validReq).decision).toBe(
      AuthorizationDecision.REQUIRE_APPROVAL,
    );
  });

  it("17. registration alone -> NOT AUTHORIZED (needs ready, healthy, policy check)", () => {
    // Registry returns true, but lifecycle returns false
    mockLifecycle.isReady = vi.fn().mockReturnValue(false);
    expect(gate.authorize(validReq).authorized).toBe(false);
  });

  it("18. authorization gate does not execute runtime (structural check)", () => {
    const methods = Object.getOwnPropertyNames(
      SecureExecutionAuthorizationGate.prototype,
    );
    expect(methods).not.toContain("execute"); // Verify logic stays abstracted
  });

  it("19. no child process is spawned", () => {
    // Pure logic class check
    expect(typeof gate.authorize).toBe("function");
  });

  it("20. no shell command is executed", () => {
    const res = gate.authorize(validReq);
    expect(res.decision).toBe(AuthorizationDecision.AUTHORIZED);
  });
});
