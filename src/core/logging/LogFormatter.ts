export interface LogPayload {
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    module: string;
    message: string;
    data?: unknown;
    error?: Error;
}

export class LogFormatter {
    public format(payload: LogPayload): string {
        const timestamp = new Date().toISOString();
        const formattedLog = {
            timestamp,
            level: payload.level,
            module: payload.module,
            message: payload.message,
            ...(payload.data && { data: payload.data }),
            ...(payload.error && { error: payload.error.message, stack: payload.error.stack }),
        };

        return JSON.stringify(formattedLog);
    }
}
