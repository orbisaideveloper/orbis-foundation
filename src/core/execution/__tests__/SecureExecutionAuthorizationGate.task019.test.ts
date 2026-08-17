import { describe, expect, it } from "vitest";
import {
  AuthorizationDecision,
  SecureExecutionAuthorizationGate,
} from "../authorization/SecureExecutionAuthorizationGate";

describe("TASK-019 approval gate", () => {
  const deps = {
    registry: {
      hasRuntime: () => true,
      hasCapability: () => true,
      isCapabilityEnabled: () => true,
      getCapabilityRiskLevel: () => "SENSITIVE" as const,
    },
    lifecycle: { isReady: () => true, isHealthy: () => true },
    policy: { evaluate: () => "REQUIRE_APPROVAL" as const },
  };

  it("still requires approval without explicit approvalGranted", () => {
    const result = new SecureExecutionAuthorizationGate(
      deps.registry,
      deps.lifecycle,
      deps.policy,
    ).authorize({
      runtimeId: "TermuxRuntime",
      capabilityId: "termux.file.read",
      parameters: { path: "package.json" },
    });
    expect(result.authorized).toBe(false);
    expect(result.decision).toBe(AuthorizationDecision.REQUIRE_APPROVAL);
  });

  it("allows only after fresh approvalGranted while all prior checks remain active", () => {
    const result = new SecureExecutionAuthorizationGate(
      deps.registry,
      deps.lifecycle,
      deps.policy,
    ).authorize({
      runtimeId: "TermuxRuntime",
      capabilityId: "termux.file.read",
      parameters: { path: "package.json" },
      approvalGranted: true,
    });
    expect(result.authorized).toBe(true);
    expect(result.decision).toBe(AuthorizationDecision.AUTHORIZED);
  });
});
