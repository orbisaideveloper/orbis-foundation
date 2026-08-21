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
import { pendingApprovalStore } from "../authorization/PendingApprovalStore";

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
  private readonly approvalStore = pendingApprovalStore;

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

    const runtimeId = request.requestedRuntime ?? this.runtime.getName();
    const authResult = this.authorizeRequest(request, runtimeId);

    if (!authResult.authorized) {
      if (authResult.requiresApproval) {
        const pending = this.approvalStore.create({
          ...request,
          requestedRuntime: runtimeId,
        });

        return {
          success: false,
          requestId: request.requestId,
          runtime: runtimeId,
          error: `AUTHORIZATION_REQUIRE_APPROVAL: ${authResult.reason}`,
          approvalRequired: true,
          approvalToken: pending.token,
          approvalExpiresAt: pending.expiresAt,
          durationMs: 0,
        };
      }

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

  public async resolveApproval(
    token: string,
    decision: "APPROVE" | "REJECT",
  ): Promise<IExecutionResult> {
    const resolved = this.approvalStore.resolve(token, decision);

    if (resolved.resolution === "REJECTED") {
      return {
        success: false,
        requestId: "approval-rejected",
        runtime: this.runtime.getName(),
        error: "APPROVAL_REJECTED",
        durationMs: 0,
      };
    }

    if (resolved.resolution !== "APPROVED" || !resolved.request) {
      return {
        success: false,
        requestId: "approval-invalid",
        runtime: this.runtime.getName(),
        error: `APPROVAL_${resolved.resolution}`,
        durationMs: 0,
      };
    }

    const request = resolved.request;

    // TASK-020 (Part 3): resolve() above only RESERVED the token — it is
    // not yet consumed. Every return path from here on must explicitly
    // confirm() (final, non-transient outcome) or release() (transient/
    // environmental failure, so the still-valid, human-approved token is
    // not lost) before returning, so the store's state and the actual
    // execution outcome never drift apart.
    const status = await this.check();

    if (!status.connected) {
      // Transient/environmental: the bridge being unreachable right now
      // says nothing about whether the human's approval was valid. Put
      // the token back to PENDING so it can be retried within its
      // original TTL instead of being silently burned.
      this.approvalStore.release(token);
      return {
        success: false,
        requestId: request.requestId,
        runtime: this.runtime.getName(),
        error:
          "BRIDGE_UNREACHABLE: Cannot execute approved capability when bridge is disconnected.",
        durationMs: 0,
      };
    }

    const runtimeId = request.requestedRuntime ?? this.runtime.getName();

    // The approval token only proves explicit human confirmation.
    // Authorization is recalculated from the current registry/lifecycle/
    // policy state immediately before execution. By this point status.
    // connected is already true, which — given how check() derives
    // readiness/health — means isReady()/isHealthy() are guaranteed true
    // too, so any denial reaching here is structural (unknown/disabled
    // capability, PRIVILEGED, policy DENY), not transient. It will not
    // change on retry, so the token is finalized rather than released.
    const authResult = this.authorizeRequest(request, runtimeId, true);

    if (!authResult.authorized) {
      this.approvalStore.confirm(token);
      return {
        success: false,
        requestId: request.requestId,
        runtime: runtimeId,
        error: `AUTHORIZATION_${authResult.decision}: ${authResult.reason}`,
        durationMs: 0,
      };
    }

    const executionResult = await this.runtime.execute(request);
    this.approvalStore.confirm(token);

    return {
      ...executionResult,
      metadata: {
        ...(executionResult.metadata || {}),
        capabilityId: request.capability,
        approvalToken: token,
      },
    };
  }

  private authorizeRequest(
    request: IExecutionRequest,
    runtimeId: string,
    approvalGranted = false,
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
      approvalGranted,
    });
  }
}

export const termuxRuntimeService = new TermuxRuntimeService();
