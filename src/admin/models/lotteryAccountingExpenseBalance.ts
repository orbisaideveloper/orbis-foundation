import { accountingBusinessDate } from "./lotteryAccountingBusinessDate";
import type { LotteryWorkspace } from "./lotteryAccountingTypes";

type ExpenseBooks = Pick<LotteryWorkspace, "expenseProfiles" | "expenseBills" | "expensePayments" | "voidedExpenseMonths">;

function recurringBillDay(month: string, startsOn: string): string {
  const firstDay = `${month}-01`;
  return firstDay < startsOn ? startsOn : firstDay;
}

export function projectedLotteryExpenseBills(workspace: ExpenseBooks, through: string) {
  const bills: Array<{ profileId: string; amountPaise: string; occurredAt: string }> = [...workspace.expenseBills];
  const existing = new Set([...workspace.expenseBills.filter((bill) => bill.billingMonth), ...(workspace.voidedExpenseMonths || [])]
    .map((bill) => `${bill.profileId}:${bill.billingMonth}`));
  for (const profile of workspace.expenseProfiles) {
    const startsOn = profile.recurringStartsAt ? accountingBusinessDate(profile.recurringStartsAt) : "";
    if (profile.scheduleType !== "MONTHLY" || !startsOn || startsOn > through ||
        BigInt(profile.usualAmountPaise || "0") <= 0n) continue;
    const cursor = new Date(`${startsOn.slice(0, 7)}-01T00:00:00.000Z`);
    const end = new Date(`${through.slice(0, 7)}-01T00:00:00.000Z`);
    while (cursor <= end) {
      const month = cursor.toISOString().slice(0, 7);
      if (!existing.has(`${profile.id}:${month}`)) {
        bills.push({ profileId: profile.id, amountPaise: profile.usualAmountPaise,
          occurredAt: recurringBillDay(month, startsOn) });
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return bills;
}

export function lotteryExpensePeriodCost(workspace: ExpenseBooks, from: string, to: string): bigint {
  return projectedLotteryExpenseBills(workspace, to).filter((bill) => {
    const day = accountingBusinessDate(bill.occurredAt);
    return day && day >= from && day <= to;
  }).reduce((total, bill) => total + BigInt(bill.amountPaise), 0n);
}

export function lotteryExpenseOutstanding(workspace: ExpenseBooks, profileId: string, through: string): bigint {
  const bills = projectedLotteryExpenseBills(workspace, through).filter((bill) =>
    bill.profileId === profileId && accountingBusinessDate(bill.occurredAt) <= through);
  const due = bills.reduce((total, bill) => total + BigInt(bill.amountPaise), 0n);
  const paid = workspace.expensePayments.filter((payment) =>
    payment.profileId === profileId && accountingBusinessDate(payment.occurredAt) <= through)
    .reduce((total, payment) => total + BigInt(payment.totalAmountPaise), 0n);
  return due - paid;
}
