// @ts-nocheck
import { HealthRegistry } from "./HealthRegistry";
import { EventBus } from "../events/EventBus";

export class HealthReporter {
  private static instance: HealthReporter;
  private readonly registry: HealthRegistry;
  private readonly eventBus: EventBus;
  private intervalId?: ReturnType<typeof setInterval>;
  private isRunning: boolean = false;

  private constructor() {
    this.registry = HealthRegistry.getInstance();
    this.eventBus = EventBus.getInstance();
  }

  public static getInstance(): HealthReporter {
    if (!HealthReporter.instance) {
      HealthReporter.instance = new HealthReporter();
    }
    return HealthReporter.instance;
  }

  public async runChecks(): Promise<void> {
    const components = this.registry.getAllComponents();
    const results: Record<string, boolean> = {};
    let allHealthy = true;

    for (const component of components) {
      try {
        const isHealthy = await component.checkHealth();
        results[component.name] = isHealthy;
        if (!isHealthy) {
          allHealthy = false;
        }
      } catch (error) {
        console.error("[ORBIS Health] Component check failed:", error);
        results[component.name] = false;
        allHealthy = false;
      }
    }

    this.eventBus.publish({
      type: "HEALTH_REPORT",
      payload: { allHealthy, results },
      timestamp: Date.now(),
    });
  }

  public start(intervalMs: number = 30000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.runChecks().catch((err) =>
        console.error("[ORBIS Health] Error running checks", err),
      );
    }, intervalMs);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
  }

  public getStatus(): boolean {
    return this.isRunning;
  }
}
