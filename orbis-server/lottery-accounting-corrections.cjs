"use strict";

const { createHash, randomUUID } = require("node:crypto");

const CORRECTION_ENTITY_TYPES = new Set([
  "STOCKIST_ENTRY",
  "CUSTOMER_BILL",
  "EXPENSE_BILL",
  "EXPENSE_PAYMENT",
  "PAYMENT",
]);

const PAYMENT_METHOD_FIELDS = [
  "cashPaise",
  "bankPaise",
  "upiPaise",
  "chequePaise",
  "pwtPaise",
];

const TOTAL_AMOUNT_FIELD = "replacement.totalAmountPaise";

function correctionError(code, field, extra = {}) {
  const error = new Error(code);
  error.code = code;
  error.field = field;
  Object.assign(error, extra);
  return error;
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw correctionError("REQUIRED_FIELD", field);
  }
  return value.trim();
}

function parseCorrectionInteger(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  return null;
}

function integer(value, field, { positive = false } = {}) {
  const parsed = parseCorrectionInteger(value);
  if (parsed === null) {
    throw correctionError("INVALID_INTEGER", field);
  }
  if (parsed < 0n || (positive && parsed === 0n)) {
    throw correctionError(
      positive ? "INVALID_CORRECTION_REPLACEMENT" : "NEGATIVE_VALUE",
      field,
    );
  }
  return parsed;
}

function versionNumber(value) {
  const parsed = integer(value, "expectedVersion");
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw correctionError("INVALID_INTEGER", "expectedVersion");
  }
  return Number(parsed);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function requestHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function serialize(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
}

function entityType(value) {
  const normalized = requiredText(value, "entityType").toUpperCase();
  if (!CORRECTION_ENTITY_TYPES.has(normalized)) {
    throw correctionError("INVALID_CORRECTION_TYPE", "entityType");
  }
  return normalized;
}

function assertReplacementObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw correctionError("INVALID_CORRECTION_REPLACEMENT", "replacement");
  }
  return value;
}

function assertOnlyKeys(replacement, allowed) {
  const invalid = Object.keys(replacement).filter((key) => !allowed.has(key));
  if (invalid.length) {
    throw correctionError(
      "INVALID_CORRECTION_REPLACEMENT",
      `replacement.${invalid[0]}`,
    );
  }
}

function sameSnapshot(left, right) {
  return JSON.stringify(canonical(serialize(left))) ===
    JSON.stringify(canonical(serialize(right)));
}

function latestByEntity(corrections) {
  const index = new Map();
  for (const correction of corrections || []) {
    const key = `${correction.entityType}:${correction.entityId}`;
    const current = index.get(key);
    if (!current || correction.version > current.version) {
      index.set(key, correction);
    }
  }
  return index;
}

function projectAccountingRows(rows, corrections, type) {
  const index = latestByEntity(corrections);
  return (rows || []).map((row) => {
    const correction = index.get(`${type}:${row.id}`);
    if (!correction) {
      return {
        ...row,
        correctionVersion: 0,
        correctionId: null,
        correctedAt: null,
      };
    }
    return {
      ...row,
      ...(correction.replacement || {}),
      updatedAt: correction.createdAt,
      correctionVersion: correction.version,
      correctionId: correction.id,
      correctedAt: correction.createdAt,
    };
  });
}

function effectiveSnapshot(original, correction) {
  return correction
    ? { ...original, ...(correction.replacement || {}) }
    : { ...original };
}

function flipSide(side) {
  return side === "DEBIT" ? "CREDIT" : "DEBIT";
}

function paymentLedgerShape(row) {
  const direction = String(row.direction || "").toUpperCase();
  const transactionSide = direction === "RECEIPT" ? "DEBIT" : "CREDIT";
  const offsetSide = transactionSide === "DEBIT" ? "CREDIT" : "DEBIT";
  const split = row.methodSplit || {};
  const methodEntries = PAYMENT_METHOD_FIELDS
    .filter((field) => BigInt(split[field] || 0) > 0n)
    .map((field) => ({
      accountCode: `PAYMENT_${field.replace("Paise", "").toUpperCase()}`,
      side: transactionSide,
      amountPaise: BigInt(split[field] || 0),
    }));
  return [
    ...methodEntries,
    {
      accountCode:
        direction === "RECEIPT"
          ? "PARTY_RECEIVABLE"
          : direction === "PAYMENT"
            ? "PARTY_PAYABLE"
            : "OPERATING_EXPENSE",
      side: offsetSide,
      amountPaise: BigInt(row.totalAmountPaise),
    },
  ];
}

