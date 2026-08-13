export interface IExecutionResult {
  success: boolean;
  requestId: string;
  runtime: string;
  output?: any;
  error?: string;
  durationMs: number;
  exitCode?: number;
  metadata?: Record<string, any>;
}
