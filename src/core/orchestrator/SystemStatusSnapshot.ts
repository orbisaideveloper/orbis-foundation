export interface SystemSnapshot {
  readonly timestamp: string;
  readonly status: "STARTING" | "READY" | "STOPPING" | "STOPPED" | "ERROR";
  readonly health: Record<string, any>;
  readonly metrics: {
    readonly eventCount: number;
    readonly logCount: number;
  };
}

export class SystemStatusSnapshot {
  /**
   * Generates an immutable snapshot of the current system state.
   */
  public static generate(
    status: SystemSnapshot["status"],
    healthData: Record<string, any>,
    eventCount: number,
    logCount: number,
  ): SystemSnapshot {
    return Object.freeze({
      timestamp: new Date().toISOString(),
      status,
      health: Object.freeze({ ...healthData }),
      metrics: Object.freeze({ eventCount, logCount }),
    });
  }
}
