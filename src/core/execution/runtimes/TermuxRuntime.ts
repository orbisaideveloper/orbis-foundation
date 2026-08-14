import { IExecutionRequest } from "../interfaces/IExecutionRequest";
import { IExecutionResult } from "../interfaces/IExecutionResult";
import { IExecutionRuntime } from "../interfaces/IExecutionRuntime";

export class TermuxRuntime implements IExecutionRuntime {
  private readonly name = "TermuxRuntime";
  private readonly version = "0.1.0";
  private readonly healthUrl = "http://127.0.0.1:8765/health";

  public getName(): string {
    return this.name;
  }

  public getVersion(): string {
    return this.version;
  }

  public getSupportedCapabilities(): string[] {
    return [];
  }

  public async initialize(): Promise<void> {
    return;
  }

  /**
   * REAL connectivity check.
   * No response from the real Termux bridge = false.
   */
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

  /**
   * Execution remains intentionally disabled.
   * Connectivity does NOT imply execution permission.
   */
  public async execute(request: IExecutionRequest): Promise<IExecutionResult> {
    return {
      success: false,
      requestId: request.requestId,
      runtime: this.name,
      error: "Termux execution capability is not implemented.",
      durationMs: 0,
    };
  }

  public async shutdown(): Promise<void> {
    return;
  }
}
