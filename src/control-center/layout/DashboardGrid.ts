import { SystemStatusWidget } from "../widgets/SystemStatusWidget";
import { HealthMatrixWidget } from "../widgets/HealthMatrixWidget";
import { RuntimeSnapshotWidget } from "../widgets/RuntimeSnapshotWidget";
import { CoreBridge } from "../integrations/CoreBridge";

export class DashboardGrid {
  private readonly statusWidget = new SystemStatusWidget();
  private readonly healthWidget = new HealthMatrixWidget();
  private readonly snapshotWidget = new RuntimeSnapshotWidget();
  private readonly bridge = CoreBridge.getInstance();

  public render() {
    const components = this.bridge.getHealthComponents();

    return {
      header: this.statusWidget.render(),
      registries: {
        componentCount: components.length > 0 ? components.length : "0",
      },
      grid: {
        healthMatrix: this.healthWidget.render(),
        runtimeSnapshot: this.snapshotWidget.render(),
      },
    };
  }
}
