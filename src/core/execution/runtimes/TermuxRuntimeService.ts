import { TermuxRuntime } from "./TermuxRuntime";
import { RuntimeRegistry } from "../registry/RuntimeRegistry";
import { RuntimeLifecycleManager } from "../lifecycle/RuntimeLifecycleManager";
import { LifecycleState } from "../lifecycle/LifecycleState";
import { IExecutionRequest } from "../interfaces/IExecutionRequest";
import { IExecutionResult } from "../interfaces/IExecutionResult";

export interface TermuxRuntimeStatus {
  registered: boolean;
  healthy: boolean;
  ready: boolean;
  connected: boolean;
  state: LifecycleState;
  runtime: string;
  version: string;
  capabilities: string[];
  bridgeStatus: string;
  checkedAt: number;
}

export class TermuxRuntimeService {
  private readonly runtime = new TermuxRuntime();
  private readonly registry = new RuntimeRegistry();
  private readonly lifecycle = new RuntimeLifecycleManager();

  public async check(): Promise<TermuxRuntimeStatus> {
    const name = this.runtime.getName();
    if (!this.registry.getRuntime(name)) {
      this.registry.registerRuntime(this.runtime, [
        {
          id: "termux.system.info",
          name: "System Info",
          description: "Get structured system info",
          riskLevel: "SAFE",
          requiresApproval: false,
          enabled: true,
          runtime: name,
        },
      ]);
      this.lifecycle.register(
        name,
        this.runtime.getVersion(),
        this.runtime.getSupportedCapabilities(),
      );
    }

    const handshake = await this.runtime.performHandshake();
    const healthy = await this.runtime.healthCheck();

    let health = this.lifecycle.getHealth(name);

    if (healthy && handshake.identityValid) {
      if (
        health.state === LifecycleState.REGISTERED ||
        health.state === LifecycleState.FAILED
      ) {
        this.lifecycle.initialize(name);
        this.lifecycle.setReady(name);
      }
    } else if (
      health.state !== LifecycleState.FAILED &&
      health.state !== LifecycleState.STOPPED &&
      health.state !== LifecycleState.UNREGISTERED
    ) {
      this.lifecycle.setFailed(
        name,
        "Termux bridge unreachable or identity invalid.",
      );
    }

    health = this.lifecycle.getHealth(name);

    return {
      registered: !!this.registry.getRuntime(name),
      healthy,
      ready: health.ready,
      connected: healthy && health.ready && handshake.identityValid,
      state: health.state,
      runtime: name,
      version: this.runtime.getVersion(),
      capabilities: handshake.capabilities,
      bridgeStatus: handshake.status,
      checkedAt: health.lastChecked,
    };
  }

  public async executeCapability(
    request: IExecutionRequest,
  ): Promise<IExecutionResult> {
    const status = await this.check();
    if (!status.connected) {
      return {
        success: false,
        requestId: request.requestId,
        runtime: this.runtime.getName(),
        error:
          "BRIDGE_UNREACHABLE: Cannot execute capability when bridge is disconnected.",
        durationMs: 0,
      };
    }

    return this.runtime.execute(request);
  }
}

export const termuxRuntimeService = new TermuxRuntimeService();
