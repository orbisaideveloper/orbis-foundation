export interface IExecutionResult {
  success: boolean;
  requestId: string;
  runtime: string;
  output?: any;
  error?: string;
  approvalRequired?: boolean;
  approvalToken?: string;
  approvalExpiresAt?: number;
  durationMs: number;
  exitCode?: number;
  metadata?: Record<string, any>;
}