function correctionLedgerShape(type, row) {
  if (type === "CUSTOMER_BILL") {
    const amount = BigInt(row.amountPaise);
    return [
      { accountCode: "PARTY_RECEIVABLE", side: "DEBIT", amountPaise: amount },
      { accountCode: "LOTTERY_SALES", side: "CREDIT", amountPaise: amount },
    ];
  }
  if (type === "EXPENSE_BILL") {
    const amount = BigInt(row.amountPaise);
    return [
      { accountCode: "OPERATING_EXPENSE", side: "DEBIT", amountPaise: amount },
      { accountCode: "EXPENSE_PAYABLE", side: "CREDIT", amountPaise: amount },
    ];
  }
  if (type === "EXPENSE_PAYMENT") {
    const entries = [];
    if (BigInt(row.cashPaise || 0) > 0n) {
      entries.push({
        accountCode: "PAYMENT_CASH",
        side: "CREDIT",
        amountPaise: BigInt(row.cashPaise),
      });
    }
    if (BigInt(row.bankPaise || 0) > 0n) {
      entries.push({
        accountCode: "PAYMENT_BANK",
        side: "CREDIT",
        amountPaise: BigInt(row.bankPaise),
      });
    }
    entries.push({
      accountCode: "EXPENSE_PAYABLE",
      side: "DEBIT",
      amountPaise: BigInt(row.totalAmountPaise),
    });
    return entries;
  }
  if (type === "PAYMENT") return paymentLedgerShape(row);
  return [];
}

async function writeCorrectionLedger(
  client,
  { correctionId, organizationId, type, previous, replacement, occurredAt, actorAdminId },
) {
  const previousLines = correctionLedgerShape(type, previous);
  const replacementLines = correctionLedgerShape(type, replacement);
  const data = [
    ...previousLines.map((line, index) => ({
      organizationId,
      transactionId: `${correctionId}:REV`,
      sourceType: "ACCOUNTING_CORRECTION_REVERSAL",
      sourceId: correctionId,
      lineNumber: index + 1,
      accountCode: line.accountCode,
      side: flipSide(line.side),
      amountPaise: line.amountPaise,
      occurredAt,
      createdByAdminId: actorAdminId,
    })),
    ...replacementLines.map((line, index) => ({
      organizationId,
      transactionId: `${correctionId}:NEW`,
      sourceType: "ACCOUNTING_CORRECTION_REPLACEMENT",
      sourceId: correctionId,
      lineNumber: index + 1,
      accountCode: line.accountCode,
      side: line.side,
      amountPaise: line.amountPaise,
      occurredAt,
      createdByAdminId: actorAdminId,
    })),
  ];
  if (data.length) {
    await client.foundationLotteryLedgerEntry.createMany({ data });
  }
}

function paymentMethodBalance(payments, method) {
  let balance = 0n;
  for (const payment of payments) {
    const amount = BigInt(payment.methodSplit?.[method] || 0);
    balance += payment.direction === "RECEIPT" ? amount : -amount;
  }
  return balance;
}

