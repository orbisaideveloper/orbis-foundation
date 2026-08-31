export type LotteryPartyType =
  "STOCKIST" | "SERVICE_STOCKIST" | "SELLER" | "CUSTOMER";

export type LotteryPaymentDirection = "RECEIPT" | "PAYMENT" | "EXPENSE";

export type LotteryStockMovementType =
  "RECEIPT" | "DISPATCH" | "RETURN" | "ADJUSTMENT";

export interface LotteryOrganization {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface LotteryParty {
  id: string;
  organizationId: string;
  partyType: LotteryPartyType;
  name: string;
  phone: string | null;
  status: string;
}

export interface LotteryPeriod {
  id: string;
  organizationId: string;
  label: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface LotteryStockMovement {
  id: string;
  movementType: LotteryStockMovementType;
  quantity: string;
  reference: string;
  occurredAt: string;
}

export interface LotterySale {
  id: string;
  partyId: string;
  partyName: string;
  periodId: string | null;
  periodLabel: string | null;
  reference: string;
  dispatchQuantity: number;
  returnQuantity: number;
  netTickets: number;
  ticketRatePaise: string;
  grossSalesPaise: string;
  commissionRateBps: number;
  commissionPaise: string;
  tdsRateBps: number;
  tdsPaise: string;
  netPayablePaise: string;
  settledPaise: string;
  outstandingPaise: string;
  occurredAt: string;
}

export interface LotteryPayment {
  id: string;
  partyId: string;
  partyName: string;
  periodId: string | null;
  periodLabel: string | null;
  direction: LotteryPaymentDirection;
  totalAmountPaise: string;
  methodSplit: Record<string, string>;
  reference: string;
  settledPaise: string;
  availablePaise: string;
  occurredAt: string;
}

export interface LotterySettlement {
  id: string;
  saleId: string;
  paymentId: string;
  amountPaise: string;
  createdAt: string;
  saleReference: string;
  paymentReference: string;
}

export interface LotteryLedgerEntry {
  id: string;
  sourceType: string;
  sourceId: string;
  lineNumber: number;
  accountCode: string;
  side: "DEBIT" | "CREDIT";
  amountPaise: string;
  occurredAt: string;
}

export interface LotteryAuditEvent {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

export interface VerifiedLotterySummary {
  verified: boolean;
  moneyUnit: "PAISE";
  salesCount: number;
  paymentCount: number;
  grossSalesPaise: string;
  commissionPaise: string;
  tdsPaise: string;
  netPayablePaise: string;
  collectedPaise: string;
  outgoingPaise: string;
  expensePaise: string;
  outstandingPaise: string;
  operatingResultPaise: string;
  netCashFlowPaise: string;
  stock: {
    received: string;
    dispatched: string;
    returned: string;
    adjustment: string;
    closing: string;
  };
  anomalies: string[];
}

export interface LotteryInsight {
  skill: string;
  status: string;
  amountPaise?: string;
  commissionPaise?: string;
  tdsPaise?: string;
  findings?: string[];
  sourceFields: string[];
}

export interface LotteryWorkspace {
  organization: LotteryOrganization;
  parties: LotteryParty[];
  periods: LotteryPeriod[];
  stockMovements: LotteryStockMovement[];
  sales: LotterySale[];
  payments: LotteryPayment[];
  settlements: LotterySettlement[];
  ledgerEntries: LotteryLedgerEntry[];
  auditEvents: LotteryAuditEvent[];
  summary: VerifiedLotterySummary;
  insights: LotteryInsight[];
}

export interface LotterySalePreview {
  calculated: {
    netTickets: string;
    grossSalesPaise: string;
    commissionPaise: string;
    tdsPaise: string;
    netPayablePaise: string;
  };
  ledger: Array<{
    lineNumber: number;
    accountCode: string;
    side: "DEBIT" | "CREDIT";
    amountPaise: string;
  }>;
}
