import { CoreBridge } from '../integrations/CoreBridge';

export class SystemStatusWidget {
  private bridge = CoreBridge.getInstance();

  public render() {
    const snapshot = this.bridge.getSystemSnapshot();
    const fallback = "No Runtime Data Available";

    return {
      status: snapshot?.status || fallback,
      eventCount: snapshot?.metrics?.eventCount ?? "0",
      bootTime: snapshot?.bootTime || "System Offline"
    };
  }
}
