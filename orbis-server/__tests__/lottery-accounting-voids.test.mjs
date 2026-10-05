// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { projectedLotteryExpenseBills } from "../../src/admin/models/lotteryAccountingExpenseBalance.ts";
import { sellerWorkingRecordVoided } from "../../src/admin/models/lotteryAccountingLocalProjection.ts";
const require = createRequire(import.meta.url);
const { createAccountingVoidService, voidedExpenseMonths } = require("../accounting-transaction-voids.cjs");
const { projectAccountingRows } = require("../lottery-accounting-corrections.cjs");
const DATE = new Date("2026-10-03T00:00:00Z");
const MAP = { foundationAccountingOrganization: "orgs", foundationLotterySale: "sales", foundationLotteryStockistEntry: "stockists",
  foundationAccountingCustomerBill: "customers", foundationAccountingExpenseBill: "bills", foundationAccountingExpensePayment: "expenses",
  foundationLotteryPayment: "payments", foundationLotterySettlement: "settlements", foundationLotteryStockMovement: "stock",
  foundationAccountingCorrection: "corrections", foundationLotteryLedgerEntry: "ledger", foundationLotteryAuditEvent: "audits" };
function match(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if (value.in) return value.in.includes(row[key]);
      return (!value.gte || new Date(row[key]) >= value.gte) && (!value.lt || new Date(row[key]) < value.lt);
    }
    return row[key] === value;
  });
}
function fixture() {
  const state = Object.fromEntries(Object.values(MAP).map((key) => [key, []]));
  state.orgs.push({ id: "org", status: "ACTIVE" });
  let sequence = 0;
  const prisma = { failLedger: false };
  for (const [name, key] of Object.entries(MAP)) {
    const rows = (where) => state[key].filter((row) => match(row, where));
    prisma[name] = {
      findMany: async ({ where } = {}) => rows(where),
      findFirst: async ({ where, orderBy } = {}) => {
        const result = rows(where); if (orderBy?.version === "desc") result.sort((a, b) => b.version - a.version);
        return result[0] || null;
      },
      create: async ({ data }) => { const row = { id: data.id || `new-${++sequence}`, createdAt: DATE, ...data }; state[key].push(row); return row; },
      createMany: async ({ data }) => { if (key === "ledger" && prisma.failLedger) throw new Error("ledger failure"); state[key].push(...data); return { count: data.length }; },
      update: async ({ where, data }) => { const row = rows(where)[0]; Object.assign(row, data); return row; },
    };
  }
  prisma.$queryRawUnsafe = async () => [];
  prisma.$transaction = async (fn) => {
    const original = structuredClone(state);
    try { return await fn(prisma); } catch (error) { Object.assign(state, original); throw error; }
  };
  const row = (id, data = {}) => ({ id, organizationId: "org", occurredAt: DATE, reference: id, ...data });
  const journal = (id, amount = 1000n) => state.ledger.push(
    row(`${id}-d`, { sourceId: id, transactionId: id, side: "DEBIT", accountCode: "PARTY_RECEIVABLE", amountPaise: amount }),
    row(`${id}-c`, { sourceId: id, transactionId: id, side: "CREDIT", accountCode: "LOTTERY_SALES", amountPaise: amount }));
  return { prisma, state, row, journal, service: createAccountingVoidService({ prisma }) };
}
async function prepare(f, type, id) {
  const input = { organizationId: "org", entityType: type, entityId: id };
  const preview = await f.service.previewAccountingVoid(input);
  return { ...input, previewToken: preview.previewToken, operationId: "operation" };
}
async function remove(f, type, id) { return f.service.voidAccountingTransaction(await prepare(f, type, id), "admin"); }

