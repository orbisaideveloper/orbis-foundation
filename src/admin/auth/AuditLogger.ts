export class AuditLogger {
  static logEvent(action: string, userId: string, details?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    // For now, it logs securely to console. In Step-304, this routes to EventBus.
    console.info(`[AUDIT] ${timestamp} | Action: ${action} | User: ${userId}`, details || '');
  }
}
