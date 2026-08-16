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
  riskLevel?: IExecutionRequest["riskLevel"];
  originatingTask?: string;
  metadata?: Record<string, any>;
}

export interface IBrainCapabilityOrchestrator {
  requestCapability(
    capabilityId: string,
    input: Record<string, any>,
    options?: RequestCapabilityOptions,
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

  public async requestCapability(
    capabilityId: string,
    input: Record<string, any> = {},
    options: RequestCapabilityOptions = {},
  ): Promise<IExecutionResult> {
    const requestId = options.requestId ?? generateRequestId();

    if (!capabilityId) {
      return buildUndiscoverableResult(
        requestId,
        "unknown",
        "CAPABILITY_ID_REQUIRED",
      );
    }

    const discoveryResult = await this.discovery.discoverLocalCapabilities();

    if (!discoveryResult.connected || !discoveryResult.ready) {
      return buildUndiscoverableResult(
        requestId,
        discoveryResult.runtime,
        "DISCOVERY_UNAVAILABLE",
        discoveryResult.unavailableReason,
      );
    }

    const discovered = discoveryResult.capabilities.find(
      (cap) => cap.id === capabilityId && cap.available,
    );

    if (!discovered) {
      return buildUndiscoverableResult(
        requestId,
        discoveryResult.runtime,
        "CAPABILITY_NOT_DISCOVERABLE",
      );
    }

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

    return this.execution.execute(request);
  }
}

export const brainCapabilityOrchestrator = new BrainCapabilityOrchestrator();
