import { CoreBridge } from "../integrations/CoreBridge";

export class RuntimeSnapshotWidget {
  private readonly bridge = CoreBridge.getInstance();

  public render() {
    const snapshot = this.bridge.getSystemSnapshot();
    return {
      timestamp: new Date().toISOString(),
      data: snapshot,
      jsonView: JSON.stringify(snapshot, null, 2),
    };
  }
}