async function normalizeStockistEntry(client, organizationId, original, previous, replacement) {
  assertOnlyKeys(
    replacement,
    new Set([
      "purchaseQuantity",
      "morningReturnQuantity",
      "dayReturnQuantity",
      "eveningReturnQuantity",
      "commissionPaise",
    ]),
  );
  const purchaseQuantity = integer(
    replacement.purchaseQuantity ?? previous.purchaseQuantity,
    "replacement.purchaseQuantity",
  );
  const morningReturnQuantity = integer(
    replacement.morningReturnQuantity ?? previous.morningReturnQuantity,
    "replacement.morningReturnQuantity",
  );
  const dayReturnQuantity = integer(
    replacement.dayReturnQuantity ?? previous.dayReturnQuantity,
    "replacement.dayReturnQuantity",
  );
  const eveningReturnQuantity = integer(
    replacement.eveningReturnQuantity ?? previous.eveningReturnQuantity,
    "replacement.eveningReturnQuantity",
  );
  const totalReturnQuantity =
    morningReturnQuantity + dayReturnQuantity + eveningReturnQuantity;
  const netPurchaseQuantity = purchaseQuantity - totalReturnQuantity;
  const unitRatePaise = BigInt(original.unitRatePaise);
  const commissionPaise = integer(
    replacement.commissionPaise ?? previous.commissionPaise,
    "replacement.commissionPaise",
  );
  const commissionLimit =
    netPurchaseQuantity > 0n ? netPurchaseQuantity * unitRatePaise : 0n;
  if (commissionPaise > commissionLimit) {
    throw correctionError("RATE_OUT_OF_RANGE", "replacement.commissionPaise");
  }

  const tdsRateBps = Number(original.tdsRateBps || 0);
  const tdsPaise =
    (commissionPaise * BigInt(tdsRateBps) + 5_000n) / 10_000n;
  const grossPurchasePaise = netPurchaseQuantity * unitRatePaise;
  const netPayablePaise =
    grossPurchasePaise - commissionPaise + tdsPaise;

  const [sales, stockistRows, corrections] = await Promise.all([
    client.foundationLotterySale.findMany({ where: { organizationId } }),
    client.foundationLotteryStockistEntry.findMany({ where: { organizationId } }),
    client.foundationAccountingCorrection.findMany({ where: { organizationId } }),
  ]);
  const effectiveRows = projectAccountingRows(
    stockistRows,
    corrections,
    "STOCKIST_ENTRY",
  ).filter((row) => row.id !== original.id);
  const day = new Date(original.occurredAt).toISOString().slice(0, 10);
  for (const [saleField, quantity] of [
    ["morningReturnQuantity", morningReturnQuantity],
    ["dayReturnQuantity", dayReturnQuantity],
    ["eveningReturnQuantity", eveningReturnQuantity],
  ]) {
    const sellerReturn = sales
      .filter(
        (sale) =>
          new Date(sale.occurredAt).toISOString().slice(0, 10) === day,
      )
      .reduce((total, sale) => total + BigInt(sale[saleField] || 0), 0n);
    const alreadyReturned = effectiveRows
      .filter(
        (entry) =>
          new Date(entry.occurredAt).toISOString().slice(0, 10) === day,
      )
      .reduce((total, entry) => total + BigInt(entry[saleField] || 0), 0n);
    if (quantity > sellerReturn - alreadyReturned) {
      throw correctionError(
        "RETURN_EXCEEDS_AVAILABLE_STOCK",
        `replacement.${saleField}`,
      );
    }
  }

  return serialize({
    purchaseQuantity,
    morningReturnQuantity,
    dayReturnQuantity,
    eveningReturnQuantity,
    totalReturnQuantity,
    netPurchaseQuantity,
    unitRatePaise,
    grossPurchasePaise,
    commissionPaise,
    tdsRateBps,
    tdsPaise,
    netPayablePaise,
  });
}

function normalizeCustomerBill(previous, replacement) {
  assertOnlyKeys(replacement, new Set(["quantity", "unitRatePaise"]));
  const quantity = integer(
    replacement.quantity ?? previous.quantity,
    "replacement.quantity",
    { positive: true },
  );
  const unitRatePaise = integer(
    replacement.unitRatePaise ?? previous.unitRatePaise,
    "replacement.unitRatePaise",
    { positive: true },
  );
  return serialize({
    quantity,
    unitRatePaise,
    amountPaise: quantity * unitRatePaise,
  });
}

function normalizeExpenseBill(previous, replacement) {
  assertOnlyKeys(replacement, new Set(["amountPaise"]));
  return serialize({
    amountPaise: integer(
      replacement.amountPaise ?? previous.amountPaise,
      "replacement.amountPaise",
      { positive: true },
    ),
  });
}

