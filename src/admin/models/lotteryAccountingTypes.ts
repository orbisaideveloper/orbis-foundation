export type LotteryPartyType =
  "STOCKIST" | "SERVICE_STOCKIST" | "SELLER" | "CUSTOMER";

export type LotteryPaymentDirection = "RECEIPT" | "PAYMENT" | "EXPENSE";

export type LotteryStockMovementType =
  "RECEIPT" | "DISPATCH" | "RETURN" | "STOCKIST_RETURN" | "ADJUSTMENT";

export interface LotteryOrganization {
  id: string;
  name: string;
  tdsRateBps: number;
  userLedgerStorage: "CLOUD" | "DEVICE";
  status: string;
  createdAt: string;
}

export interface LotteryParty {
  id: string;
  organizationId: string;
  partyType: LotteryPartyType;
  name: string;
  phone: string | null;
  uniqueCode: string;
  ticketRatePaise: string;
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
  partyId: string | null;
  sourceReceiptId?: string | null;
  returnSession?: "MORNING" | "DAY" | "EVENING" | null;
  partyName: string | null;
  movementType: LotteryStockMovementType;
  quantity: string;
  unitRatePaise: string;
  grossPurchasePaise: string;
  commissionPaise: string;
  tdsRateBps: number;
  tdsPaise: string;
  netPayablePaise: string;
  reference: string;
  occurredAt: string;
}

interface LotterySaleFields {
  id: string;
  partyId: string;
  partyName: string;
  periodId: string | null;
  periodLabel: string | null;
  reference: string;
  dispatchQuantity: number;
  morningReturnQuantity: number;
  dayReturnQuantity: number;
  eveningReturnQuantity: number;
  returnQuantity: number;
  netTickets: number;
  ticketRatePaise: string;
  grossSalesPaise: string;
  commissionRateBps: number;
  commissionPaise: string;
  tdsRateBps: number;
  tdsPaise: string;
  netPayablePaise: string;
  occurredAt: string;
}

export interface LotterySale extends LotterySaleFields {
  settledPaise: string;
  outstandingPaise: string;
  status: "POSTED";
}

export interface LotteryDraftSale extends LotterySaleFields {
  status: "DRAFT";
  correctionOfSaleId: string | null;
}

/**
 * The Daily Seller screen needs only this stable server identity after an
 * autosave. Keeping the small response shape here prevents a background save
 * from having to reload and replace the whole workspace while the Admin is
 * still typing.
 */
export type LotteryDailySellerDraftIdentity = Pick<
  LotteryDraftSale,
  "id" | "reference" | "status"
>;

export interface LotteryDailyStockistEntryIdentity {
  partyId: string;
  occurredAt: string;
}

export interface LotteryStockistEntry extends LotteryDailyStockistEntryIdentity {
  id: string;
  partyName: string;
  reference: string;
  purchaseQuantity: string;
  morningReturnQuantity: string;
  dayReturnQuantity: string;
  eveningReturnQuantity: string;
  totalReturnQuantity: string;
  netPurchaseQuantity: string;
  unitRatePaise: string;
  grossPurchasePaise: string;
  commissionPaise: string;
  tdsRateBps: number;
  tdsPaise: string;
  netPayablePaise: string;
  source: "DAILY" | "LEGACY";
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
    stockistReturned: string;
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


export interface LotteryExpenseCategory {
  id: string;
  organizationId: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LotteryExpenseProfile {
  id: string;
  organizationId: string;
  categoryId: string;
  name: string;
  usualAmountPaise: string;
  scheduleType?: "ONE_TIME" | "MONTHLY";
  recurringStartsAt?: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LotteryExpenseBill {
  id: string;
  organizationId: string;
  profileId: string;
  profileName: string;
  categoryId: string;
  categoryName: string;
  amountPaise: string;
  reference: string;
  billingMonth?: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface LotteryExpensePayment {
  id: string;
  organizationId: string;
  profileId: string;
  profileName: string;
  categoryId: string;
  categoryName: string;
  totalAmountPaise: string;
  cashPaise: string;
  bankPaise: string;
  reference: string;
  occurredAt: string;
  createdAt: string;
}

export interface LotteryCustomerBill {
  id: string;
  organizationId: string;
  partyId: string;
  partyName: string;
  quantity: string;
  unitRatePaise: string;
  amountPaise: string;
  reference: string;
  occurredAt: string;
  createdAt: string;
}

export interface LotteryWorkspace {
  organization: LotteryOrganization;
  parties: LotteryParty[];
  periods: LotteryPeriod[];
  stockMovements: LotteryStockMovement[];
  stockistEntries: LotteryStockistEntry[];
  sales: LotterySale[];
  draftSales: LotteryDraftSale[];
  payments: LotteryPayment[];
  settlements: LotterySettlement[];
  ledgerEntries: LotteryLedgerEntry[];
  auditEvents: LotteryAuditEvent[];
  expenseCategories: LotteryExpenseCategory[];
  expenseProfiles: LotteryExpenseProfile[];
  expenseBills: LotteryExpenseBill[];
  expensePayments: LotteryExpensePayment[];
  customerBills: LotteryCustomerBill[];
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
