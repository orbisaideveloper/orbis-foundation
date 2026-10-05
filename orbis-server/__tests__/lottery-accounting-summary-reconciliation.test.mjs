// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { lotteryBusinessMetrics } from "../../src/admin/models/lotteryAccountingBusinessMetrics.ts";
import { lotteryExpensePeriodCost } from "../../src/admin/models/lotteryAccountingExpenseBalance.ts";

const require = createRequire(import.meta.url);
const { calculateLotterySale, summarizeLotteryAccounting } = require("../lottery-accounting-core.cjs");
const { projectRecurringExpenseBills } = require("../accounting-expense-projection.cjs");
const sale = { dispatchQuantity: 5, morningReturnQuantity: 0, dayReturnQuantity: 0,
  eveningReturnQuantity: 0, ticketRatePaise: 100000, commissionPaise: 10000, tdsRateBps: 1000 };
const purchase = { grossPurchasePaise: "400000", commissionPaise: "20000", occurredAt: "2026-09-03" };
const expenseBill = { profileId: "salary", billingMonth: "2026-09", amountPaise: "30000", occurredAt: "2026-09-03" };
const expensePayment = { profileId: "salary", totalAmountPaise: "10000", cashPaise: "10000", bankPaise: "0", occurredAt: "2026-09-04" };
const customerBill = { amountPaise: "50000", occurredAt: "2026-09-03" };
const receipt = { direction: "RECEIPT", totalAmountPaise: "60000", methodSplit: { pwtPaise: "60000" }, occurredAt: "2026-09-03" };

describe("Backend and dashboard reconciliation", () => {
  it("matches accrual profit, separates expense payment and keeps TDS/PWT out of profit", () => {
    const summary = summarizeLotteryAccounting({ sales: [sale], stockistEntries: [purchase],
      expenseBills: [expenseBill], expensePayments: [expensePayment], customerBills: [customerBill], payments: [receipt] });
    const workspace = { sales: [{ ...calculateLotterySale(sale), occurredAt: "2026-09-03" }], draftSales: [],
      stockistEntries: [purchase], expenseBills: [expenseBill], expensePayments: [expensePayment],
      expenseProfiles: [], customerBills: [customerBill], payments: [receipt] };
    const ui = lotteryBusinessMetrics(workspace, "2026-09-01", "2026-09-30");
    expect(ui.profit.toString()).toBe(summary.operatingResultPaise);
    expect(summary).toMatchObject({ operatingResultPaise: "130000", expensePaise: "30000",
      paidExpensePaise: "10000", netCashFlowPaise: "-10000", pwtBalancePaise: "60000", tdsPaise: "1000" });
    expect(ui.expenses).toBe(30000n);
  });

  it("keeps held cheques and PWT separate from cash/bank/UPI flow", () => {
    const summary = summarizeLotteryAccounting({ payments: [{ direction: "RECEIPT",
      totalAmountPaise: "70000", methodSplit: { cashPaise: "10000", chequePaise: "20000", pwtPaise: "40000" } }] });
    expect(summary.netCashFlowPaise).toBe("10000");
    expect(summary.methodBalances).toMatchObject({ cashPaise: "10000", chequePaise: "20000", pwtPaise: "40000" });
    expect(summary.tdsPaise).toBe("0");
  });

  it("does not count paying an earlier expense bill as a new expense", () => {
    const summary = summarizeLotteryAccounting({ expensePayments: [expensePayment] });
    expect(summary).toMatchObject({ expensePaise: "0", operatingResultPaise: "0", netCashFlowPaise: "-10000" });
  });

  it("agrees on unmaterialized monthly costs, preserves snapshots and avoids duplicates", () => {
    const profile = { id: "salary", scheduleType: "MONTHLY", usualAmountPaise: "40000", recurringStartsAt: "2026-09-03" };
    const workspace = { expenseProfiles: [profile], expenseBills: [expenseBill], expensePayments: [] };
    const projected = projectRecurringExpenseBills([profile], [expenseBill], "2026-11-04");
    const amount = projected.reduce((sum, bill) => sum + BigInt(bill.amountPaise), 0n);
    expect(amount).toBe(110000n);
    expect(lotteryExpensePeriodCost(workspace, "2026-09-01", "2026-11-04")).toBe(amount);
    expect(lotteryExpensePeriodCost(workspace, "2026-10-01", "2026-10-31")).toBe(40000n);
    expect(projectRecurringExpenseBills([profile], projected, "2026-11-04")).toHaveLength(3);
  });

  it("keeps a signed voucher advance valid when nothing was collected", () => {
    const summary = summarizeLotteryAccounting({ sales: [{ ...sale, commissionPaise: 1000000 }] });
    expect(summary.netPayablePaise).toBe("-400000");
    expect(summary.anomalies).not.toContain("COLLECTION_EXCEEDS_NET_PAYABLE");
  });
});