async function normalizeExpensePayment(
  client,
  organizationId,
  original,
  previous,
  replacement,
) {
  assertOnlyKeys(
    replacement,
    new Set(["totalAmountPaise", "cashPaise", "bankPaise"]),
  );
  const totalAmountPaise = integer(
    replacement.totalAmountPaise ?? previous.totalAmountPaise,
    TOTAL_AMOUNT_FIELD,
    { positive: true },
  );
  const cashPaise = integer(
    replacement.cashPaise ?? previous.cashPaise,
    "replacement.cashPaise",
  );
  const bankPaise = integer(
    replacement.bankPaise ?? previous.bankPaise,
    "replacement.bankPaise",
  );
  if (cashPaise + bankPaise !== totalAmountPaise) {
    throw correctionError(
      "PAYMENT_SPLIT_MISMATCH",
      TOTAL_AMOUNT_FIELD,
    );
  }

  const [bills, expensePayments, lotteryPayments, corrections] =
    await Promise.all([
      client.foundationAccountingExpenseBill.findMany({
        where: { organizationId, profileId: original.profileId },
      }),
      client.foundationAccountingExpensePayment.findMany({
        where: { organizationId, profileId: original.profileId },
      }),
      client.foundationLotteryPayment.findMany({
        where: { organizationId, status: "POSTED" },
      }),
      client.foundationAccountingCorrection.findMany({ where: { organizationId } }),
    ]);

  const occurredAt = new Date(original.occurredAt);
  const effectiveBills = projectAccountingRows(
    bills,
    corrections,
    "EXPENSE_BILL",
  ).filter((bill) => new Date(bill.occurredAt) <= occurredAt);
  const effectiveExpensePayments = projectAccountingRows(
    expensePayments,
    corrections,
    "EXPENSE_PAYMENT",
  );
  const priorProfilePayments = effectiveExpensePayments.filter(
    (payment) =>
      payment.id !== original.id &&
      new Date(payment.occurredAt) <= occurredAt,
  );
  const billed = effectiveBills.reduce(
    (total, bill) => total + BigInt(bill.amountPaise),
    0n,
  );
  const alreadyPaid = priorProfilePayments.reduce(
    (total, payment) => total + BigInt(payment.totalAmountPaise),
    0n,
  );
  if (totalAmountPaise > billed - alreadyPaid) {
    throw correctionError(
      "INVALID_PAYMENT",
      TOTAL_AMOUNT_FIELD,
    );
  }

  const effectiveLotteryPayments = projectAccountingRows(
    lotteryPayments,
    corrections,
    "PAYMENT",
  ).filter((payment) => new Date(payment.occurredAt) <= occurredAt);
  const allOtherExpensePayments = projectAccountingRows(
    await client.foundationAccountingExpensePayment.findMany({
      where: { organizationId },
    }),
    corrections,
    "EXPENSE_PAYMENT",
  ).filter(
    (payment) =>
      payment.id !== original.id &&
      new Date(payment.occurredAt) <= occurredAt,
  );
  const availableCash =
    paymentMethodBalance(effectiveLotteryPayments, "cashPaise") -
    allOtherExpensePayments.reduce(
      (total, payment) => total + BigInt(payment.cashPaise),
      0n,
    );
  const availableBank =
    paymentMethodBalance(effectiveLotteryPayments, "bankPaise") -
    allOtherExpensePayments.reduce(
      (total, payment) => total + BigInt(payment.bankPaise),
      0n,
    );
  if (cashPaise > availableCash) {
    throw correctionError("INVALID_PAYMENT", "replacement.cashPaise");
  }
  if (bankPaise > availableBank) {
    throw correctionError("INVALID_PAYMENT", "replacement.bankPaise");
  }

  return serialize({ totalAmountPaise, cashPaise, bankPaise });
}

async function assertPaymentHasNoSettlements(
  client,
  organizationId,
  paymentId,
) {
  const settlementCount = await client.foundationLotterySettlement.count({
    where: { organizationId, paymentId },
  });
  if (settlementCount > 0) {
    throw correctionError("PAYMENT_HAS_SETTLEMENTS", "entityId");
  }
}

