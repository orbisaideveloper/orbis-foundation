// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createLotteryAccountingService,
} = require("../lottery-accounting-service.cjs");

function createPrismaMock() {
  let id = 1;
  const state = {
    organizations: [],
    parties: [{ id: "party-1", organizationId: "org-1", status: "ACTIVE" }],
    periods: [],
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
    },
    foundationAccountingParty: {
      findFirst: async ({ where }) =>
        state.parties.find((row) => within(row, where)) || null,
      create: async ({ data }) => {
        const row = created("party", data);
        state.parties.push(row);
        return row;
      },
    },
    foundationLotteryAccountingPeriod: {
      create: async ({ data }) => {
        const row = created("period", data);
        state.periods.push(row);
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
    },
    foundationLotteryLedgerEntry: {
      createMany: async ({ data }) => {
        state.ledger.push(...data.map((row) => created("ledger", row)));
        return { count: data.length };
      },
    },
    foundationLotteryAuditEvent: {
      create: async ({ data }) => {
        const row = created("audit", data);
        state.audits.push(row);
        return row;
      },
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
  reference: "SALE-1",
  dispatchQuantity: 100,
  returnQuantity: 20,
  ticketRatePaise: 1_000,
  commissionRateBps: 500,
  tdsRateBps: 1_000,
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
    expect(party).toMatchObject({
      partyType: "SELLER",
      organizationId: organization.id,
    });
    expect(period).toMatchObject({ label: "2026-08", status: "OPEN" });
    expect(prisma.state.audits.map((event) => event.eventType)).toEqual([
      "ORGANIZATION_CREATED",
      "PARTY_CREATED",
      "ACCOUNTING_PERIOD_CREATED",
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

  it("posts a verified sale, balanced immutable ledger rows and audit metadata", async () => {
    const prisma = createPrismaMock();
    const service = createLotteryAccountingService({
      prisma,
      now: () => new Date("2026-08-30T01:00:00Z"),
    });
    const result = await service.recordSale(sale, "admin-1");
    expect(result.calculated.netPayablePaise).toBe("75600");
    expect(result.ledger).toHaveLength(4);
    expect(prisma.state.sales).toHaveLength(1);
    expect(prisma.state.ledger).toHaveLength(4);
    expect(prisma.state.audits[0]).toMatchObject({
      eventType: "SALE_POSTED",
      actorAdminId: "admin-1",
    });

    await expect(
      service.recordSale({ ...sale, partyId: "missing" }, "admin-1"),
    ).rejects.toMatchObject({ code: "PARTY_NOT_FOUND" });
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
    expect(result.summary.outstandingPaise).toBe("25600");
    expect(result.insights).toHaveLength(4);

    prisma.state.sales[0].grossSalesPaise = 1n;
    await expect(
      service.getVerifiedSummary({ organizationId: "org-1" }),
    ).rejects.toMatchObject({ code: "DATA_INTEGRITY_ERROR" });
    await expect(
      service.getVerifiedSummary({ organizationId: "org-1", from: "bad-date" }),
    ).rejects.toMatchObject({ code: "INVALID_DATE" });
  });
});
