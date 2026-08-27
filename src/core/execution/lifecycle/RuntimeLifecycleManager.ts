import { LifecycleState } from "./LifecycleState";
import { RuntimeHealth } from "./RuntimeHealth";

export class RuntimeLifecycleManager {
  private readonly runtimes: Map<string, RuntimeHealth> = new Map();

  public register(
    runtimeId: string,
    version: string,
    capabilities: string[],
  ): void {
    if (this.runtimes.has(runtimeId)) {
      throw new Error(`Runtime ${runtimeId} is already registered.`);
    }

    this.runtimes.set(runtimeId, {
      runtimeId,
      state: LifecycleState.REGISTERED,
      healthy: true,
      ready: false,
      lastChecked: Date.now(),
      version,
      capabilities,
    });
  }

  public initialize(runtimeId: string): void {
    const runtime = this.getRuntimeStrict(runtimeId);

    if (
      runtime.state !== LifecycleState.REGISTERED &&
      runtime.state !== LifecycleState.FAILED
    ) {
      throw new Error(
        `Invalid state transition. Cannot initialize from ${runtime.state}`,
      );
    }

    runtime.state = LifecycleState.INITIALIZING;
    runtime.lastChecked = Date.now();
  }

  public setReady(runtimeId: string): void {
    const runtime = this.getRuntimeStrict(runtimeId);

    if (runtime.state !== LifecycleState.INITIALIZING) {
      throw new Error(
        `Invalid state transition. Cannot set READY from ${runtime.state}`,
      );
    }

    runtime.state = LifecycleState.READY;
    runtime.ready = true;
    runtime.healthy = true;
    runtime.lastChecked = Date.now();
  }

  public setFailed(runtimeId: string, errorMsg: string): void {
    const runtime = this.getRuntimeStrict(runtimeId);
    runtime.state = LifecycleState.FAILED;
    runtime.ready = false;
    runtime.healthy = false;
    runtime.error = errorMsg;
    runtime.lastChecked = Date.now();
  }

  public stop(runtimeId: string): void {
    const runtime = this.getRuntimeStrict(runtimeId);
    if (
      runtime.state === LifecycleState.STOPPED ||
      runtime.state === LifecycleState.UNREGISTERED
    ) {
      return;
    }
    runtime.state = LifecycleState.STOPPING;
    runtime.ready = false;
    // Simulate synchronous stop for abstraction
    runtime.state = LifecycleState.STOPPED;
    runtime.lastChecked = Date.now();
  }

  public verifyCapability(runtimeId: string, capability: string): boolean {
    const runtime = this.getRuntimeStrict(runtimeId);

    if (
      runtime.state !== LifecycleState.READY ||
      !runtime.ready ||
      !runtime.healthy
    ) {
      return false;
    }

    return runtime.capabilities.includes(capability);
  }

  public getHealth(runtimeId: string): RuntimeHealth {
    return this.getRuntimeStrict(runtimeId);
  }

  private getRuntimeStrict(runtimeId: string): RuntimeHealth {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new Error(
        `Runtime ${runtimeId} is UNREGISTERED or does not exist.`,
      );
    }
    return runtime;
  }
}
