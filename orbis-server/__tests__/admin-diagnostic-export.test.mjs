// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const DIAGNOSTIC_EVENT_TIMESTAMP = "2026-08-24T12:00:00.000Z";
const {
  FOUNDATION_COUNT_QUERIES,
  MAX_EXPORT_BYTES,
  MAX_RECENT_EVENTS,
  buildAdminDiagnosticExport,
} = require("../admin-diagnostic-export.cjs");

function fakePrisma() {
  const prisma = {};
  for (const [, clientName] of FOUNDATION_COUNT_QUERIES) {
    prisma[clientName] = { count: vi.fn().mockResolvedValue(3) };
  }
  prisma.foundationSystemLog.findMany = vi.fn().mockResolvedValue([
    {
      timestamp: DIAGNOSTIC_EVENT_TIMESTAMP,
      level: "INFO",
      source: "FOUNDATION",
      category: "FOUNDATION",
      severity: "INFO",
      message: "Foundation worker ready",
      count: 4,
      firstSeen: new Date("2026-08-24T11:59:00.000Z"),
      lastSeen: new Date(DIAGNOSTIC_EVENT_TIMESTAMP),
    },
    {
      timestamp: DIAGNOSTIC_EVENT_TIMESTAMP,
      level: "ERROR",
      source: "PROVIDER",
      category: "PROVIDER",
      severity: "ERROR",
      message: "provider output contains private answer secret-value",
      count: 1,
      firstSeen: new Date(),
      lastSeen: new Date(),
    },
  ]);
  prisma.$queryRaw = vi.fn().mockResolvedValue([{ count: "9" }]);
  return prisma;
}

describe("redacted Admin diagnostic export", () => {
  it("contains bounded safe facts and never includes prohibited injected data", async () => {
    const prisma = fakePrisma();
    const report = await buildAdminDiagnosticExport({
      prisma,
      providerManager: {
        getStatus: () => ({
          allProviders: [
            {
              name: "Bearer secret-token",
              type: "local",
              model: "environment-model-secret",
              health: { state: "AVAILABLE", error: "provider-secret" },
            },
          ],
        }),
      },
      capabilityRegistry: {
        list: () => [
          { id: "provider.chat", kind: "provider", configured: true },
        ],
      },
    });
    const serialized = JSON.stringify(report);

    expect(report.redacted).toBe(true);
    expect(report.database.foundationTableCounts).toEqual(
      expect.arrayContaining([
        { table: "FoundationSystemLog", count: 3, status: "available" },
        { table: "FoundationTimeMachine", count: 9, status: "available" },
      ]),
    );
    expect(report.telemetry.recentEvents).toHaveLength(1);
    expect(report.telemetry.summary.occurrences).toBe(4);
    expect(prisma.foundationSystemLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: MAX_RECENT_EVENTS }),
    );
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(
      MAX_EXPORT_BYTES,
    );
    for (const prohibited of [
      "secret-token",
      "environment-model-secret",
      "provider-secret",
      "private answer",
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it("queries counts only for exact Foundation-prefixed tables", async () => {
    const prisma = fakePrisma();
    await buildAdminDiagnosticExport({ prisma });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(String(prisma.$queryRaw.mock.calls[0][0])).toContain(
      'public."FoundationTimeMachine"',
    );
    expect(
      FOUNDATION_COUNT_QUERIES.every(([table]) =>
        table.startsWith("Foundation"),
      ),
    ).toBe(true);
  });

  it("returns a degraded export when one database query never settles", async () => {
    const prisma = fakePrisma();
    prisma.foundationAdminMetric.count = vi.fn(
      () => new Promise(() => undefined),
    );

    const report = await buildAdminDiagnosticExport({
      prisma,
      databaseQueryTimeoutMs: 10,
    });

    expect(report.database.state).toBe("degraded");
    expect(report.database.foundationTableCounts).toContainEqual({
      table: "FoundationAdminMetric",
      count: null,
      status: "unavailable",
    });
    expect(report.telemetry.status).toBe("available");
  });

  it("returns unavailable telemetry when its database query never settles", async () => {
    const prisma = fakePrisma();
    prisma.foundationSystemLog.findMany = vi.fn(
      () => new Promise(() => undefined),
    );

    const report = await buildAdminDiagnosticExport({
      prisma,
      databaseQueryTimeoutMs: 10,
    });

    expect(report.database.state).toBe("connected");
    expect(report.telemetry).toEqual({
      status: "unavailable",
      summary: {
        records: 0,
        occurrences: 0,
        bySeverity: {},
        byCategory: {},
      },
      recentEvents: [],
    });
  });
});
