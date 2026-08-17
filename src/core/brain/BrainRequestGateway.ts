import {
  IBrainCapabilityOrchestrator,
  RequestCapabilityOptions,
  brainCapabilityOrchestrator,
} from "./BrainCapabilityOrchestrator";
import {
  IDecisionEngine,
  NormalizedBrainRequest,
  decisionEngine,
} from "./DecisionEngine";
import {
  ITaskProcessor,
  TaskRejectionCode,
  taskProcessor,
} from "./TaskProcessor";
import { IExecutionResult } from "../execution/interfaces/IExecutionResult";
import { Logger } from "../logging/Logger";
import { BRAIN_MODULE_NAMES } from "./BrainConfig";

/**
 * TASK-011 — Brain Request Gateway
 *
 * This is a normalization/validation entry boundary in front of the
 * existing TASK-010 BrainCapabilityOrchestrator. It is NOT a security
 * boundary and does not claim to prevent a direct call to
 * BrainCapabilityOrchestrator — the authoritative authorization/security
 * chain remains entirely inside TASK-009 (TermuxRuntimeService ->
 * ExecutionPolicyEngine -> SecureExecutionAuthorizationGate).
 *
 * BrainRequestGateway only:
 *   1. accepts a raw, untyped/unknown request shape,
 *   2. validates that shape (capabilityId is a non-empty string,
 *      input is a plain non-null, non-array object),
 *   3. forwards the validated request unchanged to
 *      BrainCapabilityOrchestrator.requestCapability(),
 *   4. returns the resulting IExecutionResult unchanged.
 *
 * It never imports TermuxRuntime/TermuxRuntimeService, never performs
 * HTTP/fetch, and never spawns a process. It carries no AI reasoning,
 * memory, or capability-selection logic — purely deterministic
 * shape-validation and pass-through.
 */

/**
 * The raw, provider-independent shape a caller submits. Deliberately
 * distinct from IExecutionRequest: this is what arrives BEFORE
 * validation/normalization, so every field is `unknown` until checked.
 */
export interface RawBrainRequest {
  capabilityId: unknown;
  input: unknown;
  options?: unknown;
}

export type BrainRequestValidationReason =
  | "BRAIN_REQUEST_INVALID"
  | "CAPABILITY_ID_REQUIRED"
  | "CAPABILITY_ID_INVALID"
  | "INPUT_INVALID";

const REASON_BRAIN_REQUEST_INVALID: BrainRequestValidationReason =
  "BRAIN_REQUEST_INVALID";

/**
 * Builds a deterministic structured failure for requests that never
 * reach BrainCapabilityOrchestrator. Reuses the existing IExecutionResult
 * shape (the same contract TASK-010 already uses for its own
 * pre-execution failures) rather than inventing a second result type.
 *
 * TASK-015 (Part 2): also accepts a TaskRejectionCode, since a request
 * that fails DecisionEngine/TaskProcessor classification is, from the
 * caller's point of view, the exact same kind of pre-execution failure
 * as a shape-validation failure — it never reached
 * BrainCapabilityOrchestrator either.
 */
