export class LogStore {
    private static instance: LogStore;
    private readonly logs: string[] = [];
    private readonly MAX_LOGS = 1000;

    private constructor() {}

    public static getInstance(): LogStore {
        if (!LogStore.instance) {
            LogStore.instance = new LogStore();
        }
        return LogStore.instance;
    }

    public addLog(log: string): void {
        if (this.logs.length >= this.MAX_LOGS) {
            this.logs.shift(); // রিমুভ করবে সবচেয়ে পুরনো লগ
        }
        this.logs.push(log);
    }

    public getLogs(): string[] {
        return [...this.logs]; // অরিজিনাল অ্যারে সুরক্ষিত রাখতে কপি রিটার্ন করছি
    }

    public clear(): void {
        this.logs.length = 0;
    }
}
