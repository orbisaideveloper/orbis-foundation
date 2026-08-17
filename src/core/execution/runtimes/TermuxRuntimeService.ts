import { TermuxRuntime } from "./TermuxRuntime";
import { RuntimeRegistry } from "../registry/RuntimeRegistry";
import { RuntimeLifecycleManager } from "../lifecycle/RuntimeLifecycleManager";
import { LifecycleState } from "../lifecycle/LifecycleState";
import { IExecutionRequest } from "../interfaces/IExecutionRequest";
import { IExecutionResult } from "../interfaces/IExecutionResult";
import { ExecutionPolicyEngine } from "../policy/ExecutionPolicyEngine";
import {
  SecureExecutionAuthorizationGate,
  IGateRegistryDeps,
  IGateLifecycleDeps,
  IGatePolicyDeps,
  AuthorizationResult,
} from "../authorization/SecureExecutionAuthorizationGate";

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
  private readonly registry: RuntimeRegistry;
  private readonly lifecycle: RuntimeLifecycleManager;
  private readonly policyEngine: ExecutionPolicyEngine;

  constructor(
    registry: RuntimeRegistry = new RuntimeRegistry(),
    lifecycle: RuntimeLifecycleManager = new RuntimeLifecycleManager(),
  ) {
    this.registry = registry;
    this.lifecycle = lifecycle;
    this.policyEngine = new ExecutionPolicyEngine(this.registry);
  }

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
        // TASK-018 (Section 3.A): read-only access to a fixed, hardcoded
        // allow-list of files (enforced in orbis-server/bridge.cjs). No
        // arbitrary path, no traversal, no shell/exec access is ever
        // possible — see bridge.cjs POST /api/termux/capability. This
        // capability is SENSITIVE + requiresApproval, so it is always
        // routed to REQUIRE_APPROVAL by the existing, unmodified
        // ExecutionPolicyEngine / SecureExecutionAuthorizationGate chain
        // (same as any other SENSITIVE capability) — no new approval
        // architecture was added.
        {
          id: "termux.file.read",
          name: "Read Local File (Allow-listed)",
          description:
            "Read the contents of a file selected from a fixed, hardcoded allow-list.",
          riskLevel: "SENSITIVE",
          requiresApproval: true,
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

    const runtimeId = this.runtime.getName();
    const authResult = this.authorizeRequest(request, runtimeId);

    if (!authResult.authorized) {
      return {
        success: false,
        requestId: request.requestId,
        runtime: runtimeId,
        error: `AUTHORIZATION_${authResult.decision}: ${authResult.reason}`,
        durationMs: 0,
      };
    }

    return this.runtime.execute(request);
  }

  private authorizeRequest(
    request: IExecutionRequest,
    runtimeId: string,
  ): AuthorizationResult {
    const registryDeps: IGateRegistryDeps = {
      hasRuntime: (id) => !!this.registry.getRuntime(id),

      hasCapability: (id, capabilityId) => {
        const cap = this.registry.getCapability(capabilityId);
        return !!cap && cap.runtime === id;
      },

      isCapabilityEnabled: (capabilityId) => {
        const cap = this.registry.getCapability(capabilityId);
        return cap?.enabled === true;
      },

      getCapabilityRiskLevel: (capabilityId) => {
        const cap = this.registry.getCapability(capabilityId);
        return cap?.riskLevel ?? "PRIVILEGED";
      },
    };

    const lifecycleDeps: IGateLifecycleDeps = {
      isReady: (id) => {
        try {
          return this.lifecycle.getHealth(id).ready === true;
        } catch {
          return false;
        }
      },

      isHealthy: (id) => {
        try {
          return this.lifecycle.getHealth(id).healthy === true;
        } catch {
          return false;
        }
      },
    };

    const policyDeps: IGatePolicyDeps = {
      evaluate: () => this.policyEngine.evaluate(request),
    };

    const gate = new SecureExecutionAuthorizationGate(
      registryDeps,
      lifecycleDeps,
      policyDeps,
    );

    return gate.authorize({
      runtimeId,
      capabilityId: request.capability,
      parameters: request.input,
    });
  }
}

export const termuxRuntimeService = new TermuxRuntimeService();
