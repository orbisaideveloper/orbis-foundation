import { SystemOrchestrator } from "../../core/orchestrator/SystemOrchestrator";
import { HealthRegistry } from "../../core/health/HealthRegistry";

export class CoreBridge {
  private static instance: CoreBridge;

  private constructor() {}

  public static getInstance(): CoreBridge {
    if (!CoreBridge.instance) {
      CoreBridge.instance = new CoreBridge();
    }
    return CoreBridge.instance;
  }

  public getSystemSnapshot() {
    return SystemOrchestrator.getInstance().getSnapshot();
  }

  public getHealthComponents() {
    return HealthRegistry.getInstance().getAllComponents();
  }
}