async function normalizePayment(
  client,
  organizationId,
  original,
  previous,
  replacement,
) {
  assertOnlyKeys(replacement, new Set(["totalAmountPaise", "methodSplit"]));
  const totalAmountPaise = integer(
    replacement.totalAmountPaise ?? previous.totalAmountPaise,
    TOTAL_AMOUNT_FIELD,
    { positive: true },
  );
  const rawSplit = replacement.methodSplit ?? previous.methodSplit;
  if (!rawSplit || typeof rawSplit !== "object" || Array.isArray(rawSplit)) {
    throw correctionError(
      "INVALID_CORRECTION_REPLACEMENT",
      "replacement.methodSplit",
    );
  }
  assertOnlyKeys(rawSplit, new Set(PAYMENT_METHOD_FIELDS));
  const methodSplit = Object.fromEntries(
    PAYMENT_METHOD_FIELDS.map((field) => [
      field,
      integer(rawSplit[field] ?? 0, `replacement.methodSplit.${field}`).toString(),
    ]),
  );
  const splitTotal = Object.values(methodSplit).reduce(
    (total, amount) => total + BigInt(amount),
    0n,
  );
  if (splitTotal !== totalAmountPaise) {
    throw correctionError(
      "PAYMENT_SPLIT_MISMATCH",
      "replacement.methodSplit",
    );
  }

  await assertPaymentHasNoSettlements(client, organizationId, original.id);

  if (original.direction !== "RECEIPT") {
    const postedPaymentsQuery =
      client.foundationLotteryPayment.findMany({
        where: { organizationId, status: "POSTED" },
      });
    const correctionHistoryQuery =
      client.foundationAccountingCorrection.findMany({
        where: { organizationId },
      });
    const [payments, corrections] = await Promise.all([
      postedPaymentsQuery,
      correctionHistoryQuery,
    ]);
    const occurredAt = new Date(original.occurredAt);
    const otherEffective = projectAccountingRows(
      payments,
      corrections,
      "PAYMENT",
    ).filter(
      (payment) =>
        payment.id !== original.id &&
        new Date(payment.occurredAt) <= occurredAt,
    );
    for (const field of PAYMENT_METHOD_FIELDS) {
      const requested = BigInt(methodSplit[field] || 0);
      if (requested === 0n) continue;
      const available = paymentMethodBalance(otherEffective, field);
      if (requested > available) {
        throw correctionError(
          "INVALID_PAYMENT",
          `replacement.methodSplit.${field}`,
        );
      }
    }
  }

  return serialize({ totalAmountPaise, methodSplit });
}

async function normalizeReplacement(
  client,
  organizationId,
  type,
  original,
  previous,
  replacement,
) {
  if (type === "STOCKIST_ENTRY") {
    return normalizeStockistEntry(
      client,
      organizationId,
      original,
      previous,
      replacement,
    );
  }
  if (type === "CUSTOMER_BILL") {
    return normalizeCustomerBill(previous, replacement);
  }
  if (type === "EXPENSE_BILL") {
    return normalizeExpenseBill(previous, replacement);
  }
  if (type === "EXPENSE_PAYMENT") {
    return normalizeExpensePayment(
      client,
      organizationId,
      original,
      previous,
      replacement,
    );
  }
  return normalizePayment(
    client,
    organizationId,
    original,
    previous,
    replacement,
  );
}

function sourceModel(client, type) {
  if (type === "STOCKIST_ENTRY") return client.foundationLotteryStockistEntry;
  if (type === "CUSTOMER_BILL") return client.foundationAccountingCustomerBill;
  if (type === "EXPENSE_BILL") return client.foundationAccountingExpenseBill;
  if (type === "EXPENSE_PAYMENT") {
    return client.foundationAccountingExpensePayment;
  }
  return client.foundationLotteryPayment;
}

