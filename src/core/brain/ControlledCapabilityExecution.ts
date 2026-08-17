import {
  TermuxRuntimeService,
  termuxRuntimeService,
} from "../execution/runtimes/TermuxRuntimeService";
import { IExecutionRequest } from "../execution/interfaces/IExecutionRequest";
import { IExecutionResult } from "../execution/interfaces/IExecutionResult";
import { Logger } from "../logging/Logger";
import { BRAIN_MODULE_NAMES } from "./BrainConfig";

/**
 * TASK-009 — Brain-Facing Controlled Capability Execution
 *
 * This is the ONLY execution entry point the ORBIS Brain should hold a
 * reference to. It is intentionally thin: it does not construct a
 * PolicyEngine, an AuthorizationGate, a RuntimeRegistry, a
 * RuntimeLifecycleManager, or a runtime bridge, and it never talks to
 * Termux HTTP endpoints directly.
 *
 * The single authoritative security boundary is
 * TermuxRuntimeService.executeCapability(), which internally enforces
 * ExecutionPolicyEngine + SecureExecutionAuthorizationGate against the
 * same registry/lifecycle/runtime instances it already owns.
 */
export interface IControlledCapabilityExecution {
  execute(request: IExecutionRequest): Promise<IExecutionResult>;
  resolveApproval(
    token: string,
    decision: "APPROVE" | "REJECT",
  ): Promise<IExecutionResult>;
}

export class ControlledCapabilityExecution implements IControlledCapabilityExecution {
  constructor(
    private readonly service: TermuxRuntimeService = termuxRuntimeService,
  ) {}

  public async execute(request: IExecutionRequest): Promise<IExecutionResult> {
    // TASK-015 (Part 1B): observational logging only — this method still
    // does nothing but delegate to TermuxRuntimeService.executeCapability(),
    // which remains the sole authoritative security boundary.
    Logger.getInstance().info(
      BRAIN_MODULE_NAMES.controlledExecution,
      "Execution start",
      { requestId: request.requestId, capability: request.capability },
    );

    const result = await this.service.executeCapability(request);

    Logger.getInstance().info(
      BRAIN_MODULE_NAMES.controlledExecution,
      result.success
        ? "Execution result: success"
        : "Execution result: failure",
      {
        requestId: request.requestId,
        capability: request.capability,
        success: result.success,
        durationMs: result.durationMs,
      },
    );

    return result;
  }

  public async resolveApproval(
    token: string,
    decision: "APPROVE" | "REJECT",
  ): Promise<IExecutionResult> {
    return this.service.resolveApproval(token, decision);
  }
}

export const controlledCapabilityExecution =
  new ControlledCapabilityExecution();
