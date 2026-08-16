import {
  TermuxRuntimeService,
  TermuxRuntimeStatus,
  termuxRuntimeService,
} from "../execution/runtimes/TermuxRuntimeService";
import { Logger } from "../logging/Logger";
import { BRAIN_MODULE_NAMES } from "./BrainConfig";

/**
 * TASK-008 — Brain ↔ Local Termux Capability Discovery Integration
 *
 * This is the smallest boundary the ORBIS Brain needs to ask:
 *   "What local capabilities are currently available to me?"
 *
 * The Brain must never know about Termux HTTP endpoints and must never
 * reach into TermuxRuntime/TermuxRuntimeService directly. It depends on
 * this provider-independent abstraction instead.
 *
 * TASK-008 is DISCOVERY ONLY. This module never executes a capability
 * and never bypasses RuntimeRegistry / ExecutionPolicyEngine /
 * SecureExecutionAuthorizationGate. It only reuses the existing
 * TASK-006/TASK-007 handshake + status mechanism exposed by
 * TermuxRuntimeService.check().
 */

export interface BrainCapabilityInfo {
  id: string;
  available: boolean;
}

export interface CapabilityDiscoveryResult {
  runtime: string;
  connected: boolean;
  ready: boolean;
  bridgeStatus: string;
  capabilities: BrainCapabilityInfo[];
  checkedAt: number;
  /** Present only when capabilities could not be confirmed as available. */
  unavailableReason?: string;
}

export interface ILocalCapabilityDiscovery {
  discoverLocalCapabilities(): Promise<CapabilityDiscoveryResult>;
}

const describeUnavailable = (status: TermuxRuntimeStatus): string => {
  if (!status.healthy) return "BRIDGE_UNREACHABLE";
  if (status.bridgeStatus === "IDENTITY_INVALID") return "IDENTITY_INVALID";
  if (status.bridgeStatus === "BRIDGE_UNREACHABLE") return "BRIDGE_UNREACHABLE";
  if (!status.ready) return "RUNTIME_NOT_READY";
  return "CAPABILITIES_UNAVAILABLE";
};

/**
 * LocalCapabilityDiscovery is the ONLY object the ORBIS Brain should hold a
 * reference to when it needs to know what local capabilities exist. It
 * internally reuses TermuxRuntimeService — it does not talk to Termux, the
 * bridge, or any HTTP endpoint on its own.
 */
export class LocalCapabilityDiscovery implements ILocalCapabilityDiscovery {
  constructor(
    private readonly termuxService: TermuxRuntimeService = termuxRuntimeService,
  ) {}

  public async discoverLocalCapabilities(): Promise<CapabilityDiscoveryResult> {
    try {
      const status = await this.termuxService.check();

      if (!status.connected) {
        const unavailableReason = describeUnavailable(status);
        Logger.getInstance().warn(
          BRAIN_MODULE_NAMES.capabilityDiscovery,
          "Local capability discovery unavailable",
          { runtime: status.runtime, unavailableReason },
        );
        return {
          runtime: status.runtime,
          connected: false,
          ready: status.ready,
          bridgeStatus: status.bridgeStatus,
          capabilities: [],
          checkedAt: status.checkedAt,
          unavailableReason,
        };
      }

      const capabilities: BrainCapabilityInfo[] = status.capabilities.map(
        (id) => ({
          id,
          available: true,
        }),
      );

      Logger.getInstance().debug(
        BRAIN_MODULE_NAMES.capabilityDiscovery,
        "Local capability discovery succeeded",
        { runtime: status.runtime, capabilityCount: capabilities.length },
      );

      return {
        runtime: status.runtime,
        connected: true,
        ready: status.ready,
        bridgeStatus: status.bridgeStatus,
        capabilities,
        checkedAt: status.checkedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
      Logger.getInstance().error(
        BRAIN_MODULE_NAMES.capabilityDiscovery,
        "Local capability discovery threw an error",
        error instanceof Error ? error : undefined,
        { message },
      );
      // TASK-008 rule: never throw an uncontrolled error into the Brain.
      return {
        runtime: "unknown",
        connected: false,
        ready: false,
        bridgeStatus: "DISCOVERY_FAILED",
        capabilities: [],
        checkedAt: Date.now(),
        unavailableReason: message,
      };
    }
  }
}

export const localCapabilityDiscovery = new LocalCapabilityDiscovery();
