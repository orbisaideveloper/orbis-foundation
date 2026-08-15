import {
  TermuxRuntimeService,
  termuxRuntimeService,
} from "../execution/runtimes/TermuxRuntimeService";
import { IExecutionRequest } from "../execution/interfaces/IExecutionRequest";
import { IExecutionResult } from "../execution/interfaces/IExecutionResult";

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
}

export class ControlledCapabilityExecution implements IControlledCapabilityExecution {
  constructor(
    private readonly service: TermuxRuntimeService = termuxRuntimeService,
  ) {}

  public async execute(request: IExecutionRequest): Promise<IExecutionResult> {
    return this.service.executeCapability(request);
  }
}

export const controlledCapabilityExecution =
  new ControlledCapabilityExecution();
