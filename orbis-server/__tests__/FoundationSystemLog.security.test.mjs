// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const telemetry = require("../telemetry-module.cjs");

beforeEach(() => {
  telemetry.setDbClient(null);
  vi.restoreAllMocks();
});

describe("FoundationSystemLog explicit operational telemetry", () => {
  it("does not globally replace console.log or console.error", () => {
    const originalLog = console.log;
    const originalError = console.error;
    require("../telemetry-module.cjs");
    expect(console.log).toBe(originalLog);
    expect(console.error).toBe(originalError);
  });

  it("persists only an explicit allow-listed, normalized and bounded event", async () => {
    const create = vi.fn().mockResolvedValue({ id: "stored" });
    telemetry.setDbClient({ foundationSystemLog: { create } });

    await expect(
      telemetry.addSystemLog(
        " info ",
        " telemetry ",
        " Foundation\n telemetry   database ready ",
      ),
    ).resolves.toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        level: "INFO",
        source: "TELEMETRY",
        message: "Foundation telemetry database ready",
        timestamp: expect.any(String),
      }),
    });

    await expect(
      telemetry.addSystemLog("DEBUG", "TELEMETRY", "Unsupported level"),
    ).resolves.toBe(false);
    await expect(
      telemetry.addSystemLog("INFO", "REQUEST", "Unsupported source"),
    ).resolves.toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each([
    "Authorization: Bearer private-token",
    "access_token=private-token",
    "postgresql://user:password@database.example/foundation",
    "raw request body contains account data",
    "provider output contains a private answer",
    "user message was copied here",
    "Contact person@example.test for support",
    "Call +1 202 555 0199 for details",
    "My name is Private Person",
    '{"message":"raw body"}',
    "x".repeat(telemetry.MAX_LOG_MESSAGE_LENGTH + 1),
  ])(
    "rejects sensitive or oversized content without persisting it",
    async (message) => {
      const create = vi.fn();
      telemetry.setDbClient({ foundationSystemLog: { create } });

      await expect(
        telemetry.addSystemLog("INFO", "FOUNDATION", message),
      ).resolves.toBe(false);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("filters unsafe historical rows and returns only bounded diagnostic fields", () => {
    const safe = {
      id: "not-returned",
      createdAt: new Date(),
      timestamp: "2026-08-24T00:00:00.000Z",
      level: "INFO",
      source: "SYSTEM",
      message: "Foundation worker ready",
    };
    const unsafe = {
      ...safe,
      message: "Authorization: Bearer historical-secret",
    };

    expect(telemetry.sanitizeDiagnosticLogs([safe, unsafe])).toEqual([
      {
        timestamp: safe.timestamp,
        level: "INFO",
        source: "SYSTEM",
        message: safe.message,
      },
    ]);
  });

  it("never throws or recursively logs when telemetry storage fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    telemetry.setDbClient({
      foundationSystemLog: {
        create: vi.fn().mockRejectedValue(new Error("database unavailable")),
      },
    });

    await expect(
      telemetry.addSystemLog(
        "ERROR",
        "DATABASE",
        "Foundation telemetry storage unavailable",
      ),
    ).resolves.toBe(true);
    expect(error).not.toHaveBeenCalled();
  });
});
