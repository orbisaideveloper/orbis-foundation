import { accountingBusinessDate } from "./lotteryAccountingBusinessDate";
import type { LotteryTdsReconciliation, LotteryWorkspace } from "./lotteryAccountingTypes";

type TdsRow = Readonly<{
  tdsPaise?: string | number | bigint;
  status?: string;
  source?: string;
}>;

// These are generated/recorded amounts, not outstanding tax after settlement.
export function reconcileLotteryTds(
  sales: readonly TdsRow[] = [],
  stockistEntries: readonly TdsRow[] = [],
): LotteryTdsReconciliation {
  const amount = (rows: readonly TdsRow[]) => rows.reduce((sum, row) => sum + BigInt(row.tdsPaise ?? 0), 0n);
  const generatedPayable = amount(sales.filter((row) => !row.status || row.status === "POSTED"));
  const recordedCredit = amount(stockistEntries.filter((row) => row.source === "DAILY"));
  const legacyUnclassified = amount(stockistEntries.filter((row) => row.source !== "DAILY"));
  return {
    generatedPayablePaise: generatedPayable.toString(),
    recordedCreditPaise: recordedCredit.toString(),
    legacyUnclassifiedPaise: legacyUnclassified.toString(),
    comparisonDifferencePaise: (generatedPayable - recordedCredit).toString(),
    settlementStatus: "NOT_RECORDED",
  };
}

export function lotteryPeriodTds(workspace: LotteryWorkspace, from: string, to: string) {
  const within = (row: { occurredAt: string }) => {
    const day = accountingBusinessDate(row.occurredAt);
    return Boolean(day && day >= from && day <= to);
  };
  return reconcileLotteryTds(workspace.sales.filter(within), workspace.stockistEntries.filter(within));
}
