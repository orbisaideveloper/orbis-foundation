import { IExecutionRuntime } from "../interfaces/IExecutionRuntime";
import { ICapability } from "./CapabilityModel";

export class RuntimeRegistry {
  private runtimes: Map<string, IExecutionRuntime> = new Map();
  private capabilities: Map<string, ICapability> = new Map();

  registerRuntime(
    runtime: IExecutionRuntime,
    capabilities: ICapability[],
  ): void {
    const name = runtime.getName();

    if (this.runtimes.has(name)) {
      throw new Error(`Runtime '${name}' is already registered.`);
    }

    // Register the runtime
    this.runtimes.set(name, runtime);

    // Register its capabilities safely
    for (const cap of capabilities) {
      if (this.capabilities.has(cap.id)) {
        // Rollback runtime registration to maintain system consistency
        this.runtimes.delete(name);
        throw new Error(
          `Capability '${cap.id}' is already registered in the system.`,
        );
      }
      this.capabilities.set(cap.id, cap);
    }
  }

  unregisterRuntime(name: string): boolean {
    if (!this.runtimes.has(name)) return false;

    this.runtimes.delete(name);

    // Remove all capabilities associated with this runtime
    for (const [capId, cap] of this.capabilities.entries()) {
      if (cap.runtime === name) {
        this.capabilities.delete(capId);
      }
    }
    return true;
  }

  getRuntime(name: string): IExecutionRuntime | undefined {
    return this.runtimes.get(name);
  }

  getCapability(id: string): ICapability | undefined {
    return this.capabilities.get(id);
  }

  listRuntimes(): string[] {
    return Array.from(this.runtimes.keys());
  }
}
