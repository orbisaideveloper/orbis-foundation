import { CoreBridge } from '../integrations/CoreBridge';

export class HealthMatrixWidget {
  private readonly bridge = CoreBridge.getInstance();

  public render() {
    const components = this.bridge.getHealthComponents();
    
    if (components.length === 0) {
      return { status: 'NO_DATA', display: 'No Health Data Available', items: [] };
    }

    return {
      status: 'ACTIVE',
      display: 'Live Health Matrix',
      items: components
    };
  }
}
