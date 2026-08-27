import {
  ILocalCapabilityDiscovery,
  localCapabilityDiscovery,
} from "./LocalCapabilityDiscovery";
import {
  IControlledCapabilityExecution,
  controlledCapabilityExecution,
} from "./ControlledCapabilityExecution";
import { IExecutionRequest } from "../execution/interfaces/IExecutionRequest";
import { IExecutionResult } from "../execution/interfaces/IExecutionResult";
import { Logger } from "../logging/Logger";
import { BRAIN_MODULE_NAMES } from "./BrainConfig";

export type BrainCapabilityFailureReason =
  | "CAPABILITY_ID_REQUIRED"
  | "DISCOVERY_UNAVAILABLE"
  | "CAPABILITY_NOT_DISCOVERABLE";

function buildUndiscoverableResult(
  requestId: string,
  runtime: string,
  reason: BrainCapabilityFailureReason,
  detail?: string,
): IExecutionResult {
  return {
    success: false,
    requestId,
    runtime,
    error: detail ? `${reason}: ${detail}` : reason,
    durationMs: 0,
  };
}

export interface RequestCapabilityOptions {
  requestId?: string;
  timeoutMs?: number;
  riskLevel?: NonNullable<IExecutionRequest["riskLevel"]>;
  originatingTask?: string;
  metadata?: Record<string, any>;
}

export interface IBrainCapabilityOrchestrator {
  requestCapability(
    capabilityId: string,
    input: Record<string, any>,
    options?: RequestCapabilityOptions,
  ): Promise<IExecutionResult>;
  resolveApproval(
    token: string,
    decision: "APPROVE" | "REJECT",
  ): Promise<IExecutionResult>;
}

let requestCounter = 0;

function generateRequestId(): string {
  requestCounter += 1;
  return `brain-req-${Date.now()}-${requestCounter}`;
}

export class BrainCapabilityOrchestrator implements IBrainCapabilityOrchestrator {
  constructor(
    private readonly discovery: ILocalCapabilityDiscovery = localCapabilityDiscovery,
    private readonly execution: IControlledCapabilityExecution = controlledCapabilityExecution,
  ) {}

  public async resolveApproval(
    token: string,
    decision: "APPROVE" | "REJECT",
  ): Promise<IExecutionResult> {
    return this.execution.resolveApproval(token, decision);
  }

  public async requestCapability(
    capabilityId: string,
    input: Record<string, any> = {},
    options: RequestCapabilityOptions = {},
  ): Promise<IExecutionResult> {
    const requestId = options.requestId ?? generateRequestId();

    // TASK-015 (Part 1B): observational logging only, added alongside the
    // existing control flow below — no branch or return value changed.
    Logger.getInstance().info(
      BRAIN_MODULE_NAMES.capabilityOrchestrator,
      "Capability request received",
      { requestId, capabilityId },
    );

    if (!capabilityId) {
      Logger.getInstance().warn(
        BRAIN_MODULE_NAMES.capabilityOrchestrator,
        "Capability request rejected: capabilityId required",
        { requestId },
      );
      return buildUndiscoverableResult(
        requestId,
        "unknown",
        "CAPABILITY_ID_REQUIRED",
      );
    }

    const discoveryResult = await this.discovery.discoverLocalCapabilities();

    if (!discoveryResult.connected || !discoveryResult.ready) {
      Logger.getInstance().warn(
        BRAIN_MODULE_NAMES.capabilityOrchestrator,
        "Capability request denied: discovery unavailable",
        {
          requestId,
          capabilityId,
          runtime: discoveryResult.runtime,
          unavailableReason: discoveryResult.unavailableReason,
        },
      );
      return buildUndiscoverableResult(
        requestId,
        discoveryResult.runtime,
        "DISCOVERY_UNAVAILABLE",
        discoveryResult.unavailableReason,
      );
    }

    const isDiscoverable = discoveryResult.capabilities.some(
      (cap) => cap.id === capabilityId && cap.available,
    );

    if (!isDiscoverable) {
      Logger.getInstance().warn(
        BRAIN_MODULE_NAMES.capabilityOrchestrator,
        "Capability request denied: capability not discoverable",
        { requestId, capabilityId, runtime: discoveryResult.runtime },
      );
      return buildUndiscoverableResult(
        requestId,
        discoveryResult.runtime,
        "CAPABILITY_NOT_DISCOVERABLE",
      );
    }

    Logger.getInstance().info(
      BRAIN_MODULE_NAMES.capabilityOrchestrator,
      "Capability selected, dispatching to execution",
      { requestId, capabilityId, runtime: discoveryResult.runtime },
    );

    const request: IExecutionRequest = {
      requestId,
      capability: capabilityId,
      input,
      requestedRuntime: discoveryResult.runtime,
      timeoutMs: options.timeoutMs,
      riskLevel: options.riskLevel,
      originatingTask: options.originatingTask,
      metadata: options.metadata,
    };

    const startedAt = Date.now();
    const result = await this.execution.execute(request);

    Logger.getInstance().info(
      BRAIN_MODULE_NAMES.capabilityOrchestrator,
      result.success
        ? "Capability execution completed"
        : "Capability execution failed",
      {
        requestId,
        capabilityId,
        runtime: discoveryResult.runtime,
        success: result.success,
        durationMs: Date.now() - startedAt,
      },
    );

    return result;
  }
}

export const brainCapabilityOrchestrator = new BrainCapabilityOrchestrator();
