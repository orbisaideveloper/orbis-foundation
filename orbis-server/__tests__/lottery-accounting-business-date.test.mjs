// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { accountingBusinessDate } from "../../src/admin/models/lotteryAccountingBusinessDate.ts";

const require = createRequire(import.meta.url);
const { businessDateKey, businessDayRange } = require("../accounting-business-date.cjs");
const { createLotteryAccountingService } = require("../lottery-accounting-service.cjs");

function summaryPrisma() {
  return Object.fromEntries([
    "foundationLotterySale", "foundationLotteryPayment", "foundationLotteryStockMovement",
    "foundationLotteryStockistEntry", "foundationAccountingParty",
    "foundationLotteryEntryClearance", "foundationAccountingCorrection",
    "foundationAccountingExpenseBill", "foundationAccountingExpensePayment",
    "foundationAccountingCustomerBill", "foundationAccountingExpenseProfile",
  ].map((name) => [name, { findMany: vi.fn().mockResolvedValue([]) }]));
}

describe("Kolkata accounting boundaries", () => {
  it.each([
    ["2026-09-30T18:29:59.999Z", "2026-09-30"],
    ["2026-09-30T18:30:00.000Z", "2026-10-01"],
    ["2026-12-31T18:30:00.000Z", "2027-01-01"],
    ["2028-02-28T18:30:00.000Z", "2028-02-29"],
    ["2026-10-01", "2026-10-01"],
  ])("agrees between server and UI for %s", (timestamp, expected) => {
    expect(businessDateKey(timestamp)).toBe(expected);
    expect(accountingBusinessDate(timestamp)).toBe(expected);
  });

  it("uses midnight-to-midnight India day ranges", () => {
    const range = businessDayRange("2026-09-30T20:00:00.000Z");
    expect(range.startsAt.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(range.endsAt.toISOString()).toBe("2026-10-01T18:30:00.000Z");
    expect(accountingBusinessDate("2026-02-31")).toBe("");
  });

  it("queries the entire selected last day and rejects reversed ranges", async () => {
    const prisma = summaryPrisma();
    const service = createLotteryAccountingService({ prisma });
    await service.getVerifiedSummary({ organizationId: "org", from: "2026-10-01", to: "2026-10-01" });
    expect(prisma.foundationLotterySale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ occurredAt: {
        gte: new Date("2026-09-30T18:30:00.000Z"),
        lt: new Date("2026-10-01T18:30:00.000Z"),
      } }),
    }));
    await expect(service.getVerifiedSummary({ organizationId: "org",
      from: "2026-10-02", to: "2026-10-01" })).rejects.toMatchObject({ code: "INVALID_PERIOD_RANGE" });
    await expect(service.getVerifiedSummary({ organizationId: "org",
      from: "2026-02-31" })).rejects.toMatchObject({ code: "INVALID_DATE" });
  });

  it("preserves exact timestamp scope when the caller provides timestamps", async () => {
    const prisma = summaryPrisma();
    const service = createLotteryAccountingService({ prisma });
    const from = "2026-09-30T18:45:00.000Z", to = "2026-10-01T12:00:00.000Z";
    await service.getVerifiedSummary({ organizationId: "org", from, to });
    expect(prisma.foundationLotterySale.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ occurredAt: { gte: new Date(from), lte: new Date(to) } }),
    }));
  });

  it("creates the Indian financial year with Kolkata boundaries", async () => {
    const client = {
      foundationLotteryAccountingPeriod: { findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(async ({ data }) => ({ id: "fy", ...data })) },
      foundationLotteryAuditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = createLotteryAccountingService({ prisma: { $transaction: (fn) => fn(client) } });
    const year = await service.createFinancialYearPeriod({ organizationId: "org", financialYearStart: 2026 }, "admin");
    expect(year).toMatchObject({ label: "FY26-27", startsAt: "2026-03-31T18:30:00.000Z",
      endsAt: "2027-03-31T18:29:59.999Z" });
  });
});
