export enum AuthorizationDecision {
  AUTHORIZED = "AUTHORIZED",
  DENIED = "DENIED",
  REQUIRE_APPROVAL = "REQUIRE_APPROVAL",
}

export interface AuthorizationResult {
  authorized: boolean;
  decision: AuthorizationDecision;
  runtimeId?: string;
  capabilityId?: string;
  reason: string;
  requiresApproval: boolean;
}

// -----------------------------------------------------------------------------
// Dependency Inversion Interfaces (Safe Decoupling from Previous Modules)
// -----------------------------------------------------------------------------
export interface IAuthorizationRequest {
  runtimeId?: string;
  capabilityId?: string;
  parameters?: Record<string, any>;
}

export interface IGateRegistryDeps {
  hasRuntime(runtimeId: string): boolean;
  hasCapability(runtimeId: string, capabilityId: string): boolean;
  isCapabilityEnabled(capabilityId: string): boolean;
  getCapabilityRiskLevel(
    capabilityId: string,
  ): "SAFE" | "SENSITIVE" | "PRIVILEGED";
}

export interface IGateLifecycleDeps {
  isReady(runtimeId: string): boolean;
  isHealthy(runtimeId: string): boolean;
}

export interface IGatePolicyDeps {
  evaluate(
    request: IAuthorizationRequest,
  ): "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
}

// -----------------------------------------------------------------------------
// Core Authorization Gate
// -----------------------------------------------------------------------------
export class SecureExecutionAuthorizationGate {
  constructor(
    private registry: IGateRegistryDeps,
    private lifecycle: IGateLifecycleDeps,
    private policy: IGatePolicyDeps,
  ) {}

  public authorize(
    request: IAuthorizationRequest | null | undefined,
  ): AuthorizationResult {
    // 1. Request validation
    if (!request || !request.capabilityId || !request.runtimeId) {
      return this.deny(
        request,
        "Invalid request: missing capabilityId or runtimeId",
      );
    }

    const rId = request.runtimeId;
    const cId = request.capabilityId;

    // 2. Runtime validation
    if (!this.registry.hasRuntime(rId)) {
      return this.deny(request, `Unknown runtime: ${rId}`);
    }

    // 3. Runtime lifecycle & health check
    if (!this.lifecycle.isReady(rId)) {
      return this.deny(request, `Runtime not READY: ${rId}`);
    }
    if (!this.lifecycle.isHealthy(rId)) {
      return this.deny(request, `Runtime unhealthy: ${rId}`);
    }

    // 4 & 5. Capability declaration and enable status
    if (!this.registry.hasCapability(rId, cId)) {
      return this.deny(
        request,
        `Capability ${cId} not declared by runtime ${rId}`,
      );
    }
    if (!this.registry.isCapabilityEnabled(cId)) {
      return this.deny(request, `Capability is disabled: ${cId}`);
    }

    // 6. Policy evaluation
    const policyDecision = this.policy.evaluate(request);
    if (policyDecision === "DENY") {
      return this.deny(request, "Policy explicitly DENIED execution");
    }

    // 7. Privilege & Risk Level Check
    const riskLevel = this.registry.getCapabilityRiskLevel(cId);

    // PRIVILEGED is ALWAYS denied unconditionally at this gate.
    if (riskLevel === "PRIVILEGED") {
      return this.deny(
        request,
        "PRIVILEGED capabilities are strictly forbidden",
      );
    }

    // SENSITIVE capability OR Policy requires approval
    if (riskLevel === "SENSITIVE" || policyDecision === "REQUIRE_APPROVAL") {
      return this.requireApproval(request, "Action requires explicit approval");
    }

    // 8. Safe & Allowed
    if (riskLevel === "SAFE" && policyDecision === "ALLOW") {
      return this.allow(request, "Authorization successful");
    }

    // Fallback safety (Default Deny)
    return this.deny(
      request,
      "Unhandled authorization state. Defaulting to DENY.",
    );
  }

  // Helper Methods for Structured Responses
  private deny(
    req: IAuthorizationRequest | null | undefined,
    reason: string,
  ): AuthorizationResult {
    return {
      authorized: false,
      decision: AuthorizationDecision.DENIED,
      runtimeId: req?.runtimeId,
      capabilityId: req?.capabilityId,
      reason,
      requiresApproval: false,
    };
  }

  private requireApproval(
    req: IAuthorizationRequest,
    reason: string,
  ): AuthorizationResult {
    return {
      authorized: false,
      decision: AuthorizationDecision.REQUIRE_APPROVAL,
      runtimeId: req.runtimeId,
      capabilityId: req.capabilityId,
      reason,
      requiresApproval: true,
    };
  }

  private allow(
    req: IAuthorizationRequest,
    reason: string,
  ): AuthorizationResult {
    return {
      authorized: true,
      decision: AuthorizationDecision.AUTHORIZED,
      runtimeId: req.runtimeId,
      capabilityId: req.capabilityId,
      reason,
      requiresApproval: false,
    };
  }
}
