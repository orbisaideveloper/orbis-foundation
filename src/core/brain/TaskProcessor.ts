import { BrainDecision, NormalizedBrainRequest } from "./DecisionEngine";
import { RequestCapabilityOptions } from "./BrainCapabilityOrchestrator";

/**
 * TASK-015 (Part 2) — Deterministic Brain Task Processor
 *
 * TaskProcessor receives a DecisionEngine result and the request it was
 * derived from, and turns it into either:
 *   - an accepted BrainTask, ready to be handed to the existing TASK-010
 *     BrainCapabilityOrchestrator, or
 *   - a clean rejection, when the decision is not something the existing
 *     Brain flow can act on.
 *
 * TaskProcessor NEVER executes anything itself. It does not call
 * TermuxRuntime, does not call child_process, does not bypass capability
 * discovery/policy/authorization, and does not construct a second
 * execution path. Its only job is to normalize a decision into the
 * shape BrainCapabilityOrchestrator.requestCapability() already expects.
 */

export type TaskRejectionCode = "DECISION_INVALID" | "CAPABILITY_ID_MISSING";

export interface BrainTask {
  requestId?: string;
  capabilityId: string;
  input: Record<string, any>;
  options?: RequestCapabilityOptions;
  decisionCode: string;
}

export interface TaskAccepted {
  accepted: true;
  task: BrainTask;
}

export interface TaskRejected {
  accepted: false;
  rejectionCode: TaskRejectionCode;
  reason: string;
  requestId?: string;
}

export type TaskProcessingResult = TaskAccepted | TaskRejected;

export interface ITaskProcessor {
  process(
    decision: BrainDecision,
    request: NormalizedBrainRequest,
  ): TaskProcessingResult;
}

export class TaskProcessor implements ITaskProcessor {
  public process(
    decision: BrainDecision,
    request: NormalizedBrainRequest,
  ): TaskProcessingResult {
    if (decision.category === "INVALID") {
      return {
        accepted: false,
        rejectionCode: "DECISION_INVALID",
        reason: decision.reason,
        requestId: decision.requestId,
      };
    }

    // decision.category === "CAPABILITY_EXECUTION" from here on. DecisionEngine
    // only ever returns "INVALID" (handled above) or "CAPABILITY_EXECUTION"
    // (TASK-020: the dead-end "NON_EXECUTION" category was removed since
    // nothing in the repository ever produced it).
    if (!isNonEmptyCapabilityId(decision.capabilityId)) {
      return {
        accepted: false,
        rejectionCode: "CAPABILITY_ID_MISSING",
        reason: "Decision was CAPABILITY_EXECUTION but capabilityId is missing",
        requestId: decision.requestId,
      };
    }

    return {
      accepted: true,
      task: {
        requestId: decision.requestId,
        capabilityId: decision.capabilityId,
        input: request.input,
        options: request.options,
        decisionCode: decision.decisionCode,
      },
    };
  }
}

function isNonEmptyCapabilityId(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const taskProcessor = new TaskProcessor();
