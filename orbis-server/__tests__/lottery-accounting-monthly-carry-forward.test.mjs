// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { createLotteryAccountingService } = require("../lottery-accounting-service.cjs");

function monthlyBooks() {
  let clock = new Date("2026-10-04T12:00:00.000Z"), sequence = 1;
  const profile = { id: "salary", organizationId: "org", categoryId: "wages", name: "Salary",
    status: "ACTIVE", scheduleType: "MONTHLY", usualAmountPaise: 1000000n,
    recurringStartsAt: new Date("2026-09-03T00:00:00.000Z") };
  const bills = [], payments = [{ id: "old-payment", organizationId: "org", profileId: "salary",
    totalAmountPaise: 280000n, cashPaise: 280000n, bankPaise: 0n,
    occurredAt: new Date("2026-09-04T00:00:00.000Z") }];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (key === "occurredAt") return (!value.lte || row.occurredAt <= value.lte) && (!value.lt || row.occurredAt < value.lt);
    if (value && typeof value === "object") {
      if (value.in) return value.in.includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
  const client = {
    foundationAccountingExpenseProfile: {
      findFirst: vi.fn(async () => profile),
      findMany: vi.fn(async ({ where }) => matches(profile, where) ? [profile] : []),
      update: vi.fn(async ({ data }) => Object.assign(profile, data)),
    },
    foundationAccountingExpenseCategory: { findFirst: vi.fn().mockResolvedValue({ id: "wages", status: "ACTIVE" }) },
    foundationAccountingExpenseBill: {
      findMany: vi.fn(async ({ where }) => bills.filter((row) => matches(row, where))),
      create: vi.fn(async ({ data }) => { const row = { id: `bill-${bills.length}`, ...data }; bills.push(row); return row; }),
    },
    foundationAccountingExpensePayment: {
      findMany: vi.fn(async ({ where }) => payments.filter((row) => matches(row, where))),
      create: vi.fn(async ({ data }) => { const row = { id: `pay-${payments.length}`, ...data }; payments.push(row); return row; }),
    },
    foundationAccountingCorrection: { findMany: vi.fn().mockResolvedValue([]) },
    foundationLotteryEntryClearance: { findMany: vi.fn().mockResolvedValue([]) },
    foundationLotteryPayment: { findMany: vi.fn().mockResolvedValue([
      { direction: "RECEIPT", methodSplit: { cashPaise: "10000000", bankPaise: "0" } },
    ]) },
    foundationLotteryDocumentSequence: { upsert: vi.fn(async () => ({ nextValue: ++sequence })) },
    foundationLotteryLedgerEntry: { createMany: vi.fn().mockResolvedValue({}) },
    foundationLotteryAuditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const service = createLotteryAccountingService({ prisma: { $transaction: (fn) => fn(client) }, now: () => clock });
  return { service, profile, bills, payments, client, setNow: (value) => { clock = new Date(value); } };
}

const payment = { organizationId: "org", profileId: "salary", occurredAt: "2026-10-04",
  totalAmountPaise: "1720000", cashPaise: "1720000", bankPaise: "0" };

describe("Monthly accrued expenses", () => {
  it("accepts 17200 for September arrears plus October without duplicate monthly bills", async () => {
    const books = monthlyBooks();
    await books.service.recordExpensePayment(payment, "admin");
    expect(books.bills.map((bill) => bill.billingMonth)).toEqual(["2026-09", "2026-10"]);
    expect(books.bills.reduce((sum, bill) => sum + bill.amountPaise, 0n)).toBe(2000000n);
    expect(books.payments.reduce((sum, row) => sum + row.totalAmountPaise, 0n)).toBe(2000000n);
    await expect(books.service.recordExpensePayment({ ...payment, totalAmountPaise: "1", cashPaise: "1" }, "admin"))
      .rejects.toMatchObject({ code: "INVALID_PAYMENT" });
    expect(books.bills).toHaveLength(2);
    expect(books.payments).toHaveLength(2);
  });

  it("freezes past months at the old rate and bills the next month at the new rate", async () => {
    const books = monthlyBooks();
    await books.service.updateExpenseProfile({ organizationId: "org", profileId: "salary", categoryId: "wages",
      name: "Salary", scheduleType: "MONTHLY", usualAmountPaise: "1200000" }, "admin");
    expect(books.bills.map((bill) => bill.amountPaise)).toEqual([1000000n, 1000000n]);
    books.setNow("2026-10-31T18:30:00.000Z");
    await books.service.recordExpensePayment({ ...payment, occurredAt: "2026-10-31T18:30:00.000Z" }, "admin");
    expect(books.bills.map((bill) => bill.amountPaise)).toEqual([1000000n, 1000000n, 1200000n]);
    expect(books.bills[2].occurredAt.toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });

  it("does not charge previous zero-rate months when monthly accrual is enabled", async () => {
    const books = monthlyBooks();
    books.profile.usualAmountPaise = 0n;
    const updated = await books.service.updateExpenseProfile({ organizationId: "org", profileId: "salary",
      categoryId: "wages", name: "Salary", scheduleType: "MONTHLY", usualAmountPaise: "1200000" }, "admin");
    expect(books.bills).toHaveLength(0);
    expect(updated.recurringStartsAt).toBe("2026-10-04T12:00:00.000Z");
  });

  it("uses the new financial year for an entry just after Kolkata midnight", async () => {
    const books = monthlyBooks();
    const bill = await books.service.recordExpenseBill({ organizationId: "org", profileId: "salary",
      amountPaise: "100", occurredAt: "2026-03-31T18:30:00.000Z" }, "admin");
    expect(bill.reference).toMatch(/^EXB-FY26-27-/);
  });

  it("does not accrue a profile before its starting day", async () => {
    const books = monthlyBooks();
    await expect(books.service.recordExpensePayment({ ...payment, occurredAt: "2026-09-02",
      totalAmountPaise: "100", cashPaise: "100" }, "admin")).rejects.toMatchObject({ code: "INVALID_PAYMENT" });
    expect(books.bills).toHaveLength(0);
  });
});
