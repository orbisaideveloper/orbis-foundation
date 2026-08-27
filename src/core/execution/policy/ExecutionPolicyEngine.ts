import {
  IExecutionPolicy,
  PolicyDecision,
} from "../interfaces/IExecutionPolicy";
import { IExecutionRequest } from "../interfaces/IExecutionRequest";
import { RuntimeRegistry } from "../registry/RuntimeRegistry";

export class ExecutionPolicyEngine implements IExecutionPolicy {
  constructor(private readonly registry: RuntimeRegistry) {}

  evaluate(request: IExecutionRequest): PolicyDecision {
    if (!request?.capability) {
      return "DENY";
    }

    // RULE 1: Strictly deny arbitrary shell commands directly from input
    const rawCaps = request.capability.toLowerCase();
    if (
      rawCaps.includes("shell") ||
      rawCaps.includes("bash") ||
      rawCaps.includes("sh") ||
      rawCaps.includes("exec") ||
      rawCaps.includes("raw_command")
    ) {
      return "DENY";
    }

    // RULE 2: Unknown or undeclared capability lookup
    const cap = this.registry.getCapability(request.capability);
    if (!cap) {
      return "DENY"; // Unknown capability -> DENY
    }

    // RULE 3: Capability is explicitly disabled
    if (!cap.enabled) {
      return "DENY";
    }

    // RULE 4: Ensure requested runtime actually exists in registry
    const runtime = this.registry.getRuntime(cap.runtime);
    if (!runtime) {
      return "DENY"; // Unknown runtime -> DENY
    }

    // RULE 5: Privileged operations are ALWAYS denied in this layer
    if (cap.riskLevel === "PRIVILEGED") {
      return "DENY";
    }

    // RULE 6: Sensitive operations require user/admin approval
    if (cap.riskLevel === "SENSITIVE" || cap.requiresApproval) {
      return "REQUIRE_APPROVAL";
    }

    // RULE 7: Safe registered capabilities are allowed
    if (cap.riskLevel === "SAFE") {
      return "ALLOW";
    }

    // Default Fallback
    return "DENY";
  }
}
