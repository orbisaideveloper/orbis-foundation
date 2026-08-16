import {
  IBrainCapabilityOrchestrator,
  RequestCapabilityOptions,
  brainCapabilityOrchestrator,
} from "./BrainCapabilityOrchestrator";
import { IExecutionResult } from "../execution/interfaces/IExecutionResult";

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
 */
function buildValidationFailure(
  reason: BrainRequestValidationReason,
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
}

export class BrainRequestGateway implements IBrainRequestGateway {
  constructor(
    private readonly orchestrator: IBrainCapabilityOrchestrator = brainCapabilityOrchestrator,
  ) {}

  /**
   * Validate -> normalize -> forward unchanged to
   * BrainCapabilityOrchestrator.requestCapability() -> return the
   * resulting IExecutionResult unchanged.
   */
  public async submit(request: RawBrainRequest): Promise<IExecutionResult> {
    if (!isPlainObject(request)) {
      return buildValidationFailure(REASON_BRAIN_REQUEST_INVALID);
    }

    const { capabilityId, input, options } = request;

    if (capabilityId === undefined || capabilityId === null) {
      return buildValidationFailure("CAPABILITY_ID_REQUIRED");
    }

    if (!isNonEmptyString(capabilityId)) {
      return buildValidationFailure("CAPABILITY_ID_INVALID");
    }

    if (input !== undefined && !isPlainObject(input)) {
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
      return buildValidationFailure(REASON_BRAIN_REQUEST_INVALID);
    }

    return this.orchestrator.requestCapability(
      capabilityId,
      normalizedInput,
      options as RequestCapabilityOptions | undefined,
    );
  }
}

export const brainRequestGateway = new BrainRequestGateway();
