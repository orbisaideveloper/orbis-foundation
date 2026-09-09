import type { LotteryAccountingReadClient } from "./lotteryAccountingClient";
import type {
  LotteryOrganization,
  LotteryWorkspace,
} from "./lotteryAccountingTypes";

/**
 * Admin Preview/Published Live inspection intentionally uses a self-contained
 * demo dataset. This module has no authenticated Admin fetch, public-user fetch,
 * Prisma, or server dependency, so ADMIN_REAL and PUBLIC_USER rows cannot enter
 * the inspection workspace through its read path.
 */
export const ADMIN_DEMO_ORGANIZATION_ID = "admin-demo-lottery";

const ADMIN_DEMO_SELLER_ID = "admin-demo-seller";
const ADMIN_DEMO_SELLER_NAME = "Demo Seller";
const ADMIN_DEMO_PERIOD_ID = "admin-demo-period";
const ADMIN_DEMO_PERIOD_LABEL = "September 2026";
const ADMIN_DEMO_OCCURRED_AT = "2026-09-08T00:00:00.000Z";
const ADMIN_DEMO_SALE_ID = "admin-demo-sale";
const ADMIN_DEMO_PAYMENT_ID = "admin-demo-payment";

const DEMO_ORGANIZATION: LotteryOrganization = {
  id: ADMIN_DEMO_ORGANIZATION_ID,
  name: "ORBiS Demo Lottery",
  tdsRateBps: 200,
  userLedgerStorage: "DEVICE",
  status: "ACTIVE",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const DEMO_WORKSPACE: LotteryWorkspace = {
  organization: DEMO_ORGANIZATION,
  parties: [
    {
      id: "admin-demo-stockist",
      organizationId: ADMIN_DEMO_ORGANIZATION_ID,
      partyType: "STOCKIST",
      name: "Demo Stockist",
      email: null,
      phone: null,
      uniqueCode: "DEMO-STOCKIST",
      ticketRatePaise: "0",
      status: "ACTIVE",
    },
    {
      id: ADMIN_DEMO_SELLER_ID,
      organizationId: ADMIN_DEMO_ORGANIZATION_ID,
      partyType: "SELLER",
      name: ADMIN_DEMO_SELLER_NAME,
      email: null,
      phone: null,
      uniqueCode: "DEMO-SELLER",
      ticketRatePaise: "10000",
      status: "ACTIVE",
    },
    {
      id: "admin-demo-customer",
      organizationId: ADMIN_DEMO_ORGANIZATION_ID,
      partyType: "CUSTOMER",
      name: "Demo Customer",
      email: null,
      phone: null,
      uniqueCode: "DEMO-CUSTOMER",
      ticketRatePaise: "0",
      status: "ACTIVE",
    },
  ],
  periods: [
    {
      id: ADMIN_DEMO_PERIOD_ID,
      organizationId: ADMIN_DEMO_ORGANIZATION_ID,
      label: ADMIN_DEMO_PERIOD_LABEL,
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-09-30T23:59:59.999Z",
      status: "OPEN",
    },
  ],
  stockMovements: [
    {
      id: "admin-demo-receipt",
      partyId: "admin-demo-stockist",
      partyName: "Demo Stockist",
      movementType: "RECEIPT",
      quantity: "20",
      unitRatePaise: "5000",
      grossPurchasePaise: "100000",
      commissionPaise: "0",
      tdsRateBps: 0,
      tdsPaise: "0",
      netPayablePaise: "100000",
      reference: "DEMO-REC-001",
      occurredAt: ADMIN_DEMO_OCCURRED_AT,
    },
    {
      id: "admin-demo-dispatch",
      partyId: ADMIN_DEMO_SELLER_ID,
      partyName: ADMIN_DEMO_SELLER_NAME,
      movementType: "DISPATCH",
      quantity: "10",
      unitRatePaise: "0",
      grossPurchasePaise: "0",
      commissionPaise: "0",
      tdsRateBps: 0,
      tdsPaise: "0",
      netPayablePaise: "0",
      reference: "DEMO-DSP-001",
      occurredAt: ADMIN_DEMO_OCCURRED_AT,
    },
    {
      id: "admin-demo-return",
      partyId: ADMIN_DEMO_SELLER_ID,
      returnSession: "MORNING",
      partyName: ADMIN_DEMO_SELLER_NAME,
      movementType: "RETURN",
      quantity: "2",
      unitRatePaise: "0",
      grossPurchasePaise: "0",
      commissionPaise: "0",
      tdsRateBps: 0,
      tdsPaise: "0",
      netPayablePaise: "0",
      reference: "DEMO-RET-001",
      occurredAt: ADMIN_DEMO_OCCURRED_AT,
    },
  ],
  stockistEntries: [],
  sales: [
    {
      id: ADMIN_DEMO_SALE_ID,
      partyId: ADMIN_DEMO_SELLER_ID,
      partyName: ADMIN_DEMO_SELLER_NAME,
      periodId: ADMIN_DEMO_PERIOD_ID,
      periodLabel: ADMIN_DEMO_PERIOD_LABEL,
      reference: "DEMO-SAL-001",
      dispatchQuantity: 10,
      morningReturnQuantity: 2,
      dayReturnQuantity: 0,
      eveningReturnQuantity: 0,
      returnQuantity: 2,
      netTickets: 8,
      ticketRatePaise: "10000",
      grossSalesPaise: "80000",
      commissionRateBps: 0,
      commissionPaise: "100",
      tdsRateBps: 200,
      tdsPaise: "2",
      netPayablePaise: "79902",
      occurredAt: ADMIN_DEMO_OCCURRED_AT,
      settledPaise: "30000",
      outstandingPaise: "49902",
      status: "POSTED",
    },
  ],
  draftSales: [],
  payments: [
    {
      id: ADMIN_DEMO_PAYMENT_ID,
      partyId: ADMIN_DEMO_SELLER_ID,
      partyName: ADMIN_DEMO_SELLER_NAME,
      periodId: ADMIN_DEMO_PERIOD_ID,
      periodLabel: ADMIN_DEMO_PERIOD_LABEL,
      direction: "RECEIPT",
      totalAmountPaise: "30000",
      methodSplit: { cashPaise: "30000" },
      reference: "DEMO-PAY-001",
      settledPaise: "30000",
      availablePaise: "0",
      occurredAt: ADMIN_DEMO_OCCURRED_AT,
    },
  ],
  settlements: [
    {
      id: "admin-demo-settlement",
      saleId: ADMIN_DEMO_SALE_ID,
      paymentId: ADMIN_DEMO_PAYMENT_ID,
      amountPaise: "30000",
      createdAt: "2026-09-08T01:00:00.000Z",
      saleReference: "DEMO-SAL-001",
      paymentReference: "DEMO-PAY-001",
    },
  ],
  ledgerEntries: [
    {
      id: "admin-demo-ledger-1",
      sourceType: "SALE",
      sourceId: ADMIN_DEMO_SALE_ID,
      lineNumber: 1,
      accountCode: "SELLER_RECEIVABLE",
      side: "DEBIT",
      amountPaise: "79902",
      occurredAt: ADMIN_DEMO_OCCURRED_AT,
    },
    {
      id: "admin-demo-ledger-2",
      sourceType: "SALE",
      sourceId: ADMIN_DEMO_SALE_ID,
      lineNumber: 2,
      accountCode: "SALES",
      side: "CREDIT",
      amountPaise: "80000",
      occurredAt: ADMIN_DEMO_OCCURRED_AT,
    },
    {
      id: "admin-demo-ledger-3",
      sourceType: "SALE",
      sourceId: ADMIN_DEMO_SALE_ID,
      lineNumber: 3,
      accountCode: "COMMISSION",
      side: "DEBIT",
      amountPaise: "100",
      occurredAt: ADMIN_DEMO_OCCURRED_AT,
    },
    {
      id: "admin-demo-ledger-4",
      sourceType: "SALE",
      sourceId: ADMIN_DEMO_SALE_ID,
      lineNumber: 4,
      accountCode: "TDS",
      side: "CREDIT",
      amountPaise: "2",
      occurredAt: ADMIN_DEMO_OCCURRED_AT,
    },
    {
      id: "admin-demo-ledger-5",
      sourceType: "PAYMENT",
      sourceId: ADMIN_DEMO_PAYMENT_ID,
      lineNumber: 1,
      accountCode: "CASH",
      side: "DEBIT",
      amountPaise: "30000",
      occurredAt: ADMIN_DEMO_OCCURRED_AT,
    },
    {
      id: "admin-demo-ledger-6",
      sourceType: "PAYMENT",
      sourceId: ADMIN_DEMO_PAYMENT_ID,
      lineNumber: 2,
      accountCode: "SELLER_RECEIVABLE",
      side: "CREDIT",
      amountPaise: "30000",
      occurredAt: ADMIN_DEMO_OCCURRED_AT,
    },
  ],
  auditEvents: [
    {
      id: "admin-demo-audit",
      eventType: "DEMO_DATA_LOADED",
      entityType: "ORGANIZATION",
      entityId: ADMIN_DEMO_ORGANIZATION_ID,
      createdAt: ADMIN_DEMO_OCCURRED_AT,
    },
  ],
  expenseCategories: [],
  expenseProfiles: [],
  expenseBills: [],
  expensePayments: [],
  customerBills: [],
  summary: {
    verified: true,
    moneyUnit: "PAISE",
    salesCount: 1,
    paymentCount: 1,
    grossSalesPaise: "80000",
    commissionPaise: "100",
    tdsPaise: "2",
    netPayablePaise: "79902",
    collectedPaise: "30000",
    outgoingPaise: "0",
    expensePaise: "0",
    outstandingPaise: "49902",
    operatingResultPaise: "79900",
    netCashFlowPaise: "30000",
    stock: {
      received: "20",
      dispatched: "10",
      returned: "2",
      stockistReturned: "0",
      adjustment: "0",
      closing: "12",
    },
    anomalies: [],
  },
  insights: [
    {
      skill: "demo-reconciliation",
      status: "VERIFIED",
      amountPaise: "49902",
      sourceFields: ["sales", "payments", "settlements"],
    },
  ],
};

function cloneDemo<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const lotteryAccountingDemoClient: LotteryAccountingReadClient = {
  async listOrganizations() {
    return cloneDemo([DEMO_ORGANIZATION]);
  },
  async loadWorkspace(organizationId) {
    if (organizationId !== ADMIN_DEMO_ORGANIZATION_ID) {
      throw new Error("DEMO ORGANIZATION NOT FOUND");
    }
    return cloneDemo(DEMO_WORKSPACE);
  },
};
