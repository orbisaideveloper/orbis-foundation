import { SystemStatusWidget } from '../widgets/SystemStatusWidget';
import { CoreBridge } from '../integrations/CoreBridge';

export class DashboardGrid {
  private readonly statusWidget = new SystemStatusWidget();
  private readonly bridge = CoreBridge.getInstance();

  public render() {
    const components = this.bridge.getHealthComponents();
    
    return {
      header: this.statusWidget.render(),
      registries: {
        componentCount: components.length > 0 ? components.length : "0"
      },
      grid: {
        healthMatrix: components.length > 0 ? components : "No Health Data Available"
      }
    };
  }
}
