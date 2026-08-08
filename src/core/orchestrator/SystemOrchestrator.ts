import { EventBus } from "../events/EventBus";
import { Logger } from "../logging/Logger";
import { HealthRegistry } from "../health/HealthRegistry";
import { HealthReporter } from "../health/HealthReporter";
import { PluginManager } from "../managers/PluginManager";
import { AdapterManager } from "../managers/AdapterManager";
import { SystemStatusSnapshot, SystemSnapshot } from "./SystemStatusSnapshot";

export class SystemOrchestrator {
  private static instance: SystemOrchestrator;
  private currentStatus: SystemSnapshot["status"] = "STOPPED";
  private readonly MODULE_NAME = "SystemOrchestrator";

  private constructor() {}

  public static getInstance(): SystemOrchestrator {
    if (!SystemOrchestrator.instance) {
      SystemOrchestrator.instance = new SystemOrchestrator();
    }
    return SystemOrchestrator.instance;
  }

  public async boot(): Promise<void> {
    if (this.currentStatus !== "STOPPED" && this.currentStatus !== "ERROR") {
      Logger.getInstance().warn(
        this.MODULE_NAME,
        "System boot ignored: System is already running or starting.",
      );
      return;
    }

    this.currentStatus = "STARTING";
    EventBus.getInstance().publish({
      type: "SYSTEM_STARTING",
      payload: { timestamp: new Date().toISOString() },
    } as any);
    Logger.getInstance().info(
      this.MODULE_NAME,
      "System initialization started.",
    );

    try {
      // ✅ FIX: Changed from initialize() to initializeAll() matching Phase-01 real API
      await PluginManager.getInstance().initializeAll();
      await AdapterManager.getInstance().initializeAll();
      HealthReporter.getInstance().start(5000);

      this.currentStatus = "READY";
      const snapshot = this.getSnapshot();
      EventBus.getInstance().publish({
        type: "SYSTEM_READY",
        payload: snapshot,
      } as any);
      Logger.getInstance().info(this.MODULE_NAME, "System is now READY.", {
        snapshot,
      });
    } catch (error) {
      this.currentStatus = "ERROR";
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errObj = error instanceof Error ? error : undefined;
      Logger.getInstance().error(
        this.MODULE_NAME,
        "Boot sequence failed",
        errObj,
        { error: errorMessage },
      );
      EventBus.getInstance().publish({
        type: "SYSTEM_ERROR",
        payload: { error: errorMessage },
      } as any);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (this.currentStatus === "STOPPED") {
      return;
    }

    this.currentStatus = "STOPPING";
    EventBus.getInstance().publish({
      type: "SYSTEM_STOPPING",
      payload: this.getSnapshot(),
    } as any);
    Logger.getInstance().info(this.MODULE_NAME, "System shutdown initiated.");

    try {
      HealthReporter.getInstance().stop();
      this.currentStatus = "STOPPED";
      EventBus.getInstance().publish({
        type: "SYSTEM_STOPPED",
        payload: { timestamp: new Date().toISOString() },
      } as any);
      Logger.getInstance().info(this.MODULE_NAME, "System stopped safely.");
    } catch (error) {
      this.currentStatus = "ERROR";
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errObj = error instanceof Error ? error : undefined;
      Logger.getInstance().error(
        this.MODULE_NAME,
        "Shutdown sequence failed",
        errObj,
        { error: errorMessage },
      );
      throw error;
    }
  }

  public getSnapshot(): SystemSnapshot {
    const components = HealthRegistry.getInstance().getAllComponents();
    const healthData: Record<string, string> = {};

    components.forEach((component) => {
      healthData[component.name] = "REGISTERED";
    });

    const eventCount = 0;
    const logCount = 0;

    return SystemStatusSnapshot.generate(
      this.currentStatus,
      healthData,
      eventCount,
      logCount,
    );
  }
}
