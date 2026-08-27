import { IExecutionRequest } from "./IExecutionRequest";

export type PolicyDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export interface IExecutionPolicy {
  evaluate(request: IExecutionRequest): PolicyDecision;
}

export class DefaultExecutionPolicy implements IExecutionPolicy {
  private readonly allowedCapabilities: Set<string> = new Set([
    "safe.compute",
    "safe.text-transform",
  ]);

  evaluate(request: IExecutionRequest): PolicyDecision {
    if (!request?.capability) {
      return "DENY";
    }

    // Rule: Raw arbitrary shell execution is strictly DENIED
    if (
      request.capability.includes("shell") ||
      request.capability.includes("bash") ||
      request.capability.includes("exec") ||
      request.capability.includes("raw_command")
    ) {
      return "DENY";
    }

    // Rule: Unknown or unregistered capability = DENY
    if (!this.allowedCapabilities.has(request.capability)) {
      return "DENY";
    }

    // Rule: High risk requires approval
    if (request.riskLevel === "HIGH" || request.riskLevel === "CRITICAL") {
      return "REQUIRE_APPROVAL";
    }

    return "ALLOW";
  }
}
