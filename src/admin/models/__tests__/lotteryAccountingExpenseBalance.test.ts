import { describe, expect, it } from "vitest";
import { lotteryExpenseOutstanding } from "../lotteryAccountingExpenseBalance";

type Books = Parameters<typeof lotteryExpenseOutstanding>[0];

function books(billingMonths: string[] = []): Books {
  return {
    expenseProfiles: [{ id: "salary", organizationId: "org", categoryId: "wages",
      name: "Monthly salary", usualAmountPaise: "1000000", scheduleType: "MONTHLY",
      recurringStartsAt: "2026-09-03T00:00:00.000Z", status: "ACTIVE" }],
    expenseBills: billingMonths.map((billingMonth) => ({ id: billingMonth,
      organizationId: "org", profileId: "salary", amountPaise: "1000000",
      billingMonth, reference: billingMonth, occurredAt: `${billingMonth}-03T00:00:00.000Z` })),
    expensePayments: [{ id: "part-payment", organizationId: "org", profileId: "salary",
      totalAmountPaise: "280000", cashPaise: "280000", bankPaise: "0",
      reference: "PAY-1", occurredAt: "2026-09-04T00:00:00.000Z" }],
  } as Books;
}

describe("Monthly expense balance", () => {
  it.each([
    { months: [] }, { months: ["2026-09"] },
    { months: ["2026-09", "2026-10"] },
    { months: ["2026-09", "2026-10", "2026-11"] },
  ])(
    "counts every missing month once with existing months $months", ({ months }) => {
      const workspace = books(months);
      expect(lotteryExpenseOutstanding(workspace, "salary", "2026-09-04")).toBe(720000n);
      expect(lotteryExpenseOutstanding(workspace, "salary", "2026-10-04")).toBe(1720000n);
      expect(lotteryExpenseOutstanding(workspace, "salary", "2026-11-04")).toBe(2720000n);
    },
  );

  it("keeps backdated balances before payment and before the profile starts", () => {
    const workspace = books();
    expect(lotteryExpenseOutstanding(workspace, "salary", "2026-09-02")).toBe(0n);
    expect(lotteryExpenseOutstanding(workspace, "salary", "2026-09-03")).toBe(1000000n);
  });

  it("uses historical materialized rates and the new rate only for missing months", () => {
    const workspace = books(["2026-09", "2026-10"]);
    workspace.expenseProfiles[0].usualAmountPaise = "1200000";
    expect(lotteryExpenseOutstanding(workspace, "salary", "2026-10-04")).toBe(1720000n);
    expect(lotteryExpenseOutstanding(workspace, "salary", "2026-11-04")).toBe(2920000n);
  });

  it("counts a payment on its Kolkata business date", () => {
    const workspace = books();
    workspace.expensePayments[0].occurredAt = "2026-10-31T18:30:00.000Z";
    expect(lotteryExpenseOutstanding(workspace, "salary", "2026-10-31")).toBe(2000000n);
    expect(lotteryExpenseOutstanding(workspace, "salary", "2026-11-01")).toBe(2720000n);
  });
});
