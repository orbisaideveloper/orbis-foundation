import { LogFormatter, LogPayload } from "./LogFormatter";
import { LogStore } from "./LogStore";

export class Logger {
  private static instance: Logger;
  private readonly formatter: LogFormatter;
  private readonly store: LogStore;

  private constructor() {
    this.formatter = new LogFormatter();
    this.store = LogStore.getInstance();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private log(
    level: LogPayload["level"],
    module: string,
    message: string,
    data?: unknown,
    error?: Error,
  ): void {
    const payload: LogPayload = { level, module, message, data, error };
    const formattedLog = this.formatter.format(payload);
    this.store.addLog(formattedLog);
  }

  public info(module: string, message: string, data?: unknown): void {
    this.log("INFO", module, message, data);
  }

  public warn(module: string, message: string, data?: unknown): void {
    this.log("WARN", module, message, data);
  }

  public error(
    module: string,
    message: string,
    error?: Error,
    data?: unknown,
  ): void {
    this.log("ERROR", module, message, data, error);
  }

  public debug(module: string, message: string, data?: unknown): void {
    this.log("DEBUG", module, message, data);
  }
}
