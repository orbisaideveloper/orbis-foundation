import { rupeesToPaise } from "./lotteryAccountingMoney";
import { calculateLotterySeller } from "./lotteryAccountingSellerCalculation";
import type {
  AccountingLocalSyncState,
  AccountingSellerWorkingRecord,
  AccountingSellerWorkingRow,
} from "./lotteryAccountingLocalStore";
import type {
  LotteryDraftSale,
  LotteryWorkspace,
} from "./lotteryAccountingTypes";

export interface AccountingSellerProjectionRecord {
  partyId: string;
  occurredAt: string;
  row: AccountingSellerWorkingRow;
  syncState: AccountingLocalSyncState;
  updatedAt: number;
}

function accountingDateKey(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] || "";
}

function sameSellerDay(
  record: AccountingSellerProjectionRecord,
  sale: { partyId: string; occurredAt: string },
) {
  return (
    sale.partyId === record.partyId &&
    accountingDateKey(sale.occurredAt) === accountingDateKey(record.occurredAt)
  );
}

function rowIsZero(row: AccountingSellerWorkingRow) {
  return [
    row.dispatchQuantity,
    row.morningReturnQuantity,
    row.dayReturnQuantity,
    row.eveningReturnQuantity,
    row.commissionRupees,
  ].every((value) => !value.trim() || /^0+(?:\.0+)?$/.test(value.trim()));
}

function matchesLocalRecord(
  record: AccountingSellerProjectionRecord,
  sale: { id: string; partyId: string; occurredAt: string },
) {
  return Boolean(record.row.saleId && sale.id === record.row.saleId) ||
    sameSellerDay(record, sale);
}

function projectDraft(
  workspace: LotteryWorkspace,
  record: AccountingSellerProjectionRecord,
): LotteryDraftSale | null {
  const party = workspace.parties.find(
    (candidate) =>
      candidate.id === record.partyId && candidate.partyType === "SELLER",
  );
  if (!party || rowIsZero(record.row)) return null;

  const commissionPaise = rupeesToPaise(record.row.commissionRupees) || "0";
  const calculated = calculateLotterySeller({
    dispatchQuantity: record.row.dispatchQuantity,
    morningReturnQuantity: record.row.morningReturnQuantity,
    dayReturnQuantity: record.row.dayReturnQuantity,
    eveningReturnQuantity: record.row.eveningReturnQuantity,
    ticketRatePaise: party.ticketRatePaise,
    commissionPaise,
    tdsRateBps: workspace.organization.tdsRateBps,
  });
  const occurredAt = accountingDateKey(record.occurredAt) || record.occurredAt;

  return {
    id: record.row.saleId || `local:${party.id}:${occurredAt}`,
    partyId: party.id,
    partyName: party.name,
    periodId: null,
    periodLabel: null,
    reference:
      record.row.reference || `LOCAL-${party.uniqueCode}-${occurredAt}`,
    dispatchQuantity: Number(calculated.dispatch),
    morningReturnQuantity: Number(calculated.morningReturn),
    dayReturnQuantity: Number(calculated.dayReturn),
    eveningReturnQuantity: Number(calculated.eveningReturn),
    returnQuantity: Number(calculated.totalReturn),
    netTickets: Number(calculated.netSale),
    ticketRatePaise: party.ticketRatePaise,
    grossSalesPaise: calculated.grossAmountPaise.toString(),
    commissionRateBps: 0,
    commissionPaise: calculated.commissionPaise.toString(),
    tdsRateBps: workspace.organization.tdsRateBps,
    tdsPaise: calculated.tdsPaise.toString(),
    netPayablePaise: calculated.partyPayablePaise.toString(),
    occurredAt,
    status: "DRAFT",
    correctionOfSaleId:
      record.row.status === "POSTED" && record.row.saleId
        ? record.row.saleId
        : null,
  };
}

export function sellerWorkingRecordConfirmed(
  workspace: LotteryWorkspace,
  record: AccountingSellerWorkingRecord,
) {
  if (record.syncState !== "SYNCED" || !record.row.saleId) return false;
  return [...workspace.sales, ...workspace.draftSales].some(
    (sale) => sale.id === record.row.saleId,
  );
}

export function projectSellerWorkingRecords(
  workspace: LotteryWorkspace,
  records: ReadonlyArray<AccountingSellerProjectionRecord>,
): LotteryWorkspace {
  if (!records.length) return workspace;

  let sales = [...workspace.sales];
  let draftSales = [...workspace.draftSales];

  for (const record of [...records].sort(
    (left, right) => left.updatedAt - right.updatedAt,
  )) {
    sales = sales.filter((sale) => !matchesLocalRecord(record, sale));
    draftSales = draftSales.filter(
      (sale) => !matchesLocalRecord(record, sale),
    );
    const draft = projectDraft(workspace, record);
    if (draft) draftSales.push(draft);
  }

  return {
    ...workspace,
    sales,
    draftSales,
  };
}
