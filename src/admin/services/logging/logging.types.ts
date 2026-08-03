export interface RuntimeErrorLog {
  error_message: string;
  error_stack?: string;
  component_name?: string;
}

export interface AuditTrailLog {
  action_type: string;
  action_details: Record<string, any>;
  user_id?: string;
}
