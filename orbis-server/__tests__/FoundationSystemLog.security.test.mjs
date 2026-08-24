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
    const upsert = vi.fn().mockResolvedValue({ id: "stored" });
    telemetry.setDbClient({ foundationSystemLog: { upsert } });

    await expect(
      telemetry.addSystemLog(
        " info ",
        " telemetry ",
        " Foundation\n telemetry   database ready ",
      ),
    ).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledWith({
      where: { fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
      create: expect.objectContaining({
        level: "INFO",
        source: "TELEMETRY",
        category: "TELEMETRY",
        severity: "INFO",
        count: 1,
        message: "Foundation telemetry database ready",
        timestamp: expect.any(String),
        retentionUntil: expect.any(Date),
      }),
      update: expect.objectContaining({ count: { increment: 1 } }),
    });

    await expect(
      telemetry.addSystemLog("DEBUG", "TELEMETRY", "Unsupported level"),
    ).resolves.toBe(false);
    await expect(
      telemetry.addSystemLog("INFO", "REQUEST", "Unsupported source"),
    ).resolves.toBe(false);
    expect(upsert).toHaveBeenCalledTimes(1);
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
    "hello how are you",
    '{"message":"raw body"}',
    "x".repeat(telemetry.MAX_LOG_MESSAGE_LENGTH + 1),
  ])(
    "rejects sensitive or oversized content without persisting it",
    async (message) => {
      const upsert = vi.fn();
      telemetry.setDbClient({ foundationSystemLog: { upsert } });

      await expect(
        telemetry.addSystemLog("INFO", "FOUNDATION", message),
      ).resolves.toBe(false);
      expect(upsert).not.toHaveBeenCalled();
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
        category: "SYSTEM",
        severity: "INFO",
        count: 1,
        firstSeen: safe.timestamp,
        lastSeen: safe.timestamp,
        message: safe.message,
      },
    ]);
  });

  it("never throws or recursively logs when telemetry storage fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    telemetry.setDbClient({
      foundationSystemLog: {
        upsert: vi.fn().mockRejectedValue(new Error("database unavailable")),
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

  it("aggregates equivalent events in one window with non-reversible fingerprints", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    telemetry.setDbClient({ foundationSystemLog: { upsert } });
    const now = new Date("2026-08-24T12:00:00.000Z");

    await telemetry.addSystemLog(
      "WARN",
      "DATABASE",
      "Foundation database connection degraded",
      { now },
    );
    await telemetry.addSystemLog(
      "WARN",
      "DATABASE",
      "Foundation database connection degraded",
      { now: new Date(now.getTime() + 30_000) },
    );

    const fingerprints = upsert.mock.calls.map(
      (call) => call[0].where.fingerprint,
    );
    expect(new Set(fingerprints).size).toBe(1);
    expect(fingerprints[0]).not.toContain("database");
    expect(upsert.mock.calls[0][0].create.retentionUntil).toEqual(
      new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    );
  });

  it("retains security/Admin audit events for 90 days", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    telemetry.setDbClient({ foundationSystemLog: { upsert } });
    const now = new Date("2026-08-24T12:00:00.000Z");

    await telemetry.addSystemLog(
      "INFO",
      "ADMIN_AUDIT",
      "Admin diagnostic export generated",
      { now },
    );

    expect(upsert.mock.calls[0][0].create.retentionUntil).toEqual(
      new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
    );
  });

  it("cleans only a bounded set of expired FoundationSystemLog ids", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    telemetry.setDbClient({ foundationSystemLog: { findMany, deleteMany } });
    const now = new Date("2026-08-24T12:00:00.000Z");

    await expect(
      telemetry.cleanupExpiredSystemLogs({ now, batchSize: 10_000 }),
    ).resolves.toBe(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: telemetry.CLEANUP_BATCH_SIZE }),
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
    });
  });
});