function buildValidationFailure(
  reason: BrainRequestValidationReason | TaskRejectionCode,
  detail?: string,
): IExecutionResult {
  return {
    success: false,
    requestId: "unassigned",
    runtime: "unknown",
    error: detail ? `${reason}: ${detail}` : reason,
    durationMs: 0,
  };
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * options is optional on the raw request; when present it must be a
 * plain object so it can safely be treated as RequestCapabilityOptions.
 * Any other shape is rejected rather than guessed at.
 */
function isValidOptions(
  value: unknown,
): value is RequestCapabilityOptions | undefined {
  return value === undefined || isPlainObject(value);
}

export interface IBrainRequestGateway {
  submit(request: RawBrainRequest): Promise<IExecutionResult>;
  submitApproval(
    token: string,
    decision: "APPROVE" | "REJECT",
  ): Promise<IExecutionResult>;
}

export class BrainRequestGateway implements IBrainRequestGateway {
  constructor(
    private readonly orchestrator: IBrainCapabilityOrchestrator = brainCapabilityOrchestrator,
    // TASK-015 (Part 2): DecisionEngine and TaskProcessor are injectable
    // for the same reason the orchestrator already is — deterministic
    // unit testing without touching the shared singletons.
    private readonly decisions: IDecisionEngine = decisionEngine,
    private readonly tasks: ITaskProcessor = taskProcessor,
  ) {}

  public async submitApproval(
    token: string,
    decision: "APPROVE" | "REJECT",
  ): Promise<IExecutionResult> {
    if (typeof token !== "string" || token.trim().length < 20) {
      return buildValidationFailure(
        REASON_BRAIN_REQUEST_INVALID,
        "Invalid approval token",
      );
    }
    if (decision !== "APPROVE" && decision !== "REJECT") {
      return buildValidationFailure(
        REASON_BRAIN_REQUEST_INVALID,
        "Invalid approval decision",
      );
    }
    return this.orchestrator.resolveApproval(token.trim(), decision);
  }

  /**
   * Validate -> normalize -> forward unchanged to
   * BrainCapabilityOrchestrator.requestCapability() -> return the
   * resulting IExecutionResult unchanged.
   */
  public async submit(request: RawBrainRequest): Promise<IExecutionResult> {
    // TASK-015 (Part 1B): observational logging only — no branch below
    // was added or altered by these calls, they sit alongside the
    // existing validation control flow.
    Logger.getInstance().info(
      BRAIN_MODULE_NAMES.requestGateway,
      "Brain request received",
    );

    if (!isPlainObject(request)) {
      Logger.getInstance().warn(
        BRAIN_MODULE_NAMES.requestGateway,
        "Brain request rejected: request is not a plain object",
      );
      return buildValidationFailure(REASON_BRAIN_REQUEST_INVALID);
    }

    const { capabilityId, input, options } = request;

    if (capabilityId === undefined || capabilityId === null) {
      Logger.getInstance().warn(
        BRAIN_MODULE_NAMES.requestGateway,
        "Brain request rejected: capabilityId missing",
      );
      return buildValidationFailure("CAPABILITY_ID_REQUIRED");
    }

    if (!isNonEmptyString(capabilityId)) {
      Logger.getInstance().warn(
        BRAIN_MODULE_NAMES.requestGateway,
        "Brain request rejected: capabilityId invalid",
      );
      return buildValidationFailure("CAPABILITY_ID_INVALID");
    }

    if (input !== undefined && !isPlainObject(input)) {
      // Note: input content is user-supplied and is never logged, only
      // the capabilityId (a route identifier, not private user data).
      Logger.getInstance().warn(
        BRAIN_MODULE_NAMES.requestGateway,
        "Brain request rejected: input invalid",
        { capabilityId },
      );
      return buildValidationFailure("INPUT_INVALID");
    }

    // input === undefined is treated as the repository's own existing
    // safe default: BrainCapabilityOrchestrator.requestCapability()
    // already declares `input: Record<string, any> = {}` as its default
    // parameter value, so an absent input is not a new default invented
    // here — it mirrors the contract TASK-010 already defines. The cast
    // below is safe: the guard above already proved input is either
    // undefined or a validated plain object at this point.
    const normalizedInput: Record<string, any> =
      input === undefined ? {} : (input as Record<string, any>);

    if (!isValidOptions(options)) {
      Logger.getInstance().warn(
        BRAIN_MODULE_NAMES.requestGateway,
        "Brain request rejected: options invalid",
        { capabilityId },
      );
      return buildValidationFailure(REASON_BRAIN_REQUEST_INVALID);
    }

    Logger.getInstance().info(
      BRAIN_MODULE_NAMES.requestGateway,
      "Brain request validated, forwarding to decision layer",
      { capabilityId },
    );

    // TASK-015 (Part 2): DecisionEngine -> TaskProcessor sit here, between
    // the gateway's own shape validation (above) and the existing TASK-010
    // orchestrator (below). Neither of them executes anything; they only
    // classify and normalize the already-validated request.
    const normalizedRequest: NormalizedBrainRequest = {
      capabilityId,
      input: normalizedInput,
      options: options as RequestCapabilityOptions | undefined,
      requestId: (options as RequestCapabilityOptions | undefined)?.requestId,
    };

    const decision = this.decisions.decide(normalizedRequest);

    Logger.getInstance().info(
      BRAIN_MODULE_NAMES.decisionEngine,
      "Brain request decision generated",
      {
        requestId: decision.requestId,
        capabilityId: decision.capabilityId,
        category: decision.category,
        decisionCode: decision.decisionCode,
      },
    );

    const taskResult = this.tasks.process(decision, normalizedRequest);

    if (!taskResult.accepted) {
      Logger.getInstance().warn(
        BRAIN_MODULE_NAMES.taskProcessor,
        "Brain task rejected",
        {
          requestId: taskResult.requestId,
          rejectionCode: taskResult.rejectionCode,
        },
      );
      return buildValidationFailure(
        taskResult.rejectionCode,
        taskResult.reason,
      );
    }

    Logger.getInstance().info(
      BRAIN_MODULE_NAMES.taskProcessor,
      "Brain task created, forwarding to orchestrator",
      {
        requestId: taskResult.task.requestId,
        capabilityId: taskResult.task.capabilityId,
      },
    );

    return this.orchestrator.requestCapability(
      taskResult.task.capabilityId,
      taskResult.task.input,
      taskResult.task.options,
    );
  }
}

export const brainRequestGateway = new BrainRequestGateway();
