import { RequestCapabilityOptions } from "./BrainCapabilityOrchestrator";

/**
 * TASK-015 (Part 2) — Deterministic Brain Decision Engine
 *
 * DecisionEngine sits between the existing TASK-011 BrainRequestGateway
 * and the new TaskProcessor. It receives a request that has ALREADY
 * passed BrainRequestGateway's own shape validation (capabilityId is a
 * non-empty string, input/options are plain objects or undefined) and
 * classifies it into exactly one category.
 *
 * DecisionEngine is intentionally:
 *   - deterministic:   the same input always produces the same output.
 *   - side-effect free: no logging, no I/O, no mutation of its input.
 *   - dependency-light: it imports only the RequestCapabilityOptions type
 *     from TASK-010, nothing from execution/runtime/authorization layers.
 *
 * It NEVER executes anything. It does not call TermuxRuntime, does not
 * call child_process, does not perform network or filesystem access, and
 * does not call an LLM. It only inspects the already-validated request
 * and returns a plain decision object describing what kind of request it
 * is and why.
 */

export type BrainRequestCategory = "CAPABILITY_EXECUTION" | "INVALID";

export type DecisionCode =
  "CAPABILITY_EXECUTION_CANDIDATE" | "MISSING_CAPABILITY_ID";

/**
 * The request shape DecisionEngine operates on. This mirrors what
 * BrainRequestGateway already guarantees after its own validation step
 * (capabilityId: non-empty string; input: plain object; options: plain
 * object or undefined) — DecisionEngine does not re-validate those
 * shapes, it only classifies a request that is already well-formed.
 */
export interface NormalizedBrainRequest {
  capabilityId: string;
  input: Record<string, any>;
  options?: RequestCapabilityOptions;
  requestId?: string;
}

export interface BrainDecision {
  category: BrainRequestCategory;
  decisionCode: DecisionCode;
  capabilityId: string | null;
  requestId?: string;
  reason: string;
}

export interface IDecisionEngine {
  decide(request: NormalizedBrainRequest): BrainDecision;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export class DecisionEngine implements IDecisionEngine {
  public decide(request: NormalizedBrainRequest): BrainDecision {
    const capabilityId = request?.capabilityId;
    const requestId = request?.requestId;

    if (!isNonEmptyString(capabilityId)) {
      return {
        category: "INVALID",
        decisionCode: "MISSING_CAPABILITY_ID",
        capabilityId: null,
        requestId,
        reason: "capabilityId is missing or not a non-empty string",
      };
    }

    return {
      category: "CAPABILITY_EXECUTION",
      decisionCode: "CAPABILITY_EXECUTION_CANDIDATE",
      capabilityId,
      requestId,
      reason: "capabilityId is eligible for capability execution",
    };
  }
}

export const decisionEngine = new DecisionEngine();
