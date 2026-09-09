import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createAccountingCorrectionService,
  projectAccountingRows,
} = require("../lottery-accounting-corrections.cjs");

const CORRECTION_DATE = "2026-09-01T00:00:00.000Z";

function created(prefix, data, index) {
  return {
    id: data.id || `${prefix}-${index}`,
    createdAt: new Date("2026-09-09T00:00:00.000Z"),
    ...data,
  };
}

function createMock() {
  let id = 1;
  const state = {
    organizations: [{ id: "org-1", status: "ACTIVE" }],
    customerBills: [{
      id: "cus-1",
      organizationId: "org-1",
      partyId: "customer-1",
      quantity: 10n,
      unitRatePaise: 100n,
      amountPaise: 1000n,
      reference: "CUS-1",
      occurredAt: new Date(CORRECTION_DATE),
    }],
    expenseBills: [{
      id: "exb-1",
      organizationId: "org-1",
      profileId: "profile-1",
      amountPaise: 5000n,
      reference: "EXB-1",
      occurredAt: new Date(CORRECTION_DATE),
    }],
    expensePayments: [],
    stockistEntries: [{
      id: "stk-1",
      organizationId: "org-1",
      partyId: "stockist-1",
      purchaseQuantity: 20n,
      morningReturnQuantity: 1n,
      dayReturnQuantity: 2n,
      eveningReturnQuantity: 0n,
      totalReturnQuantity: 3n,
      netPurchaseQuantity: 17n,
      unitRatePaise: 100n,
      grossPurchasePaise: 1700n,
      commissionPaise: 100n,
      tdsRateBps: 200,
      tdsPaise: 2n,
      netPayablePaise: 1602n,
      occurredAt: new Date(CORRECTION_DATE),
    }],
    sales: [{
      id: "sale-1",
      organizationId: "org-1",
      status: "POSTED",
      morningReturnQuantity: 5,
      dayReturnQuantity: 5,
      eveningReturnQuantity: 5,
      occurredAt: new Date(CORRECTION_DATE),
    }],
    payments: [{
      id: "pay-in",
      organizationId: "org-1",
      partyId: "customer-1",
      status: "POSTED",
      direction: "RECEIPT",
      totalAmountPaise: 10000n,
      methodSplit: {
        cashPaise: "10000",
        bankPaise: "0",
        upiPaise: "0",
        chequePaise: "0",
        pwtPaise: "0",
      },
      occurredAt: new Date(CORRECTION_DATE),
    }],
    settlements: [],
    corrections: [],
    ledger: [],
    stock: [],
    audits: [],
  };
  const model = (rows) => ({
    findFirst: async ({ where, orderBy } = {}) => {
      let result = rows.filter((row) =>
        Object.entries(where || {}).every(([key, value]) => row[key] === value),
      );
      if (orderBy?.version === "desc") {
        result = result.sort((a, b) => b.version - a.version);
      }
      return result[0] || null;
    },
    findMany: async ({ where = {} } = {}) =>
      rows.filter((row) =>
        Object.entries(where).every(([key, value]) => {
          if (value && typeof value === "object" && "lte" in value) {
            return new Date(row[key]) <= new Date(value.lte);
          }
          return row[key] === value;
        }),
      ),
  });
  const client = {
    foundationAccountingOrganization: model(state.organizations),
    foundationAccountingCustomerBill: model(state.customerBills),
    foundationAccountingExpenseBill: model(state.expenseBills),
    foundationAccountingExpensePayment: model(state.expensePayments),
    foundationLotteryStockistEntry: model(state.stockistEntries),
    foundationLotterySale: model(state.sales),
    foundationLotteryPayment: model(state.payments),
    foundationLotterySettlement: {
      count: async ({ where }) =>
        state.settlements.filter((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ).length,
    },
    foundationAccountingCorrection: {
      ...model(state.corrections),
      create: async ({ data }) => {
        const row = created("correction", data, id++);
        state.corrections.push(row);
        return row;
      },
    },
    foundationLotteryLedgerEntry: {
      createMany: async ({ data }) => {
        state.ledger.push(...data);
        return { count: data.length };
      },
    },
    foundationLotteryStockMovement: {
      create: async ({ data }) => {
        const row = created("stock", data, id++);
        state.stock.push(row);
        return row;
      },
    },
    foundationLotteryAuditEvent: {
      create: async ({ data }) => {
        const row = created("audit", data, id++);
        state.audits.push(row);
        return row;
      },
    },
  };
  return {
    state,
    ...client,
    $transaction: async (callback) => callback(client),
  };
}

describe("Accounting correction contract", () => {
  it("corrects a customer bill append-only with balanced reversal/replacement and stock compensation", async () => {
    const prisma = createMock();
    const service = createAccountingCorrectionService({ prisma });
    const result = await service.correctAccountingTransaction({
      organizationId: "org-1",
      entityType: "CUSTOMER_BILL",
      entityId: "cus-1",
      expectedVersion: 0,
      operationId: "corr-customer-1",
      replacement: { quantity: "8", unitRatePaise: "100" },
      reason: "Correct entered quantity",
    }, "admin-1");

    expect(result).toMatchObject({
      entityType: "CUSTOMER_BILL",
      entityId: "cus-1",
      version: 1,
    });
    expect(prisma.state.customerBills[0].quantity).toBe(10n);
    expect(prisma.state.corrections).toHaveLength(1);
    expect(prisma.state.ledger).toHaveLength(4);
    expect(
      prisma.state.ledger
        .filter((line) => line.transactionId.endsWith(":REV"))
        .reduce((sum, line) => sum + (line.side === "DEBIT" ? line.amountPaise : -line.amountPaise), 0n),
    ).toBe(0n);
    expect(prisma.state.stock[0]).toMatchObject({
      movementType: "ADJUSTMENT",
      quantity: 2n,
    });
    expect(prisma.state.audits[0].eventType).toBe("ACCOUNTING_TRANSACTION_CORRECTED");

    const projected = projectAccountingRows(
      prisma.state.customerBills,
      prisma.state.corrections,
      "CUSTOMER_BILL",
    );
    expect(projected[0]).toMatchObject({
      quantity: "8",
      amountPaise: "800",
      correctionVersion: 1,
    });
  });

  it("replays the same operation id and rejects stale versions or reused operation payloads", async () => {
    const prisma = createMock();
    const service = createAccountingCorrectionService({ prisma });
    const request = {
      organizationId: "org-1",
      entityType: "EXPENSE_BILL",
      entityId: "exb-1",
      expectedVersion: 0,
      operationId: "corr-expense-1",
      replacement: { amountPaise: "4500" },
    };
    const first = await service.correctAccountingTransaction(request, "admin-1");
    const replay = await service.correctAccountingTransaction(request, "admin-1");
    expect(replay).toEqual(first);
    expect(prisma.state.corrections).toHaveLength(1);

    await expect(
      service.correctAccountingTransaction({
        ...request,
        replacement: { amountPaise: "4400" },
      }, "admin-1"),
    ).rejects.toMatchObject({ code: "CORRECTION_OPERATION_REUSED" });

    await expect(
      service.correctAccountingTransaction({
        ...request,
        operationId: "corr-expense-stale",
        expectedVersion: 0,
        replacement: { amountPaise: "4300" },
      }, "admin-1"),
    ).rejects.toMatchObject({
      code: "CORRECTION_CONFLICT",
      currentVersion: 1,
    });
  });

  it("recalculates stockist monetary fields without writing duplicate stock/ledger artifacts", async () => {
    const prisma = createMock();
    const service = createAccountingCorrectionService({ prisma });
    await service.correctAccountingTransaction({
      organizationId: "org-1",
      entityType: "STOCKIST_ENTRY",
      entityId: "stk-1",
      expectedVersion: 0,
      operationId: "corr-stockist-1",
      replacement: {
        purchaseQuantity: "20",
        morningReturnQuantity: "2",
        dayReturnQuantity: "2",
        eveningReturnQuantity: "0",
        commissionPaise: "100",
      },
    }, "admin-1");
    expect(prisma.state.ledger).toHaveLength(0);
    expect(prisma.state.stock).toHaveLength(0);
    const projected = projectAccountingRows(
      prisma.state.stockistEntries,
      prisma.state.corrections,
      "STOCKIST_ENTRY",
    );
    expect(projected[0]).toMatchObject({
      totalReturnQuantity: "4",
      netPurchaseQuantity: "16",
      grossPurchasePaise: "1600",
      tdsPaise: "2",
      netPayablePaise: "1502",
    });
  });

  it("blocks payment correction after settlement", async () => {
    const prisma = createMock();
    prisma.state.settlements.push({
      id: "set-1",
      organizationId: "org-1",
      paymentId: "pay-in",
    });
    const service = createAccountingCorrectionService({ prisma });
    await expect(
      service.correctAccountingTransaction({
        organizationId: "org-1",
        entityType: "PAYMENT",
        entityId: "pay-in",
        expectedVersion: 0,
        operationId: "corr-payment-1",
        replacement: {
          totalAmountPaise: "9000",
          methodSplit: { cashPaise: "9000" },
        },
      }, "admin-1"),
    ).rejects.toMatchObject({ code: "PAYMENT_HAS_SETTLEMENTS" });
  });

  it("enforces organization scoping", async () => {
    const prisma = createMock();
    const service = createAccountingCorrectionService({ prisma });
    await expect(
      service.correctAccountingTransaction({
        organizationId: "org-2",
        entityType: "CUSTOMER_BILL",
        entityId: "cus-1",
        expectedVersion: 0,
        operationId: "tenant-crossing",
        replacement: { quantity: "9", unitRatePaise: "100" },
      }, "admin-1"),
    ).rejects.toMatchObject({ code: "ORGANIZATION_NOT_FOUND" });
  });
});
