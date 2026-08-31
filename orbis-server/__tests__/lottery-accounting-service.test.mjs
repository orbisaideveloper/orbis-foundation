// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createLotteryAccountingService,
} = require("../lottery-accounting-service.cjs");

function createPrismaMock() {
  let id = 2;
  const state = {
    organizations: [
      {
        id: "org-1",
        name: "Demo Lottery",
        status: "ACTIVE",
        tdsRateBps: 200,
      },
    ],
    parties: [
      {
        id: "party-1",
        organizationId: "org-1",
        status: "ACTIVE",
        partyType: "SELLER",
        ticketRatePaise: 1_000n,
        commissionRateBps: 500,
        tdsRateBps: 0,
      },
    ],
    periods: [],
    sequences: [],
    stocks: [],
    sales: [],
    payments: [],
    settlements: [],
    ledger: [],
    audits: [],
  };
  const created = (prefix, data) => ({
    id: `${prefix}-${id++}`,
    createdAt: new Date("2026-08-30T00:00:00Z"),
    ...data,
  });
  const within = (row, where) =>
    Object.entries(where).every(([key, value]) => {
      if (key === "occurredAt") {
        return (
          (!value.gte || row.occurredAt >= value.gte) &&
          (!value.lte || row.occurredAt <= value.lte)
        );
      }
      return row[key] === value;
    });
  const client = {
    foundationAccountingOrganization: {
      create: async ({ data }) => {
        const row = created("org", data);
        state.organizations.push(row);
        return row;
      },
      findFirst: async ({ where }) =>
        state.organizations.find((row) => within(row, where)) || null,
      findMany: async ({ where = {} }) =>
        state.organizations.filter((row) => within(row, where)),
      update: async ({ where, data }) => {
        const row = state.organizations.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    foundationAccountingParty: {
      findFirst: async ({ where }) =>
        state.parties.find((row) => within(row, where)) || null,
      create: async ({ data }) => {
        const row = created("party", data);
        state.parties.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.parties.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      findMany: async ({ where = {} }) =>
        state.parties.filter((row) => within(row, where)),
    },
    foundationLotteryAccountingPeriod: {
      create: async ({ data }) => {
        const row = created("period", data);
        state.periods.push(row);
        return row;
      },
      findMany: async ({ where = {} }) =>
        state.periods.filter((row) => within(row, where)),
      findFirst: async ({ where }) =>
        state.periods.find((row) => within(row, where)) || null,
    },
    foundationLotteryDocumentSequence: {
      upsert: async ({ where, create, update }) => {
        const key = where.organizationId_financialYear_documentType;
        const existing = state.sequences.find(
          (row) =>
            row.organizationId === key.organizationId &&
            row.financialYear === key.financialYear &&
            row.documentType === key.documentType,
        );
        if (existing) {
          existing.nextValue += update.nextValue.increment;
          return existing;
        }
        const row = created("sequence", create);
        state.sequences.push(row);
        return row;
      },
    },
    foundationLotteryStockMovement: {
      create: async ({ data }) => {
        const row = created("stock", data);
        state.stocks.push(row);
        return row;
      },
      findMany: async ({ where }) =>
        state.stocks.filter((row) => within(row, where)),
      createMany: async ({ data }) => {
        state.stocks.push(...data.map((row) => created("stock", row)));
        return { count: data.length };
      },
    },
    foundationLotterySale: {
      create: async ({ data }) => {
        const row = created("sale", data);
        state.sales.push(row);
        return row;
      },
      findFirst: async ({ where }) =>
        state.sales.find((row) => within(row, where)) || null,
      findMany: async ({ where }) =>
        state.sales.filter((row) => within(row, where)),
      update: async ({ where, data }) => {
        const row = state.sales.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }) => {
        const index = state.sales.findIndex((item) => item.id === where.id);
        return state.sales.splice(index, 1)[0];
      },
    },
    foundationLotteryPayment: {
      create: async ({ data }) => {
        const row = created("payment", data);
        state.payments.push(row);
        return row;
      },
      findFirst: async ({ where }) =>
        state.payments.find((row) => within(row, where)) || null,
      findMany: async ({ where }) =>
        state.payments.filter((row) => within(row, where)),
    },
    foundationLotterySettlement: {
      create: async ({ data }) => {
        const row = created("settlement", data);
        state.settlements.push(row);
        return row;
      },
      aggregate: async ({ where }) => ({
        _sum: {
          amountPaise: state.settlements
            .filter((row) => within(row, where))
            .reduce((sum, row) => sum + row.amountPaise, 0n),
        },
      }),
      findMany: async ({ where = {} }) =>
        state.settlements.filter((row) => within(row, where)),
      count: async ({ where = {} }) =>
        state.settlements.filter((row) => within(row, where)).length,
    },
    foundationLotteryLedgerEntry: {
      createMany: async ({ data }) => {
        state.ledger.push(...data.map((row) => created("ledger", row)));
        return { count: data.length };
      },
      findMany: async ({ where = {} }) =>
        state.ledger.filter((row) => within(row, where)),
    },
    foundationLotteryAuditEvent: {
      create: async ({ data }) => {
        const row = created("audit", data);
        state.audits.push(row);
        return row;
      },
      findMany: async ({ where = {} }) =>
        state.audits.filter((row) => within(row, where)),
    },
  };
  return {
    ...client,
    $transaction: async (operation) => operation(client),
    state,
  };
}

const sale = {
  organizationId: "org-1",
  partyId: "party-1",
  dispatchQuantity: 100,
  morningReturnQuantity: 5,
  dayReturnQuantity: 10,
  eveningReturnQuantity: 5,
  commissionPaise: 4_000,
};

describe("Lottery Accounting Service", () => {
  it("creates the organization, scoped party and accounting period with audits", async () => {
    const prisma = createPrismaMock();
    const service = createLotteryAccountingService({ prisma });
    const organization = await service.createOrganization(
      { name: "Demo Lottery" },
      "admin-1",
    );
    const party = await service.createParty(
      {
        organizationId: organization.id,
        name: "Seller A",
        partyType: "seller",
        ticketRatePaise: 1_000,
        commissionRateBps: 500,
        tdsRateBps: 1_000,
      },
      "admin-1",
    );
    const period = await service.createPeriod(
      {
        organizationId: organization.id,
        label: "2026-08",
        startsAt: "2026-08-01",
        endsAt: "2026-08-31",
      },
      "admin-1",
    );
    const financialYear = await service.createFinancialYearPeriod(
      { organizationId: organization.id, financialYearStart: 2026 },
      "admin-1",
    );
    expect(party).toMatchObject({
      partyType: "SELLER",
      organizationId: organization.id,
    });
    expect(period).toMatchObject({ label: "2026-08", status: "OPEN" });
    expect(financialYear).toMatchObject({ label: "FY26-27", status: "OPEN" });
    expect(prisma.state.audits.map((event) => event.eventType)).toEqual([
      "ORGANIZATION_CREATED",
      "PARTY_CREATED",
      "ACCOUNTING_PERIOD_CREATED",
      "FINANCIAL_YEAR_PERIOD_CREATED",
    ]);
    await expect(
      service.createParty(
        { organizationId: organization.id, name: "X", partyType: "other" },
        "admin-1",
      ),
    ).rejects.toMatchObject({ code: "INVALID_PARTY_TYPE" });
    await expect(
      service.createPeriod(
        {
          organizationId: organization.id,
          label: "bad",
          startsAt: "2026-09-01",
          endsAt: "2026-08-01",
        },
        "admin-1",
      ),
    ).rejects.toMatchObject({ code: "INVALID_PERIOD_RANGE" });
  });

  it("posts an entry-commission timed-return sale, stock rows and balanced ledger", async () => {
    const prisma = createPrismaMock();
    const service = createLotteryAccountingService({
      prisma,
      now: () => new Date("2026-08-30T01:00:00Z"),
    });
    await service.recordStockMovement(
      { organizationId: "org-1", type: "RECEIPT", quantity: 120 },
      "admin-1",
    );
    const result = await service.recordSale(sale, "admin-1");
    expect(result.sale.reference).toBe("SAL-FY26-27-0001");
    expect(result.calculated).toMatchObject({
      morningReturnQuantity: "5",
      dayReturnQuantity: "10",
      eveningReturnQuantity: "5",
      returnQuantity: "20",
      netPayablePaise: "76080",
    });
    expect(result.ledger).toHaveLength(4);
    expect(prisma.state.sales).toHaveLength(1);
    expect(prisma.state.ledger).toHaveLength(4);
    expect(prisma.state.stocks).toHaveLength(3);
    expect(prisma.state.audits.at(-1)).toMatchObject({
      eventType: "SALE_POSTED",
      actorAdminId: "admin-1",
    });

    await expect(
      service.recordSale({ ...sale, partyId: "missing" }, "admin-1"),
    ).rejects.toMatchObject({ code: "PARTY_NOT_FOUND" });
  });

  it("uses one editable organization TDS rate for every new seller entry", async () => {
    const prisma = createPrismaMock();
    const service = createLotteryAccountingService({ prisma });
    await service.updateOrganizationTdsRate(
      { organizationId: "org-1", tdsRateBps: 500 },
      "admin-1",
    );
    const result = await service.previewSale(sale);
    expect(result.calculated).toMatchObject({
      commissionPaise: "4000",
      tdsRateBps: "500",
      tdsPaise: "200",
      netPayablePaise: "76200",
    });
    expect(prisma.state.parties[0]).toMatchObject({
      commissionRateBps: 500,
      tdsRateBps: 0,
    });
    expect(prisma.state.audits.at(-1)).toMatchObject({
      eventType: "GLOBAL_TDS_RATE_UPDATED",
      metadata: { tdsRateBps: 500 },
    });
  });

  it("keeps seller rows editable only as drafts, then posts or corrects them safely", async () => {
    const prisma = createPrismaMock();
    const service = createLotteryAccountingService({
      prisma,
      now: () => new Date("2026-08-30T01:00:00Z"),
    });
    await service.recordStockMovement(
      { organizationId: "org-1", type: "RECEIPT", quantity: 200 },
      "admin-1",
    );
    const saved = await service.createDailySellerDraft(
      {
        organizationId: "org-1",
        partyId: "party-1",
        dispatchQuantity: 100,
        morningReturnQuantity: 10,
        dayReturnQuantity: 20,
        eveningReturnQuantity: 5,
        commissionPaise: 4_000,
      },
      "admin-1",
    );
    expect(saved.sale).toMatchObject({
      reference: "SAL-FY26-27-0001",
      status: "DRAFT",
      ticketRatePaise: "1000",
      commissionRateBps: 0,
      tdsRateBps: 200,
      returnQuantity: 35,
      netPayablePaise: "61080",
    });
    const updated = await service.updateDailySellerDraft(
      {
        saleId: saved.sale.id,
        organizationId: "org-1",
        partyId: "party-1",
        dispatchQuantity: 100,
        morningReturnQuantity: 10,
        dayReturnQuantity: 10,
        eveningReturnQuantity: 5,
        commissionPaise: 4_000,
      },
      "admin-1",
    );
    expect(updated.calculated).toMatchObject({
      returnQuantity: "25",
      netTickets: "75",
      netPayablePaise: "71080",
    });
    const posted = await service.postDailySellerDraft(
      { organizationId: "org-1", saleId: saved.sale.id },
      "admin-1",
    );
    expect(posted.sale.status).toBe("POSTED");
    expect(prisma.state.stocks).toHaveLength(3);
    expect(prisma.state.ledger).toHaveLength(4);

    const corrected = await service.correctPostedSale(
      { organizationId: "org-1", saleId: posted.sale.id },
      "admin-1",
    );
    expect(
      prisma.state.sales.find((row) => row.id === posted.sale.id),
    ).toMatchObject({
      status: "REVERSED",
    });
    expect(corrected.draft).toMatchObject({
      status: "DRAFT",
      correctionOfSaleId: posted.sale.id,
      reference: "SAL-FY26-27-0002",
    });
    expect(prisma.state.stocks.at(-1)).toMatchObject({
      movementType: "ADJUSTMENT",
      quantity: 75n,
    });
  });

  it("deletes a daily seller draft before posting without changing ledger or stock", async () => {
    const prisma = createPrismaMock();
    const service = createLotteryAccountingService({ prisma });
    const saved = await service.createDailySellerDraft(sale, "admin-1");
    await service.deleteDailySellerDraft(
      { organizationId: "org-1", saleId: saved.sale.id },
      "admin-1",
    );
    expect(prisma.state.sales).toHaveLength(0);
    expect(prisma.state.stocks).toHaveLength(0);
    expect(prisma.state.ledger).toHaveLength(0);
  });

  it("records stock and split payments with balanced ledger lines", async () => {
    const prisma = createPrismaMock();
    const service = createLotteryAccountingService({ prisma });
    await service.recordStockMovement(
      {
        organizationId: "org-1",
        type: "RECEIPT",
        quantity: 120,
        reference: "STOCK-1",
      },
      "admin-1",
    );
    const result = await service.recordPayment(
      {
        organizationId: "org-1",
        partyId: "party-1",
        reference: "PAY-1",
        direction: "RECEIPT",
        totalAmountPaise: 50_000,
        methodSplit: { cashPaise: 30_000, upiPaise: 20_000 },
      },
      "admin-1",
    );
    expect(result.verifiedPayment.direction).toBe("RECEIPT");
    expect(prisma.state.stocks).toHaveLength(1);
    expect(prisma.state.ledger).toHaveLength(3);
    await expect(
      service.recordStockMovement(
        { organizationId: "org-1", type: "OTHER", quantity: 1, reference: "x" },
        "admin-1",
      ),
    ).rejects.toMatchObject({ code: "INVALID_STOCK_TYPE" });
  });

  it("allocates receipts without exceeding the sale or payment balance", async () => {
    const prisma = createPrismaMock();
    const service = createLotteryAccountingService({ prisma });
    await service.recordStockMovement(
      { organizationId: "org-1", type: "RECEIPT", quantity: 120 },
      "admin-1",
    );
    const postedSale = await service.recordSale(sale, "admin-1");
    const postedPayment = await service.recordPayment(
      {
        organizationId: "org-1",
        partyId: "party-1",
        reference: "PAY-1",
        direction: "RECEIPT",
        totalAmountPaise: 50_000,
        methodSplit: { bankPaise: 50_000 },
      },
      "admin-1",
    );
    const settlement = await service.recordSettlement(
      {
        organizationId: "org-1",
        saleId: postedSale.sale.id,
        paymentId: postedPayment.payment.id,
        amountPaise: 40_000,
      },
      "admin-1",
    );
    expect(settlement.amountPaise).toBe("40000");
    await expect(
      service.correctPostedSale(
        { organizationId: "org-1", saleId: postedSale.sale.id },
        "admin-1",
      ),
    ).rejects.toMatchObject({ code: "SALE_HAS_SETTLEMENTS" });
    await expect(
      service.recordSettlement(
        {
          organizationId: "org-1",
          saleId: postedSale.sale.id,
          paymentId: postedPayment.payment.id,
          amountPaise: 20_000,
        },
        "admin-1",
      ),
    ).rejects.toMatchObject({ code: "SETTLEMENT_EXCEEDS_BALANCE" });
    await expect(
      service.recordSettlement(
        {
          organizationId: "org-1",
          saleId: "missing",
          paymentId: postedPayment.payment.id,
          amountPaise: 1,
        },
        "admin-1",
      ),
    ).rejects.toMatchObject({ code: "SALE_NOT_FOUND" });
  });

  it("recalculates stored rows before returning verified summaries and AI insights", async () => {
    const prisma = createPrismaMock();
    const service = createLotteryAccountingService({ prisma });
    await service.recordStockMovement(
      { organizationId: "org-1", type: "RECEIPT", quantity: 120 },
      "admin-1",
    );
    await service.recordSale(sale, "admin-1");
    await service.recordPayment(
      {
        organizationId: "org-1",
        partyId: "party-1",
        reference: "PAY-1",
        direction: "RECEIPT",
        totalAmountPaise: 50_000,
        methodSplit: { cashPaise: 50_000 },
      },
      "admin-1",
    );
    const result = await service.analyzeVerifiedAccounting({
      organizationId: "org-1",
    });
    expect(result.summary.outstandingPaise).toBe("26080");
    expect(result.insights).toHaveLength(4);

    prisma.state.sales[0].grossSalesPaise = 1n;
    await expect(
      service.getVerifiedSummary({ organizationId: "org-1" }),
    ).rejects.toMatchObject({ code: "DATA_INTEGRITY_ERROR" });
    await expect(
      service.getVerifiedSummary({ organizationId: "org-1", from: "bad-date" }),
    ).rejects.toMatchObject({ code: "INVALID_DATE" });
  });

  it("returns an Admin workspace with live records, ledger and verified insight inputs", async () => {
    const prisma = createPrismaMock();
    const service = createLotteryAccountingService({ prisma });
    const organization = await service.createOrganization(
      { name: "Demo Lottery" },
      "admin-1",
    );
    const party = await service.createParty(
      {
        organizationId: organization.id,
        name: "Seller A",
        partyType: "SELLER",
        ticketRatePaise: 1_000,
        commissionRateBps: 500,
        tdsRateBps: 1_000,
      },
      "admin-1",
    );
    await service.recordStockMovement(
      {
        organizationId: organization.id,
        type: "RECEIPT",
        quantity: 120,
      },
      "admin-1",
    );
    const saleResult = await service.recordSale(
      { ...sale, organizationId: organization.id, partyId: party.id },
      "admin-1",
    );
    const paymentResult = await service.recordPayment(
      {
        organizationId: organization.id,
        partyId: party.id,
        reference: "PAY-WORKSPACE-1",
        direction: "RECEIPT",
        totalAmountPaise: 50_000,
        methodSplit: { cashPaise: 50_000 },
      },
      "admin-1",
    );
    await service.recordSettlement(
      {
        organizationId: organization.id,
        saleId: saleResult.sale.id,
        paymentId: paymentResult.payment.id,
        amountPaise: 40_000,
      },
      "admin-1",
    );

    const preview = await service.previewSale({
      ...sale,
      organizationId: organization.id,
      partyId: party.id,
    });
    const workspace = await service.getWorkspace({
      organizationId: organization.id,
    });

    expect(preview.calculated.netPayablePaise).toBe("76080");
    expect(preview.ledger).toHaveLength(4);
    expect(workspace.organization.name).toBe("Demo Lottery");
    expect(workspace.sales[0]).toMatchObject({
      partyName: "Seller A",
      settledPaise: "40000",
      outstandingPaise: "36080",
    });
    expect(workspace.payments[0].availablePaise).toBe("10000");
    expect(workspace.ledgerEntries).toHaveLength(6);
    expect(workspace.auditEvents).toHaveLength(6);
    expect(workspace.insights).toHaveLength(4);
  });
});