function createAccountingCorrectionService({ prisma }) {
  if (!prisma) throw new Error("A Prisma client is required.");

  async function correctAccountingTransaction(input, actorAdminId) {
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
    const type = entityType(input?.entityType);
    const entityId = requiredText(input?.entityId, "entityId");
    const operationId = requiredText(input?.operationId, "operationId");
    const expectedVersion = versionNumber(input?.expectedVersion);
    const replacementInput = assertReplacementObject(input?.replacement);
    const reason =
      typeof input?.reason === "string" && input.reason.trim()
        ? input.reason.trim().slice(0, 500)
        : null;
    const hash = requestHash({
      organizationId,
      type,
      entityId,
      expectedVersion,
      replacement: replacementInput,
      reason,
    });

    return prisma.$transaction(async (client) => {
      const organization =
        await client.foundationAccountingOrganization.findFirst({
          where: { id: organizationId, status: "ACTIVE" },
        });
      if (!organization) {
        throw correctionError("ORGANIZATION_NOT_FOUND", "organizationId");
      }

      const replay =
        await client.foundationAccountingCorrection.findFirst({
          where: { organizationId, operationId },
        });
      if (replay) {
        if (replay.requestHash !== hash) {
          throw correctionError(
            "CORRECTION_OPERATION_REUSED",
            "operationId",
          );
        }
        return serialize(replay.acknowledgement);
      }

      const original = await sourceModel(client, type).findFirst({
        where: { id: entityId, organizationId },
      });
      if (!original) {
        throw correctionError("CORRECTION_SOURCE_NOT_FOUND", "entityId");
      }

      const latest =
        await client.foundationAccountingCorrection.findFirst({
          where: { organizationId, entityType: type, entityId },
          orderBy: { version: "desc" },
        });
      const currentVersion = latest?.version || 0;
      if (expectedVersion !== currentVersion) {
        throw correctionError("CORRECTION_CONFLICT", "expectedVersion", {
          currentVersion,
        });
      }

      const previous = effectiveSnapshot(original, latest);
      const replacement = await normalizeReplacement(
        client,
        organizationId,
        type,
        original,
        previous,
        replacementInput,
      );
      const effectiveReplacement = { ...previous, ...replacement };
      if (sameSnapshot(previous, effectiveReplacement)) {
        throw correctionError("CORRECTION_NO_CHANGE", "replacement");
      }

      const correctionId = randomUUID();
      const version = currentVersion + 1;
      const acknowledgement = {
        correctionId,
        entityType: type,
        entityId,
        version,
        operationId,
      };
      const correction =
        await client.foundationAccountingCorrection.create({
          data: {
            id: correctionId,
            organizationId,
            entityType: type,
            entityId,
            version,
            operationId,
            requestHash: hash,
            previousSnapshot: serialize(previous),
            replacement: serialize(replacement),
            acknowledgement,
            reason,
            actorAdminId,
          },
        });

      await writeCorrectionLedger(client, {
        correctionId,
        organizationId,
        type,
        previous,
        replacement: effectiveReplacement,
        occurredAt: original.occurredAt,
        actorAdminId,
      });

      if (type === "CUSTOMER_BILL") {
        const oldQuantity = BigInt(previous.quantity);
        const newQuantity = BigInt(effectiveReplacement.quantity);
        const adjustment = oldQuantity - newQuantity;
        if (adjustment !== 0n) {
          await client.foundationLotteryStockMovement.create({
            data: {
              organizationId,
              movementType: "ADJUSTMENT",
              quantity: adjustment,
              reference: `COR-${correctionId}`,
              occurredAt: original.occurredAt,
              createdByAdminId: actorAdminId,
            },
          });
        }
      }

      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "ACCOUNTING_TRANSACTION_CORRECTED",
          entityType: type,
          entityId,
          actorAdminId,
          metadata: {
            correctionId,
            version,
            operationId,
            previous: serialize(previous),
            replacement: serialize(effectiveReplacement),
            reason,
          },
        },
      });

      return serialize(correction.acknowledgement);
    });
  }

  return { correctAccountingTransaction };
}

module.exports = {
  CORRECTION_ENTITY_TYPES,
  createAccountingCorrectionService,
  projectAccountingRows,
};