describe("Atomic transaction deletion", () => {
  it("voids the exact embedded receipt, preserves an independent payment and reverses stock/journals", async () => {
    const f = fixture(); f.state.customers.push(f.row("bill", { partyId: "party", quantity: 10n }));
    f.state.payments.push(f.row("linked", { partyId: "party", direction: "RECEIPT" }), f.row("independent", { partyId: "party", direction: "RECEIPT" }));
    f.state.audits.push(f.row("audit", { entityType: "CUSTOMER_BILL", entityId: "bill", eventType: "CUSTOMER_BILL_RECORDED", metadata: { receivedPaise: "600", paymentId: "linked" } }));
    f.journal("bill"); f.journal("linked", 600n);
    const ack = await remove(f, "CUSTOMER_BILL", "bill");
    expect(ack.effects).toMatchObject({ transactions: 2, payments: 1 });
    expect(projectAccountingRows(f.state.payments, f.state.corrections, "PAYMENT").map((r) => r.id)).toEqual(["independent"]);
    expect(f.state.customers).toHaveLength(1);
    expect(f.state.stock.at(-1)).toMatchObject({ movementType: "ADJUSTMENT", quantity: 10n });
    expect(f.state.ledger.reduce((sum, r) => sum + (r.side === "DEBIT" ? 1n : -1n) * r.amountPaise, 0n)).toBe(0n);
  });
  it("voids a seller and linked allocation while retaining separately received PWT", async () => {
    const f = fixture(); f.state.sales.push(f.row("sale", { status: "POSTED", dispatchQuantity: 10, returnQuantity: 2, netPayablePaise: -2500n }));
    f.state.payments.push(f.row("receipt", { direction: "RECEIPT", methodSplit: { pwtPaise: "600" } }));
    f.state.settlements.push(f.row("allocation", { saleId: "sale", paymentId: "receipt" })); f.journal("sale");
    await remove(f, "SELLER_SALE", "sale");
    expect(f.state.sales[0]).toMatchObject({ status: "REVERSED", netPayablePaise: -2500n });
    expect(projectAccountingRows(f.state.settlements, f.state.corrections, "SETTLEMENT")).toEqual([]);
    expect(projectAccountingRows(f.state.payments, f.state.corrections, "PAYMENT")).toHaveLength(1);
    expect(f.state.stock.at(-1).quantity).toBe(8n);
  });
  it("replays once, rejects a reused operation, and detects a changed preview", async () => {
    const f = fixture(); f.state.bills.push(f.row("bill", { amountPaise: 1000n })); f.journal("bill");
    const old = await prepare(f, "EXPENSE_BILL", "bill"); f.state.bills[0].amountPaise = 2000n;
    await expect(f.service.voidAccountingTransaction(old, "admin")).rejects.toMatchObject({ code: "VOID_CONFLICT" });
    const fresh = await prepare(f, "EXPENSE_BILL", "bill");
    const first = await f.service.voidAccountingTransaction(fresh, "admin"); const length = f.state.ledger.length;
    expect(await f.service.voidAccountingTransaction(fresh, "admin")).toEqual(first); expect(f.state.ledger).toHaveLength(length);
    await expect(f.service.voidAccountingTransaction({ ...fresh, previewToken: "changed" }, "admin")).rejects.toMatchObject({ code: "VOID_OPERATION_REUSED" });
  });
  it("rolls back all tombstones when journal writing fails", async () => {
    const f = fixture(); f.state.payments.push(f.row("payment")); f.journal("payment");
    f.state.settlements.push(f.row("allocation", { paymentId: "payment" })); f.prisma.failLedger = true;
    await expect(remove(f, "PAYMENT", "payment")).rejects.toThrow("ledger failure");
    expect(f.state.corrections).toEqual([]); expect(f.state.audits).toEqual([]); expect(f.state.ledger).toHaveLength(2);
    expect(f.state.settlements).toHaveLength(1);
  });
  it("does not regenerate a deleted recurring bill in device or server projections", async () => {
    const f = fixture(); f.state.bills.push(f.row("oct", { profileId: "salary", billingMonth: "2026-10", amountPaise: 10000n }));
    await remove(f, "EXPENSE_BILL", "oct");
    const months = voidedExpenseMonths(f.state.corrections);
    const profile = { id: "salary", scheduleType: "MONTHLY", usualAmountPaise: "10000", recurringStartsAt: "2026-10-03" };
    expect(projectedLotteryExpenseBills({ expenseProfiles: [profile], expenseBills: [], expensePayments: [], voidedExpenseMonths: months }, "2026-10-31")).toEqual([]);
    const { projectRecurringExpenseBills } = require("../accounting-expense-projection.cjs");
    expect(projectRecurringExpenseBills([profile], [], "2026-10-31", months)).toEqual([]);
    expect(f.state.bills).toHaveLength(1);
  });
  it("removes a legacy day and its exact later return, keeping another stockist's receipt", async () => {
    const f = fixture(); f.state.stock.push(f.row("receipt", { partyId: "stockist", movementType: "RECEIPT" }),
      f.row("return", { partyId: "stockist", movementType: "STOCKIST_RETURN", sourceReceiptId: "receipt", occurredAt: new Date("2026-10-04") }),
      f.row("other", { partyId: "other", movementType: "RECEIPT" }));
    await remove(f, "LEGACY_STOCKIST_DAY", "legacy:stockist:2026-10-03");
    expect(projectAccountingRows(f.state.stock, f.state.corrections, "STOCK_MOVEMENT").map((r) => r.id)).toEqual(["other"]);
  });
  it.each(["EXPENSE_PAYMENT", "PAYMENT", "STOCKIST_ENTRY", "SETTLEMENT"])("voids %s while preserving its source", async (type) => {
    const f = fixture(); const key = { EXPENSE_PAYMENT: "expenses", PAYMENT: "payments", STOCKIST_ENTRY: "stockists", SETTLEMENT: "settlements" }[type];
    f.state[key].push(f.row("source")); await remove(f, type, "source");
    expect(projectAccountingRows(f.state[key], f.state.corrections, type)).toEqual([]); expect(f.state[key]).toHaveLength(1);
  });
  it("fails closed for unlinked historical money and another organization's source", async () => {
    const f = fixture(); f.state.customers.push(f.row("bill", { quantity: 10n }));
    f.state.audits.push(f.row("audit", { entityType: "CUSTOMER_BILL", entityId: "bill", eventType: "CUSTOMER_BILL_RECORDED", metadata: { receivedPaise: "600" } }));
    await expect(remove(f, "CUSTOMER_BILL", "bill")).rejects.toMatchObject({ code: "VOID_PAYMENT_LINK_REQUIRES_REVIEW" });
    f.state.bills.push(f.row("other", { organizationId: "other" }));
    await expect(remove(f, "EXPENSE_BILL", "other")).rejects.toMatchObject({ code: "VOID_SOURCE_NOT_FOUND" });
  });
  it("blocks stale recovery despite retry time changes, but allows an explicitly new hand-entered replacement", () => {
    const workspace = { sales: [], draftSales: [], voidedTransactions: [{ entityType: "SELLER_SALE", entityId: "deleted", createdAt: "2026-10-03", previousSnapshot: { partyId: "party", occurredAt: "2026-10-03" } }] };
    const record = { partyId: "party", occurredAt: "2026-10-03", updatedAt: Date.now(), row: { partyId: "party" } };
    expect(sellerWorkingRecordVoided(workspace, record)).toBe(true);
    expect(sellerWorkingRecordVoided(workspace, { ...record, row: { ...record.row, replacesVoidId: "deleted" } })).toBe(false);
  });
  it("reverses saved voucher TDS while retaining its original signed amount", async () => {
    const f = fixture();
    const { calculateLotterySale, buildLotterySaleLedger } = require("../lottery-accounting-core.cjs");
    const calculation = calculateLotterySale({ dispatchQuantity: 10, returnQuantity: 0,
      ticketRatePaise: 200, commissionPaise: 5000, tdsRateBps: 1000 });
    f.state.sales.push(f.row("voucher", { ...calculation, status: "POSTED" }));
    f.state.ledger.push(...buildLotterySaleLedger(calculation).map((line) => f.row(`line-${line.lineNumber}`,
      { ...line, transactionId: "voucher", sourceId: "voucher", amountPaise: BigInt(line.amountPaise) })));
    await remove(f, "SELLER_SALE", "voucher");
    expect(f.state.sales[0].netPayablePaise).toBe("-2500");
    const tds = f.state.ledger.filter((line) => line.accountCode === "TDS_PAYABLE")
      .reduce((sum, line) => sum + (line.side === "CREDIT" ? 1n : -1n) * line.amountPaise, 0n);
    expect(tds).toBe(0n);
  });
  it("validates each journal, not just a combined zero difference", async () => {
    const f = fixture(); f.state.bills.push(f.row("bill"));
    f.state.ledger.push(f.row("d", { sourceId: "bill", transactionId: "wrong-debit", side: "DEBIT", amountPaise: 100n }),
      f.row("c", { sourceId: "bill", transactionId: "wrong-credit", side: "CREDIT", amountPaise: 100n }));
    await expect(prepare(f, "EXPENSE_BILL", "bill")).rejects.toMatchObject({ code: "VOID_LEDGER_NOT_BALANCED" });
    expect(f.state.corrections).toEqual([]);
  });

});
