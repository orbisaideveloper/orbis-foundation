export type ServiceStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  activeNodes: number;
}

export interface RuntimeState {
  engineStatus: ServiceStatus;
  brainStatus: ServiceStatus;
  healthStatus: ServiceStatus;
  metrics: SystemMetrics;
  lastUpdated: number | null;
}

export interface RuntimeContextType extends RuntimeState {
  updateRuntimeState: (newState: Partial<RuntimeState>) => void;
}
