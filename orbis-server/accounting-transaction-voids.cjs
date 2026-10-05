"use strict";
const { createHash, randomUUID } = require("node:crypto");
const { businessDateKey, businessDayRange } = require("./accounting-business-date.cjs");
const MODELS = {
  SELLER_SALE: "foundationLotterySale", STOCKIST_ENTRY: "foundationLotteryStockistEntry",
  CUSTOMER_BILL: "foundationAccountingCustomerBill", EXPENSE_BILL: "foundationAccountingExpenseBill",
  EXPENSE_PAYMENT: "foundationAccountingExpensePayment", PAYMENT: "foundationLotteryPayment",
  STOCK_MOVEMENT: "foundationLotteryStockMovement", SETTLEMENT: "foundationLotterySettlement",
};
const TABLES = {
  SELLER_SALE: "FoundationLotterySale", STOCKIST_ENTRY: "FoundationLotteryStockistEntry",
  CUSTOMER_BILL: "FoundationAccountingCustomerBill", EXPENSE_BILL: "FoundationAccountingExpenseBill",
  EXPENSE_PAYMENT: "FoundationAccountingExpensePayment", PAYMENT: "FoundationLotteryPayment",
  STOCK_MOVEMENT: "FoundationLotteryStockMovement", SETTLEMENT: "FoundationLotterySettlement",
};
function fail(code, field = "entityId") { const error = new Error(code); error.code = code; error.field = field; throw error; }
function text(value, field) { if (typeof value !== "string" || !value.trim()) fail("REQUIRED_FIELD", field); return value.trim(); }
function serialize(value) { return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function hash(value) { return createHash("sha256").update(JSON.stringify(canonical(serialize(value)))).digest("hex"); }
function scope(input) {
  const organizationId = text(input?.organizationId, "organizationId");
  const entityType = text(input?.entityType, "entityType").toUpperCase();
  const entityId = text(input?.entityId, "entityId");
  if (!(Object.hasOwn(MODELS, entityType)) && entityType !== "LEGACY_STOCKIST_DAY") fail("INVALID_VOID_TYPE", "entityType");
  return { organizationId, entityType, entityId };
}
function latestCorrection(corrections, type, id) {
  return corrections.filter((row) => row.entityType === type && row.entityId === id)
    .sort((a, b) => b.version - a.version)[0];
}
function voidedExpenseMonths(corrections) {
  return corrections.filter((row) => row.entityType === "EXPENSE_BILL" && row.replacement?.voided === true)
    .filter((row) => row.previousSnapshot?.billingMonth)
    .map((row) => ({ profileId: row.previousSnapshot.profileId, billingMonth: row.previousSnapshot.billingMonth }));
}
function wasVoided(corrections, type, id) { return latestCorrection(corrections || [], type, id)?.replacement?.voided === true; }
async function loadRoot(client, request, corrections, add) {
  const { organizationId, entityType, entityId } = request;
  if (entityType === "LEGACY_STOCKIST_DAY") {
    const match = /^legacy:(.+):(\d{4}-\d{2}-\d{2})$/.exec(entityId);
    if (!match) fail("INVALID_VOID_TYPE");
    const range = businessDayRange(new Date(`${match[2]}T00:00:00+05:30`));
    if (businessDateKey(range.startsAt) !== match[2]) fail("INVALID_DATE", "entityId");
    const daily = await client.foundationLotteryStockistEntry.findFirst({ where: { organizationId, partyId: match[1], occurredAt: { gte: range.startsAt, lt: range.endsAt } } });
    if (daily) fail("VOID_CONFLICT");
    const movements = await client.foundationLotteryStockMovement.findMany({ where: { organizationId, partyId: match[1], occurredAt: { gte: range.startsAt, lt: range.endsAt }, movementType: { in: ["RECEIPT", "STOCKIST_RETURN"] } } });
    const visible = movements.filter((row) => !wasVoided(corrections, "STOCK_MOVEMENT", row.id));
    if (!visible.length) fail("VOID_SOURCE_NOT_FOUND");
    const root = add(entityType, { id: entityId, organizationId, partyId: match[1], occurredAt: range.startsAt, reference: entityId });
    for (const movement of visible) add("STOCK_MOVEMENT", movement);
    return root;
  } else {
    const row = await client[MODELS[entityType]].findFirst({ where: { organizationId, id: entityId } });
    if (wasVoided(corrections, entityType, entityId)) fail("TRANSACTION_ALREADY_VOIDED");
    return add(entityType, row);
  }
}
async function addStockistSources(client, organizationId, root, add) {
    const range = businessDayRange(root.occurredAt);
    const sources = await client.foundationLotteryStockMovement.findMany({ where: {
      organizationId, partyId: root.partyId, occurredAt: { gte: range.startsAt, lt: range.endsAt },
      movementType: { in: ["RECEIPT", "STOCKIST_RETURN"] },
    } });
    for (const source of sources) add("STOCK_MOVEMENT", source);
}
function addSellerAdjustment(root, adjustments) {
    if (!new Set(["DRAFT", "POSTED"]).has(root.status)) fail("TRANSACTION_ALREADY_VOIDED");
    if (root.status === "POSTED") adjustments.push({ quantity: BigInt(root.dispatchQuantity) - BigInt(root.returnQuantity), occurredAt: root.occurredAt });
}
async function addCustomerSources(client, request, root, add, adjustments) {
  const { organizationId, entityType, entityId } = request;
    adjustments.push({ quantity: BigInt(root.quantity), occurredAt: root.occurredAt });
    const audit = await client.foundationLotteryAuditEvent.findFirst({ where: { organizationId, entityType, entityId, eventType: "CUSTOMER_BILL_RECORDED" }, orderBy: { createdAt: "asc" } });
    if (!audit || !/^\d+$/.test(String(audit.metadata?.receivedPaise ?? ""))) fail("VOID_PAYMENT_LINK_REQUIRES_REVIEW");
    if (BigInt(audit.metadata.receivedPaise) > 0n) {
      const paymentId = audit.metadata.paymentId;
      if (!paymentId) fail("VOID_PAYMENT_LINK_REQUIRES_REVIEW");
      const payment = await client.foundationLotteryPayment.findFirst({ where: { organizationId, id: paymentId, partyId: root.partyId, direction: "RECEIPT" } });
      add("PAYMENT", payment);
    }
}
async function addLinkedSources(client, organizationId, entities, add) {
  for (const entity of [...entities.values()]) {
    if (entity.type === "SELLER_SALE" || entity.type === "PAYMENT") {
      const field = entity.type === "SELLER_SALE" ? "saleId" : "paymentId";
      const settlements = await client.foundationLotterySettlement.findMany({ where: { organizationId, [field]: entity.id } });
      for (const row of settlements) add("SETTLEMENT", row);
    }
    if (entity.type === "STOCK_MOVEMENT" && entity.snapshot.movementType === "RECEIPT") {
      const returns = await client.foundationLotteryStockMovement.findMany({ where: { organizationId, sourceReceiptId: entity.id, movementType: "STOCKIST_RETURN" } });
      for (const row of returns) add("STOCK_MOVEMENT", row);
    }
  }
}
function validateJournals(ledger) {
  const journalBalances = new Map();
  for (const line of ledger) {
    if (!new Set(["DEBIT", "CREDIT"]).has(line.side) || BigInt(line.amountPaise) < 0n) fail("VOID_LEDGER_NOT_BALANCED");
    journalBalances.set(line.transactionId, (journalBalances.get(line.transactionId) || 0n) +
      (line.side === "DEBIT" ? 1n : -1n) * BigInt(line.amountPaise));
  }
  if ([...journalBalances.values()].some((balance) => balance !== 0n)) fail("VOID_LEDGER_NOT_BALANCED");
}
async function buildPlan(client, request) {
  const { organizationId, entityType } = request;
  const organization = await client.foundationAccountingOrganization.findFirst({ where: { id: organizationId, status: "ACTIVE" } });
  if (!organization) fail("ORGANIZATION_NOT_FOUND", "organizationId");
  const corrections = await client.foundationAccountingCorrection.findMany({ where: { organizationId } });
  const entities = new Map();
  const adjustments = [];
  const add = (type, row) => {
    if (!row || row.organizationId !== organizationId) fail("VOID_SOURCE_NOT_FOUND");
    if (wasVoided(corrections, type, row.id)) return;
    const correction = latestCorrection(corrections, type, row.id);
    const snapshot = { ...row, ...(correction?.replacement || {}) };
    entities.set(`${type}:${row.id}`, { type, id: row.id, snapshot, version: correction?.version || 0 });
    return snapshot;
  };
  const root = await loadRoot(client, request, corrections, add);
  if (!root) fail("TRANSACTION_ALREADY_VOIDED");
  if (entityType === "STOCK_MOVEMENT" && !new Set(["RECEIPT", "STOCKIST_RETURN"]).has(root.movementType)) {
    fail("VOID_LINKED_SOURCE_REQUIRED");
  }

  if (entityType === "STOCKIST_ENTRY") await addStockistSources(client, organizationId, root, add);
  if (entityType === "SELLER_SALE") addSellerAdjustment(root, adjustments);
  if (entityType === "CUSTOMER_BILL") await addCustomerSources(client, request, root, add, adjustments);
  await addLinkedSources(client, organizationId, entities, add);
  const ordered = [...entities.values()].sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
  const sources = new Set(ordered.map((row) => row.id));
  for (const correction of corrections) {
    if (entities.has(`${correction.entityType}:${correction.entityId}`)) sources.add(correction.id);
  }
  const ledger = await client.foundationLotteryLedgerEntry.findMany({ where: { organizationId, sourceId: { in: [...sources] } }, orderBy: { id: "asc" } });
  validateJournals(ledger);
  return { request, root, entities: ordered, adjustments, ledger, token: hash({ request, entities: ordered, adjustments, ledger }) };
}
function preview(plan) {
  return { organizationId: plan.request.organizationId, entityType: plan.request.entityType, entityId: plan.request.entityId,
    reference: plan.root.reference || plan.request.entityId, previewToken: plan.token,
    effects: { transactions: plan.entities.length, ledgerLines: plan.ledger.length,
      payments: plan.entities.filter((row) => row.type === "PAYMENT").length,
      settlements: plan.entities.filter((row) => row.type === "SETTLEMENT").length,
      stockAdjustments: plan.adjustments.filter((row) => row.quantity !== 0n).length } };
}
function createAccountingVoidService({ prisma }) {
  async function previewAccountingVoid(input) {
    const request = scope(input);
    return prisma.$transaction(async (client) => preview(await buildPlan(client, request)), { isolationLevel: "RepeatableRead" });
  }
  async function voidAccountingTransaction(input, actorAdminId) {
    const request = scope(input);
    const operationId = text(input?.operationId, "operationId");
    const previewToken = text(input?.previewToken, "previewToken");
    const actor = text(actorAdminId, "actorAdminId");
    const reason = typeof input?.reason === "string" ? input.reason.trim().slice(0, 500) : null;
    const requestHash = hash({ request, operationId, previewToken, reason });
    return prisma.$transaction(async (client) => {
      const replay = await client.foundationAccountingCorrection.findFirst({ where: { organizationId: request.organizationId, operationId } });
      if (replay) {
        if (replay.requestHash !== requestHash) fail("VOID_OPERATION_REUSED", "operationId");
        return replay.acknowledgement;
      }
      let plan = await buildPlan(client, request);
      for (const entity of plan.entities) {
        if (TABLES[entity.type]) await client.$queryRawUnsafe(`SELECT "id" FROM "${TABLES[entity.type]}" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`, entity.id, request.organizationId);
      }
      plan = await buildPlan(client, request);
      if (plan.token !== previewToken) fail("VOID_CONFLICT", "previewToken");
      const rootKey = `${request.entityType}:${request.entityId}`;
      const deletionId = randomUUID();
      const acknowledgement = { id: deletionId, operationId, ...preview(plan), voided: true };
      for (const [index, entity] of plan.entities.entries()) {
        const isRoot = `${entity.type}:${entity.id}` === rootKey;
        await client.foundationAccountingCorrection.create({ data: { id: isRoot ? deletionId : randomUUID(),
          organizationId: request.organizationId, entityType: entity.type, entityId: entity.id,
          version: entity.version + 1, operationId: isRoot ? operationId : `${operationId}:void:${index}`,
          requestHash, previousSnapshot: serialize(entity.snapshot), replacement: { voided: true },
          acknowledgement, reason, actorAdminId: actor } });
        if (entity.type === "SELLER_SALE") await client.foundationLotterySale.update({ where: { id: entity.id }, data: { status: "REVERSED" } });
      }
      if (plan.ledger.length) await client.foundationLotteryLedgerEntry.createMany({ data: plan.ledger.map((line, index) => ({
        organizationId: request.organizationId, transactionId: `${deletionId}:VOID`, sourceType: "ACCOUNTING_TRANSACTION_VOID_REVERSAL", sourceId: deletionId,
        lineNumber: index + 1, accountCode: line.accountCode, side: line.side === "DEBIT" ? "CREDIT" : "DEBIT",
        amountPaise: line.amountPaise, occurredAt: line.occurredAt, createdByAdminId: actor,
      })) });
      for (const [index, adjustment] of plan.adjustments.entries()) {
        if (adjustment.quantity !== 0n) await client.foundationLotteryStockMovement.create({ data: {
          organizationId: request.organizationId, movementType: "ADJUSTMENT", quantity: adjustment.quantity,
          reference: `VOID-${deletionId}-${index}`, occurredAt: adjustment.occurredAt, createdByAdminId: actor,
        } });
      }
      await client.foundationLotteryAuditEvent.create({ data: { organizationId: request.organizationId,
        eventType: "ACCOUNTING_TRANSACTION_VOIDED", entityType: request.entityType, entityId: request.entityId,
        actorAdminId: actor, metadata: serialize({ acknowledgement, entities: plan.entities, reason }) } });
      return acknowledgement;
    }, { isolationLevel: "Serializable" });
  }
  return { previewAccountingVoid, voidAccountingTransaction };
}
module.exports = { createAccountingVoidService, wasVoided, voidedExpenseMonths };
