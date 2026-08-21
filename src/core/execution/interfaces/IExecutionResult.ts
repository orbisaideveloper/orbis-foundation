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
  /**
   * TASK-020 (Part 1): present only when BrainRequestGateway determined
   * the request cannot proceed because required context is missing.
   * Both fields are optional and additive — existing callers that never
   * set/read them are unaffected.
   */
  clarificationRequired?: boolean;
  missingFields?: string[];
}
