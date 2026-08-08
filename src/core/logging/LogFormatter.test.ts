import { describe, it, expect } from "vitest";
import { LogFormatter, LogPayload } from "./LogFormatter";

describe("LogFormatter", () => {
  const formatter = new LogFormatter();

  it("should format a basic log message into JSON string", () => {
    const payload: LogPayload = {
      level: "INFO",
      module: "TestModule",
      message: "System started",
    };

    const result = formatter.format(payload);
    const parsed = JSON.parse(result);

    expect(parsed.level).toBe("INFO");
    expect(parsed.module).toBe("TestModule");
    expect(parsed.message).toBe("System started");
    expect(parsed.timestamp).toBeDefined();
  });

  it("should include optional data if provided", () => {
    const payload: LogPayload = {
      level: "DEBUG",
      module: "Network",
      message: "Request received",
      data: { id: 123 },
    };

    const parsed = JSON.parse(formatter.format(payload));
    expect(parsed.data).toEqual({ id: 123 });
  });

  it("should format error object correctly", () => {
    const mockError = new Error("Test crash");
    const payload: LogPayload = {
      level: "ERROR",
      module: "Database",
      message: "Connection failed",
      error: mockError,
    };

    const parsed = JSON.parse(formatter.format(payload));
    expect(parsed.error).toBe("Test crash");
    expect(parsed.stack).toBeDefined();
  });
});
