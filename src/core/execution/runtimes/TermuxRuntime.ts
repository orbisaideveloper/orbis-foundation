import { IExecutionRequest } from "../interfaces/IExecutionRequest";
import { IExecutionResult } from "../interfaces/IExecutionResult";
import { IExecutionRuntime } from "../interfaces/IExecutionRuntime";

export interface TermuxHandshakeResult {
  reachable: boolean;
  identityValid: boolean;
  capabilitiesVerified: boolean;
  capabilities: string[];
  status: string;
}

export class TermuxRuntime implements IExecutionRuntime {
  private readonly name = "TermuxRuntime";
  private readonly version = "0.1.0";
  private readonly healthUrl = "http://127.0.0.1:8765/health";
  private readonly handshakeUrl = "http://127.0.0.1:8765/api/termux/handshake";
  private readonly executeUrl = "http://127.0.0.1:8765/api/termux/capability";
  private discoveredCapabilities: string[] = ["termux.system.info"];

  public getName(): string {
    return this.name;
  }

  public getVersion(): string {
    return this.version;
  }

  public getSupportedCapabilities(): string[] {
    return this.discoveredCapabilities;
  }

  public async initialize(): Promise<void> {
    await this.performHandshake();
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.healthUrl, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) return false;
      const data = await response.json();
      return (
        data?.ok === true &&
        data?.runtime === this.name &&
        data?.platform === "android-termux"
      );
    } catch {
      return false;
    }
  }

  public async performHandshake(): Promise<TermuxHandshakeResult> {
    try {
      const response = await fetch(this.handshakeUrl, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        return {
          reachable: false,
          identityValid: false,
          capabilitiesVerified: false,
          capabilities: [],
          status: "BRIDGE_UNREACHABLE",
        };
      }
      const data = await response.json();
      const identityValid = data?.identity?.valid === true;
      const capabilities = Array.isArray(data?.capabilities)
        ? data.capabilities.map((c: { id: string }) => c.id)
        : ["termux.system.info"];

      if (identityValid) {
        this.discoveredCapabilities = capabilities;
      }

      return {
        reachable: true,
        identityValid,
        capabilitiesVerified: capabilities.length > 0,
        capabilities,
        status: identityValid ? "CAPABILITIES_VERIFIED" : "IDENTITY_INVALID",
      };
    } catch {
      return {
        reachable: false,
        identityValid: false,
        capabilitiesVerified: false,
        capabilities: [],
        status: "BRIDGE_UNREACHABLE",
      };
    }
  }

  public async execute(request: IExecutionRequest): Promise<IExecutionResult> {
    const startTime = Date.now();

    if (!request || !request.capability) {
      return {
        success: false,
        requestId: request?.requestId || "unknown",
        runtime: this.name,
        error: "CAPABILITY_NOT_FOUND: Missing capability identifier.",
        durationMs: Date.now() - startTime,
      };
    }

    if (!this.discoveredCapabilities.includes(request.capability)) {
      return {
        success: false,
        requestId: request.requestId,
        runtime: this.name,
        error: `CAPABILITY_NOT_FOUND: Capability '${request.capability}' is not supported.`,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const response = await fetch(this.executeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capability: request.capability }),
      });

      const resultData = await response.json();

      if (!response.ok || !resultData.success) {
        return {
          success: false,
          requestId: request.requestId,
          runtime: this.name,
          error: resultData.error || "EXECUTION_FAILED",
          durationMs: Date.now() - startTime,
        };
      }

      return {
        success: true,
        requestId: request.requestId,
        runtime: this.name,
        output: resultData.data,
        durationMs: Date.now() - startTime,
      };
    } catch {
      return {
        success: false,
        requestId: request.requestId,
        runtime: this.name,
        error:
          "BRIDGE_UNREACHABLE: Failed to connect to Termux runtime bridge.",
        durationMs: Date.now() - startTime,
      };
    }
  }

  public async shutdown(): Promise<void> {
    this.discoveredCapabilities = [];
  }
}
