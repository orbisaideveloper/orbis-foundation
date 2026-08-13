import { LifecycleState } from "./LifecycleState";

export interface RuntimeHealth {
  runtimeId: string;
  state: LifecycleState;
  healthy: boolean;
  ready: boolean;
  lastChecked: number;
  version: string;
  capabilities: string[];
  error?: string;
  metadata?: Record<string, any>;
}
