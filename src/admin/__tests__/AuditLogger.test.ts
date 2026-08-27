import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditLogger } from "../auth/AuditLogger";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AuditLogger", () => {
  it("records the action, user, timestamp, and optional structured details", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T00:00:00.000Z"));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const details = { source: "admin-dashboard" };

    AuditLogger.logEvent("EXPORT", "admin-42", details);

    expect(info).toHaveBeenCalledWith(
      "[AUDIT] 2026-08-27T00:00:00.000Z | Action: EXPORT | User: admin-42",
      details,
    );
  });

  it("uses an empty details value when no details are provided", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    AuditLogger.logEvent("VIEW", "admin-7");

    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("Action: VIEW | User: admin-7"),
      "",
    );
  });
});
