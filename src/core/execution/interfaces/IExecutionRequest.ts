export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface IExecutionRequest {
  requestId: string;
  capability: string;
  input: Record<string, any>;
  requestedRuntime?: string;
  timeoutMs?: number;
  riskLevel?: RiskLevel;
  originatingTask?: string;
  metadata?: Record<string, any>;
}
