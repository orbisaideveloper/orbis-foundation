const {
  accountingError,
  analyzeLotterySummary,
  buildLotterySaleLedger,
  calculateLotterySale,
  stockSummary,
  summarizeLotteryAccounting,
  validatePayment,
} = require("./lottery-accounting-core.cjs");
const { randomUUID } = require("node:crypto");

const DEFAULT_TDS_RATE_BPS = 200;
const UNKNOWN_PARTY_NAME = "Unknown party";
const STOCKIST_MOVEMENT_TYPES = new Set(["RECEIPT", "STOCKIST_RETURN"]);
const PAYMENT_METHOD_FIELDS = [
  "cashPaise",
  "bankPaise",
  "upiPaise",
  "chequePaise",
  "pwtPaise",
];

function paymentMethodBalance(payments, method) {
  return payments.reduce((balance, payment) => {
    const amount = BigInt(payment.methodSplit?.[method] || 0);
    return payment.direction === "RECEIPT"
      ? balance + amount
      : balance - amount;
  }, 0n);
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw accountingError("REQUIRED_FIELD", field);
  }
  return value.trim();
}

function optionalDate(value, field, fallback = new Date()) {
  const parsed = value ? new Date(value) : fallback;
  if (Number.isNaN(parsed.getTime()))
    throw accountingError("INVALID_DATE", field);
  return parsed;
}

function asBigInt(value) {
  return BigInt(value);
}

function inputBigInt(value, field) {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isSafeInteger(value))
      return BigInt(value);
    if (typeof value === "string" && /^-?\d+$/.test(value))
      return BigInt(value);
  } catch {
    // The safe domain error below intentionally hides parser details.
  }
  throw accountingError("INVALID_INTEGER", field);
}

function nonNegativeInteger(value, field) {
  const parsed = inputBigInt(value, field);
  if (parsed < 0n) throw accountingError("NEGATIVE_VALUE", field);
  return parsed;
}

function percentageRate(value, field) {
  const parsed = nonNegativeInteger(value, field);
  if (parsed > 10_000n) throw accountingError("RATE_OUT_OF_RANGE", field);
  return Number(parsed);
}

function optionalMoney(value, field) {
  if (value === undefined || value === null || value === "") return 0n;
  return nonNegativeInteger(value, field);
}

function roundedPercentage(amount, rateBps) {
  return (amount * BigInt(rateBps) + 5_000n) / 10_000n;
}

function partyProfileFromInput(input) {
  return {
    ticketRatePaise: optionalMoney(input?.ticketRatePaise, "ticketRatePaise"),
  };
}

function partyProfileFromRow(party) {
  if (
    !party ||
    party.ticketRatePaise === null ||
    party.ticketRatePaise === undefined ||
    BigInt(party.ticketRatePaise) <= 0n
  ) {
    throw accountingError("PARTY_PROFILE_REQUIRED", "partyId");
  }
  return {
    ticketRatePaise: BigInt(party.ticketRatePaise),
  };
}

function financialYearStart(occurredAt) {
  const year = occurredAt.getUTCFullYear();
  return occurredAt.getUTCMonth() >= 3 ? year : year - 1;
}

function financialYearLabel(occurredAt) {
  const start = financialYearStart(occurredAt);
  return `FY${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

function financialYearRange(startYear) {
  const parsed = Number(startYear);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 9998) {
    throw accountingError("INVALID_FINANCIAL_YEAR", "financialYearStart");
  }
  return {
    label: `FY${String(parsed).slice(-2)}-${String(parsed + 1).slice(-2)}`,
    startsAt: new Date(Date.UTC(parsed, 3, 1)),
    endsAt: new Date(Date.UTC(parsed + 1, 2, 31, 23, 59, 59, 999)),
  };
}

function optionalReference(value) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, "reference");
}

function utcDayRange(date) {
  const startsAt = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const endsAt = new Date(startsAt);
  endsAt.setUTCDate(endsAt.getUTCDate() + 1);
  return { startsAt, endsAt };
}

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function serialize(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
}

function isStockistMovement(movement) {
  return Boolean(
    movement.partyId && STOCKIST_MOVEMENT_TYPES.has(movement.movementType),
  );
}

function emptyLegacyStockistEntry(movement, key, partyName) {
  return {
    id: `legacy:${key}`,
    organizationId: movement.organizationId,
    partyId: movement.partyId,
    partyName,
    reference: movement.reference,
    purchaseQuantity: 0n,
    morningReturnQuantity: 0n,
    dayReturnQuantity: 0n,
    eveningReturnQuantity: 0n,
    totalReturnQuantity: 0n,
    netPurchaseQuantity: 0n,
    unitRatePaise: BigInt(movement.unitRatePaise || 0),
    grossPurchasePaise: 0n,
    commissionPaise: 0n,
    tdsRateBps: Number(movement.tdsRateBps || 0),
    tdsPaise: 0n,
    netPayablePaise: 0n,
    occurredAt: movement.occurredAt,
    source: "LEGACY",
  };
}

function legacyReturnField(returnSession) {
  if (returnSession === "MORNING") return "morningReturnQuantity";
  if (returnSession === "EVENING") return "eveningReturnQuantity";
  return "dayReturnQuantity";
}

function addLegacyMovement(entry, movement) {
  const quantity = BigInt(movement.quantity);
  const multiplier = movement.movementType === "RECEIPT" ? 1n : -1n;
  if (multiplier === 1n) entry.purchaseQuantity += quantity;
  else {
    entry[legacyReturnField(movement.returnSession)] += quantity;
    entry.totalReturnQuantity += quantity;
  }
  entry.grossPurchasePaise +=
    multiplier * BigInt(movement.grossPurchasePaise || 0);
  entry.commissionPaise += multiplier * BigInt(movement.commissionPaise || 0);
  entry.tdsPaise += multiplier * BigInt(movement.tdsPaise || 0);
  entry.netPayablePaise += multiplier * BigInt(movement.netPayablePaise || 0);
  entry.netPurchaseQuantity =
    entry.purchaseQuantity - entry.totalReturnQuantity;
}

function normalizeLegacyMoney(entry) {
  if (entry.commissionPaise < 0n) entry.commissionPaise = 0n;
  if (entry.tdsPaise < 0n) entry.tdsPaise = 0n;
  return entry;
}

function clearanceScopeForStockMovement(movement) {
  if (movement.movementType === "DISPATCH" || movement.movementType === "RETURN") {
    return "SELLER";
  }
  if (
    movement.movementType === "RECEIPT" ||
    movement.movementType === "STOCKIST_RETURN"
  ) {
    return "STOCKIST";
  }
  return "ALL";
}

function rowWasCleared(clearances, row, scope) {
  const rowChangedAt = new Date(row.updatedAt || row.createdAt || 0);
  return clearances.some((clearance) => {
    if (utcDateKey(clearance.occurredAt) !== utcDateKey(row.occurredAt)) {
      return false;
    }
    if (clearance.scope !== "ALL" && clearance.scope !== scope) return false;
    return rowChangedAt <= new Date(clearance.createdAt);
  });
}

function visibleAfterClearances(clearances, rows, scope) {
  return rows.filter((row) => !rowWasCleared(clearances, row, scope));
}

function createLotteryAccountingService({ prisma, now = () => new Date() }) {
  if (!prisma) throw new Error("A Prisma client is required.");

  async function listOrganizations() {
    const organizations =
      await prisma.foundationAccountingOrganization.findMany({
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      });
    return serialize(organizations);
  }

  async function ensureParty(client, organizationId, partyId) {
    const party = await client.foundationAccountingParty.findFirst({
      where: { id: partyId, organizationId, status: "ACTIVE" },
    });
    if (!party) throw accountingError("PARTY_NOT_FOUND", "partyId");
    return party;
  }

  async function ensureOrganization(client, organizationId) {
    const organization =
      await client.foundationAccountingOrganization.findFirst({
        where: { id: organizationId, status: "ACTIVE" },
      });
    if (!organization) {
      throw accountingError("ORGANIZATION_NOT_FOUND", "organizationId");
    }
    return organization;
  }

  async function ensureSellerParty(client, organizationId, partyId) {
    const party = await ensureParty(client, organizationId, partyId);
    if (party.partyType !== "SELLER") {
      throw accountingError("INVALID_SALE_PARTY", "partyId");
    }
    return party;
  }

  async function nextReference(
    client,
    { organizationId, occurredAt, documentType, reference },
  ) {
    const suppliedReference = optionalReference(reference);
    if (suppliedReference) return suppliedReference;
    const financialYear = financialYearLabel(occurredAt);
    const sequence = await client.foundationLotteryDocumentSequence.upsert({
      where: {
        organizationId_financialYear_documentType: {
          organizationId,
          financialYear,
          documentType,
        },
      },
      create: {
        organizationId,
        financialYear,
        documentType,
        nextValue: 2,
      },
      update: { nextValue: { increment: 1 } },
    });
    const number = Number(sequence.nextValue) - 1;
    return `${documentType}-${financialYear}-${String(number).padStart(4, "0")}`;
  }

  function postingContext(input) {
    return {
      organizationId: requiredText(input?.organizationId, "organizationId"),
      partyId: requiredText(input?.partyId, "partyId"),
      reference: optionalReference(input?.reference),
      occurredAt: optionalDate(input?.occurredAt, "occurredAt", now()),
      periodId: input?.periodId || null,
    };
  }

  function stockPostingContext(input) {
    return {
      organizationId: requiredText(input?.organizationId, "organizationId"),
      occurredAt: optionalDate(input?.occurredAt, "occurredAt", now()),
      reference: optionalReference(input?.reference),
    };
  }

  function saleCalculation(party, organization, input) {
    const profile = partyProfileFromRow(party);
    return calculateLotterySale({
      ...input,
      ticketRatePaise: profile.ticketRatePaise,
      tdsRateBps: percentageRate(
        organization.tdsRateBps ?? DEFAULT_TDS_RATE_BPS,
        "tdsRateBps",
      ),
    });
  }

  function effectiveStockistEntries(stockMovements, stockistEntries, parties) {
    const partyNames = new Map(parties.map((party) => [party.id, party.name]));
    const dailyKeys = new Set(
      stockistEntries.map(
        (entry) => `${entry.partyId}:${utcDateKey(entry.occurredAt)}`,
      ),
    );
    const legacy = new Map();
    for (const movement of stockMovements) {
      if (!isStockistMovement(movement)) continue;
      const day = utcDateKey(movement.occurredAt);
      const key = `${movement.partyId}:${day}`;
      if (dailyKeys.has(key)) continue;
      const entry =
        legacy.get(key) ||
        emptyLegacyStockistEntry(
          movement,
          key,
          partyNames.get(movement.partyId) || "Unknown stockist",
        );
      addLegacyMovement(entry, movement);
      legacy.set(key, entry);
    }
    return [
      ...stockistEntries.map((entry) => ({
        ...entry,
        partyName: partyNames.get(entry.partyId) || "Unknown stockist",
        source: "DAILY",
      })),
      ...[...legacy.values()].map(normalizeLegacyMoney),
    ];
  }

  async function createOrganization(input, actorAdminId) {
    const name = requiredText(input?.name, "name");
    return prisma.$transaction(async (client) => {
      const organization = await client.foundationAccountingOrganization.create(
        {
          data: {
            name,
            tdsRateBps: DEFAULT_TDS_RATE_BPS,
            status: "ACTIVE",
          },
        },
      );
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId: organization.id,
          eventType: "ORGANIZATION_CREATED",
          entityType: "ORGANIZATION",
          entityId: organization.id,
          actorAdminId,
          metadata: { name },
        },
      });
      return serialize(organization);
    });
  }

  async function createParty(input, actorAdminId) {
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
    const name = requiredText(input?.name, "name");
    const partyType = requiredText(input?.partyType, "partyType").toUpperCase();
    if (
      !new Set(["STOCKIST", "SERVICE_STOCKIST", "SELLER", "CUSTOMER"]).has(
        partyType,
      )
    ) {
      throw accountingError("INVALID_PARTY_TYPE", "partyType");
    }
    const profile = partyProfileFromInput(input);
    return prisma.$transaction(async (client) => {
      const party = await client.foundationAccountingParty.create({
        data: {
          organizationId,
          name,
          partyType,
          phone: input.phone?.trim() || null,
          uniqueCode: randomUUID(),
          ticketRatePaise: profile.ticketRatePaise,
          commissionRateBps: 0,
          tdsRateBps: 0,
          status: "ACTIVE",
        },
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "PARTY_CREATED",
          entityType: "PARTY",
          entityId: party.id,
          actorAdminId,
          metadata: {
            partyType,
            ticketRatePaise: profile.ticketRatePaise.toString(),
          },
        },
      });
      return serialize(party);
    });
  }

  async function updatePartyProfile(input, actorAdminId) {
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
    const partyId = requiredText(input?.partyId, "partyId");
    const profile = partyProfileFromInput(input);
    return prisma.$transaction(async (client) => {
      const party = await ensureParty(client, organizationId, partyId);
      const name = input?.name === undefined ? party.name : requiredText(input.name, "name");
      const updated = await client.foundationAccountingParty.update({
        where: { id: party.id },
        data: {
          name,
          phone: input.phone?.trim() || null,
          ticketRatePaise: profile.ticketRatePaise,
        },
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "PARTY_PROFILE_UPDATED",
          entityType: "PARTY",
          entityId: party.id,
          actorAdminId,
          metadata: {
            name,
            phone: input.phone?.trim() || null,
            ticketRatePaise: profile.ticketRatePaise.toString(),
          },
        },
      });
      return serialize(updated);
    });
  }

  async function updateOrganizationTdsRate(input, actorAdminId) {
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
    const tdsRateBps = percentageRate(input?.tdsRateBps, "tdsRateBps");
    return prisma.$transaction(async (client) => {
      const organization = await ensureOrganization(client, organizationId);
      const updated = await client.foundationAccountingOrganization.update({
        where: { id: organization.id },
        data: { tdsRateBps },
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "GLOBAL_TDS_RATE_UPDATED",
          entityType: "ORGANIZATION",
          entityId: organization.id,
          actorAdminId,
          metadata: { tdsRateBps },
        },
      });
      return serialize(updated);
    });
  }

  async function updateUserLedgerStorage(input, actorAdminId) {
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
    const userLedgerStorage = requiredText(
      input?.userLedgerStorage,
      "userLedgerStorage",
    ).toUpperCase();
    if (!new Set(["CLOUD", "DEVICE"]).has(userLedgerStorage)) {
      throw accountingError("INVALID_USER_LEDGER_STORAGE", "userLedgerStorage");
    }
    return prisma.$transaction(async (client) => {
      const organization = await ensureOrganization(client, organizationId);
      const updated = await client.foundationAccountingOrganization.update({
        where: { id: organization.id },
        data: { userLedgerStorage },
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "USER_LEDGER_STORAGE_UPDATED",
          entityType: "ORGANIZATION",
          entityId: organization.id,
          actorAdminId,
          metadata: { userLedgerStorage },
        },
      });
      return serialize(updated);
    });
  }


  async function ensureExpenseCategory(client, organizationId, categoryId) {
    const category = await client.foundationAccountingExpenseCategory.findFirst({
      where: { id: categoryId, organizationId, status: "ACTIVE" },
    });
    if (!category) throw accountingError("EXPENSE_CATEGORY_NOT_FOUND", "categoryId");
    return category;
  }

  async function ensureExpenseProfile(client, organizationId, profileId) {
    const profile = await client.foundationAccountingExpenseProfile.findFirst({
      where: { id: profileId, organizationId, status: "ACTIVE" },
    });
    if (!profile) throw accountingError("EXPENSE_PROFILE_NOT_FOUND", "profileId");
    return profile;
  }

  async function ensureCustomerParty(client, organizationId, partyId) {
    const party = await ensureParty(client, organizationId, partyId);
    if (party.partyType !== "CUSTOMER") {
      throw accountingError("INVALID_CUSTOMER_PARTY", "partyId");
    }
    return party;
  }

  function expenseCategoryAuditData(
    organizationId,
    eventType,
    categoryId,
    actorAdminId,
    name,
  ) {
    return {
      organizationId,
      eventType,
      entityType: "EXPENSE_CATEGORY",
      entityId: categoryId,
      actorAdminId,
      metadata: { name },
    };
  }

  async function recordExpenseProfileAudit(
    client,
    eventType,
    organizationId,
    profileId,
    actorAdminId,
    categoryId,
    name,
    usualAmountPaise,
  ) {
    await client.foundationLotteryAuditEvent.create({
      data: {
        organizationId,
        eventType,
        entityType: "EXPENSE_PROFILE",
        entityId: profileId,
        actorAdminId,
        metadata: {
          categoryId,
          name,
          usualAmountPaise: usualAmountPaise.toString(),
        },
      },
    });
  }

  async function createExpenseCategory(input, actorAdminId) {
    const organizationId = requiredText(input?.organizationId, "organizationId");
    const name = requiredText(input?.name, "name");
    return prisma.$transaction(async (client) => {
      await ensureOrganization(client, organizationId);
      const category = await client.foundationAccountingExpenseCategory.create({
        data: { organizationId, name, status: "ACTIVE" },
      });
      await client.foundationLotteryAuditEvent.create({ data: expenseCategoryAuditData(organizationId, "EXPENSE_CATEGORY_CREATED", category.id, actorAdminId, name) });
      return serialize(category);
    });
  }

  async function updateExpenseCategory(input, actorAdminId) {
    const organizationId = requiredText(input?.organizationId, "organizationId");
    const categoryId = requiredText(input?.categoryId, "categoryId");
    const name = requiredText(input?.name, "name");
    return prisma.$transaction(async (client) => {
      const category = await ensureExpenseCategory(client, organizationId, categoryId);
      const updated = await client.foundationAccountingExpenseCategory.update({
        where: { id: category.id },
        data: { name },
      });
      await client.foundationLotteryAuditEvent.create({ data: expenseCategoryAuditData(organizationId, "EXPENSE_CATEGORY_UPDATED", category.id, actorAdminId, name) });
      return serialize(updated);
    });
  }

  function expenseProfileFields(input) {
    return {
      organizationId: requiredText(input?.organizationId, "organizationId"),
      categoryId: requiredText(input?.categoryId, "categoryId"),
      name: requiredText(input?.name, "name"),
      usualAmountPaise: optionalMoney(
        input?.usualAmountPaise,
        "usualAmountPaise",
      ),
    };
  }

  async function createExpenseProfile(input, actorAdminId) {
    const { organizationId, categoryId, name, usualAmountPaise } =
      expenseProfileFields(input);
    return prisma.$transaction(async (client) => {
      await ensureExpenseCategory(client, organizationId, categoryId);
      const profile = await client.foundationAccountingExpenseProfile.create({
        data: {
          organizationId,
          categoryId,
          name,
          usualAmountPaise,
          note: input?.note?.trim() || null,
          status: "ACTIVE",
        },
      });
      await recordExpenseProfileAudit(client, "EXPENSE_PROFILE_CREATED", organizationId, profile.id, actorAdminId, categoryId, name, usualAmountPaise);
      return serialize(profile);
    });
  }

  async function updateExpenseProfile(input, actorAdminId) {
    const profileId = requiredText(input?.profileId, "profileId");
    const { organizationId, categoryId, name, usualAmountPaise } =
      expenseProfileFields(input);
    return prisma.$transaction(async (client) => {
      const profile = await ensureExpenseProfile(client, organizationId, profileId);
      await ensureExpenseCategory(client, organizationId, categoryId);
      const updated = await client.foundationAccountingExpenseProfile.update({
        where: { id: profile.id },
        data: {
          categoryId,
          name,
          usualAmountPaise,
          note: input?.note?.trim() || null,
        },
      });
      await recordExpenseProfileAudit(client, "EXPENSE_PROFILE_UPDATED", organizationId, profile.id, actorAdminId, categoryId, name, usualAmountPaise);
      return serialize(updated);
    });
  }

  async function recordExpenseBill(input, actorAdminId) {
    const organizationId = requiredText(input?.organizationId, "organizationId");
    const profileId = requiredText(input?.profileId, "profileId");
    const amountPaise = nonNegativeInteger(input?.amountPaise, "amountPaise");
    if (amountPaise === 0n) throw accountingError("INVALID_PAYMENT", "amountPaise");
    const occurredAt = optionalDate(input?.occurredAt, "occurredAt", now());
    const suppliedReference = optionalReference(input?.reference);
    return prisma.$transaction(async (client) => {
      await ensureExpenseProfile(client, organizationId, profileId);
      const reference = await nextReference(client, {
        organizationId,
        occurredAt,
        documentType: "EXB",
        reference: suppliedReference,
      });
      const bill = await client.foundationAccountingExpenseBill.create({
        data: {
          organizationId,
          profileId,
          amountPaise,
          reference,
          occurredAt,
          createdByAdminId: actorAdminId,
        },
      });
      await client.foundationLotteryLedgerEntry.createMany({
        data: [
          {
            organizationId,
            transactionId: bill.id,
            sourceType: "ACCOUNTING_EXPENSE_BILL",
            sourceId: bill.id,
            lineNumber: 1,
            accountCode: "OPERATING_EXPENSE",
            side: "DEBIT",
            amountPaise,
            occurredAt,
            createdByAdminId: actorAdminId,
          },
          {
            organizationId,
            transactionId: bill.id,
            sourceType: "ACCOUNTING_EXPENSE_BILL",
            sourceId: bill.id,
            lineNumber: 2,
            accountCode: "EXPENSE_PAYABLE",
            side: "CREDIT",
            amountPaise,
            occurredAt,
            createdByAdminId: actorAdminId,
          },
        ],
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "EXPENSE_BILL_RECORDED",
          entityType: "EXPENSE_BILL",
          entityId: bill.id,
          actorAdminId,
          metadata: { profileId, reference, amountPaise: amountPaise.toString() },
        },
      });
      return serialize(bill);
    });
  }

  async function recordExpensePayment(input, actorAdminId) {
    const organizationId = requiredText(input?.organizationId, "organizationId");
    const profileId = requiredText(input?.profileId, "profileId");
    const totalAmountPaise = nonNegativeInteger(
      input?.totalAmountPaise,
      "totalAmountPaise",
    );
    const cashPaise = optionalMoney(input?.cashPaise, "cashPaise");
    const bankPaise = optionalMoney(input?.bankPaise, "bankPaise");
    if (
      totalAmountPaise === 0n ||
      cashPaise + bankPaise !== totalAmountPaise
    ) {
      throw accountingError("PAYMENT_SPLIT_MISMATCH", "totalAmountPaise");
    }
    const occurredAt = optionalDate(input?.occurredAt, "occurredAt", now());
    const suppliedReference = optionalReference(input?.reference);
    return prisma.$transaction(async (client) => {
      await ensureExpenseProfile(client, organizationId, profileId);
      const [bills, previousExpensePayments, priorLotteryPayments] =
        await Promise.all([
          client.foundationAccountingExpenseBill.findMany({
            where: {
              organizationId,
              profileId,
              occurredAt: { lte: occurredAt },
            },
          }),
          client.foundationAccountingExpensePayment.findMany({
            where: {
              organizationId,
              profileId,
              occurredAt: { lte: occurredAt },
            },
          }),
          client.foundationLotteryPayment.findMany({
            where: {
              organizationId,
              status: "POSTED",
              occurredAt: { lte: occurredAt },
            },
          }),
        ]);
      const billed = bills.reduce(
        (total, bill) => total + BigInt(bill.amountPaise),
        0n,
      );
      const alreadyPaid = previousExpensePayments.reduce(
        (total, payment) => total + BigInt(payment.totalAmountPaise),
        0n,
      );
      if (totalAmountPaise > billed - alreadyPaid) {
        throw accountingError("INVALID_PAYMENT", "totalAmountPaise");
      }

      const priorAllExpensePayments =
        await client.foundationAccountingExpensePayment.findMany({
          where: {
            organizationId,
            occurredAt: { lte: occurredAt },
          },
        });
      const availableCash =
        paymentMethodBalance(priorLotteryPayments, "cashPaise") -
        priorAllExpensePayments.reduce(
          (total, payment) => total + BigInt(payment.cashPaise),
          0n,
        );
      const availableBank =
        paymentMethodBalance(priorLotteryPayments, "bankPaise") -
        priorAllExpensePayments.reduce(
          (total, payment) => total + BigInt(payment.bankPaise),
          0n,
        );
      if (cashPaise > 0n && cashPaise > availableCash) {
        throw accountingError("INVALID_PAYMENT", "cashPaise");
      }
      if (bankPaise > 0n && bankPaise > availableBank) {
        throw accountingError("INVALID_PAYMENT", "bankPaise");
      }

      const reference = await nextReference(client, {
        organizationId,
        occurredAt,
        documentType: "EXP",
        reference: suppliedReference,
      });
      const payment = await client.foundationAccountingExpensePayment.create({
        data: {
          organizationId,
          profileId,
          totalAmountPaise,
          cashPaise,
          bankPaise,
          reference,
          occurredAt,
          createdByAdminId: actorAdminId,
        },
      });
      const methodEntries = [
        ["PAYMENT_CASH", cashPaise],
        ["PAYMENT_BANK", bankPaise],
      ]
        .filter(([, amount]) => amount > 0n)
        .map(([accountCode, amount], index) => ({
          organizationId,
          transactionId: payment.id,
          sourceType: "ACCOUNTING_EXPENSE_PAYMENT",
          sourceId: payment.id,
          lineNumber: index + 1,
          accountCode,
          side: "CREDIT",
          amountPaise: amount,
          occurredAt,
          createdByAdminId: actorAdminId,
        }));
      await client.foundationLotteryLedgerEntry.createMany({
        data: [
          ...methodEntries,
          {
            organizationId,
            transactionId: payment.id,
            sourceType: "ACCOUNTING_EXPENSE_PAYMENT",
            sourceId: payment.id,
            lineNumber: methodEntries.length + 1,
            accountCode: "EXPENSE_PAYABLE",
            side: "DEBIT",
            amountPaise: totalAmountPaise,
            occurredAt,
            createdByAdminId: actorAdminId,
          },
        ],
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "EXPENSE_PAYMENT_RECORDED",
          entityType: "EXPENSE_PAYMENT",
          entityId: payment.id,
          actorAdminId,
          metadata: {
            profileId,
            reference,
            totalAmountPaise: totalAmountPaise.toString(),
          },
        },
      });
      return serialize(payment);
    });
  }

  async function recordCustomerBill(input, actorAdminId) {
    const organizationId = requiredText(input?.organizationId, "organizationId");
    const partyId = requiredText(input?.partyId, "partyId");
    const quantity = nonNegativeInteger(input?.quantity, "quantity");
    const unitRatePaise = nonNegativeInteger(
      input?.unitRatePaise,
      "unitRatePaise",
    );
    const receivedPaise = optionalMoney(input?.receivedPaise, "receivedPaise");
    if (quantity === 0n || unitRatePaise === 0n) {
      throw accountingError("INVALID_SALE_QUANTITY", "quantity");
    }
    const amountPaise = quantity * unitRatePaise;
    if (receivedPaise > amountPaise) {
      throw accountingError("INVALID_PAYMENT", "receivedPaise");
    }
    const occurredAt = optionalDate(input?.occurredAt, "occurredAt", now());
    const suppliedReference = optionalReference(input?.reference);
    return prisma.$transaction(async (client) => {
      const party = await ensureCustomerParty(client, organizationId, partyId);
      const reference = await nextReference(client, {
        organizationId,
        occurredAt,
        documentType: "CUS",
        reference: suppliedReference,
      });
      const bill = await client.foundationAccountingCustomerBill.create({
        data: {
          organizationId,
          partyId,
          quantity,
          unitRatePaise,
          amountPaise,
          reference,
          occurredAt,
          createdByAdminId: actorAdminId,
        },
      });
      await client.foundationLotteryStockMovement.create({
        data: {
          organizationId,
          partyId,
          movementType: "DISPATCH",
          quantity,
          unitRatePaise,
          grossPurchasePaise: 0n,
          commissionPaise: 0n,
          tdsRateBps: 0,
          tdsPaise: 0n,
          netPayablePaise: 0n,
          reference,
          occurredAt,
          createdByAdminId: actorAdminId,
        },
      });
      await client.foundationLotteryLedgerEntry.createMany({
        data: [
          {
            organizationId,
            transactionId: bill.id,
            sourceType: "ACCOUNTING_CUSTOMER_BILL",
            sourceId: bill.id,
            lineNumber: 1,
            accountCode: "PARTY_RECEIVABLE",
            side: "DEBIT",
            amountPaise,
            occurredAt,
            createdByAdminId: actorAdminId,
          },
          {
            organizationId,
            transactionId: bill.id,
            sourceType: "ACCOUNTING_CUSTOMER_BILL",
            sourceId: bill.id,
            lineNumber: 2,
            accountCode: "LOTTERY_SALES",
            side: "CREDIT",
            amountPaise,
            occurredAt,
            createdByAdminId: actorAdminId,
          },
        ],
      });

      let payment = null;
      if (receivedPaise > 0n) {
        const paymentReference = await nextReference(client, {
          organizationId,
          occurredAt,
          documentType: "PAY",
        });
        const methodSplit = {
          cashPaise: receivedPaise.toString(),
          bankPaise: "0",
          upiPaise: "0",
          chequePaise: "0",
          pwtPaise: "0",
        };
        payment = await client.foundationLotteryPayment.create({
          data: {
            organizationId,
            partyId: party.id,
            periodId: null,
            direction: "RECEIPT",
            totalAmountPaise: receivedPaise,
            methodSplit,
            reference: paymentReference,
            occurredAt,
            status: "POSTED",
            createdByAdminId: actorAdminId,
          },
        });
        await client.foundationLotteryLedgerEntry.createMany({
          data: [
            {
              organizationId,
              transactionId: payment.id,
              sourceType: "LOTTERY_PAYMENT",
              sourceId: payment.id,
              lineNumber: 1,
              accountCode: "PAYMENT_CASH",
              side: "DEBIT",
              amountPaise: receivedPaise,
              occurredAt,
              createdByAdminId: actorAdminId,
            },
            {
              organizationId,
              transactionId: payment.id,
              sourceType: "LOTTERY_PAYMENT",
              sourceId: payment.id,
              lineNumber: 2,
              accountCode: "PARTY_RECEIVABLE",
              side: "CREDIT",
              amountPaise: receivedPaise,
              occurredAt,
              createdByAdminId: actorAdminId,
            },
          ],
        });
      }

      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "CUSTOMER_BILL_RECORDED",
          entityType: "CUSTOMER_BILL",
          entityId: bill.id,
          actorAdminId,
          metadata: {
            partyId,
            reference,
            quantity: quantity.toString(),
            unitRatePaise: unitRatePaise.toString(),
            amountPaise: amountPaise.toString(),
            receivedPaise: receivedPaise.toString(),
          },
        },
      });
      return serialize({ bill, payment });
    });
  }
  async function createPeriod(input, actorAdminId) {
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
    const label = requiredText(input?.label, "label");
    const startsAt = optionalDate(input?.startsAt, "startsAt");
    const endsAt = optionalDate(input?.endsAt, "endsAt");
    if (endsAt < startsAt)
      throw accountingError("INVALID_PERIOD_RANGE", "endsAt");
    return prisma.$transaction(async (client) => {
      const period = await client.foundationLotteryAccountingPeriod.create({
        data: { organizationId, label, startsAt, endsAt, status: "OPEN" },
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "ACCOUNTING_PERIOD_CREATED",
          entityType: "ACCOUNTING_PERIOD",
          entityId: period.id,
          actorAdminId,
          metadata: { label },
        },
      });
      return serialize(period);
    });
  }

  async function createFinancialYearPeriod(input, actorAdminId) {
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
    const period = financialYearRange(input?.financialYearStart);
    return prisma.$transaction(async (client) => {
      const existingPeriods =
        await client.foundationLotteryAccountingPeriod.findMany({
          where: { organizationId },
        });
      const existingFinancialYear = existingPeriods.find((item) =>
        /^FY\d{2}-\d{2}$/.test(item.label),
      );
      // The Admin selects this once during setup. Keeping that selected year
      // prevents a later screen refresh or accidental tap from moving entries
      // to a different financial year.
      if (existingFinancialYear) return serialize(existingFinancialYear);
      const created = await client.foundationLotteryAccountingPeriod.create({
        data: {
          organizationId,
          label: period.label,
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          status: "OPEN",
        },
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "FINANCIAL_YEAR_PERIOD_CREATED",
          entityType: "ACCOUNTING_PERIOD",
          entityId: created.id,
          actorAdminId,
          metadata: {
            label: period.label,
            startsAt: period.startsAt.toISOString(),
            endsAt: period.endsAt.toISOString(),
          },
        },
      });
      return serialize(created);
    });
  }

  async function recordStockMovement(input, actorAdminId) {
    const {
      organizationId,
      occurredAt,
      reference: suppliedReference,
    } = stockPostingContext(input);
    const movementType = requiredText(input?.type, "type").toUpperCase();
    if (
      !new Set(["RECEIPT", "DISPATCH", "RETURN", "STOCKIST_RETURN", "ADJUSTMENT"]).has(
        movementType,
      )
    ) {
      throw accountingError("INVALID_STOCK_TYPE", "type");
    }
    const quantity = inputBigInt(input.quantity, "quantity");
    if (quantity === 0n || (quantity < 0n && movementType !== "ADJUSTMENT")) {
      throw accountingError("INVALID_STOCK_QUANTITY", "quantity");
    }

    // This legacy single-movement route remains for backward compatibility;
    // the new simple daily grid uses saveDailyStockistEntry below.
    // eslint-disable-next-line sonarjs/cognitive-complexity
    return prisma.$transaction(async (client) => {
      let purchase = {
        partyId: null,
        unitRatePaise: 0n,
        grossPurchasePaise: 0n,
        commissionPaise: 0n,
        tdsRateBps: 0,
        tdsPaise: 0n,
        netPayablePaise: 0n,
      };
      let sourceReceiptId = null;
      let returnSession = null;
      if (input?.partyId) {
        if (!new Set(["RECEIPT", "STOCKIST_RETURN"]).has(movementType)) {
          throw accountingError("INVALID_STOCK_PARTY", "partyId");
        }
        const party = await ensureParty(client, organizationId, input.partyId);
        if (!new Set(["STOCKIST", "SERVICE_STOCKIST"]).has(party.partyType)) {
          throw accountingError("INVALID_STOCK_PARTY", "partyId");
        }
        const organization = await ensureOrganization(client, organizationId);
        const suppliedReceiptId = input?.sourceReceiptId ? requiredText(input.sourceReceiptId, "sourceReceiptId") : null;
        const sourceReceipt = suppliedReceiptId
          ? await client.foundationLotteryStockMovement.findFirst({ where: { id: suppliedReceiptId, organizationId, partyId: party.id, movementType: "RECEIPT" } })
          : null;
        if (movementType === "STOCKIST_RETURN" && !sourceReceipt) {
          throw accountingError("STOCKIST_RETURN_NEEDS_RECEIPT", "sourceReceiptId");
        }
        sourceReceiptId = sourceReceipt?.id || null;
        returnSession = movementType === "STOCKIST_RETURN" ? requiredText(input?.returnSession, "returnSession").toUpperCase() : null;
        if (returnSession && !new Set(["MORNING", "DAY", "EVENING"]).has(returnSession)) throw accountingError("INVALID_RETURN_SESSION", "returnSession");
        const unitRatePaise = sourceReceipt ? BigInt(sourceReceipt.unitRatePaise) : partyProfileFromRow(party).ticketRatePaise;
        const grossPurchasePaise = quantity * unitRatePaise;
        const commissionPaise = sourceReceipt ? (quantity * BigInt(sourceReceipt.commissionPaise)) / BigInt(sourceReceipt.quantity) : optionalMoney(input?.commissionPaise, "commissionPaise");
        if (commissionPaise > grossPurchasePaise) {
          throw accountingError("RATE_OUT_OF_RANGE", "commissionPaise");
        }
        const tdsRateBps = sourceReceipt ? sourceReceipt.tdsRateBps : percentageRate(organization.tdsRateBps ?? DEFAULT_TDS_RATE_BPS, "tdsRateBps");
        const tdsPaise = roundedPercentage(grossPurchasePaise, tdsRateBps);
        purchase = {
          partyId: party.id,
          unitRatePaise,
          grossPurchasePaise,
          commissionPaise,
          tdsRateBps,
          tdsPaise,
          netPayablePaise: grossPurchasePaise - commissionPaise - tdsPaise,
        };
      }
      const reference = await nextReference(client, {
        organizationId,
        occurredAt,
        documentType: "STK",
        reference: suppliedReference,
      });
      const movement = await client.foundationLotteryStockMovement.create({
        data: {
          organizationId,
          ...purchase,
          sourceReceiptId,
          returnSession,
          movementType,
          quantity,
          reference,
          occurredAt,
          createdByAdminId: actorAdminId,
        },
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "STOCK_MOVEMENT_RECORDED",
          entityType: "STOCK_MOVEMENT",
          entityId: movement.id,
          actorAdminId,
          metadata: {
            movementType,
            quantity: quantity.toString(),
            reference,
            ...(purchase.partyId
              ? {
                  partyId: purchase.partyId,
                  grossPurchasePaise: purchase.grossPurchasePaise.toString(),
                  netPayablePaise: purchase.netPayablePaise.toString(),
                  ...(sourceReceiptId ? { sourceReceiptId, returnSession } : {}),
                }
              : {}),
          },
        },
      });
      return serialize(movement);
    });
  }

  async function saveDailyStockistEntry(input, actorAdminId) {
    const organizationId = requiredText(input?.organizationId, "organizationId");
    const partyId = requiredText(input?.partyId, "partyId");
    const occurredAt = optionalDate(input?.occurredAt, "occurredAt", now());
    const range = utcDayRange(occurredAt);
    const entryDate = utcDateKey(range.startsAt);
    const purchaseQuantity = nonNegativeInteger(
      input?.purchaseQuantity ?? 0,
      "purchaseQuantity",
    );
    const returns = {
      MORNING: nonNegativeInteger(
        input?.morningReturnQuantity ?? 0,
        "morningReturnQuantity",
      ),
      DAY: nonNegativeInteger(
        input?.dayReturnQuantity ?? 0,
        "dayReturnQuantity",
      ),
      EVENING: nonNegativeInteger(
        input?.eveningReturnQuantity ?? 0,
        "eveningReturnQuantity",
      ),
    };
    const totalReturnQuantity = Object.values(returns).reduce(
      (total, quantity) => total + quantity,
      0n,
    );
    const commissionPaise = optionalMoney(input?.commissionPaise, "commissionPaise");

    return prisma.$transaction(async (client) => {
      const [party, organization, allStock, allSales, dailyEntries, parties, clearances] = await Promise.all([
        ensureParty(client, organizationId, partyId),
        ensureOrganization(client, organizationId),
        client.foundationLotteryStockMovement.findMany({
          where: { organizationId },
        }),
        client.foundationLotterySale.findMany({ where: { organizationId } }),
        client.foundationLotteryStockistEntry.findMany({
          where: { organizationId },
        }),
        client.foundationAccountingParty.findMany({
          where: { organizationId, status: "ACTIVE" },
        }),
        client.foundationLotteryEntryClearance.findMany({
          where: { organizationId },
        }),
      ]);
      if (!new Set(["STOCKIST", "SERVICE_STOCKIST"]).has(party.partyType)) {
        throw accountingError("INVALID_STOCK_PARTY", "partyId");
      }

      const visibleStock = allStock.filter(
        (movement) =>
          !rowWasCleared(
            clearances,
            movement,
            clearanceScopeForStockMovement(movement),
          ),
      );
      const visibleSales = visibleAfterClearances(
        clearances,
        allSales,
        "SELLER",
      );
      const visibleDailyEntries = visibleAfterClearances(
        clearances,
        dailyEntries,
        "STOCKIST",
      );
      const effectiveEntries = effectiveStockistEntries(
        visibleStock,
        visibleDailyEntries,
        parties,
      );
      const existing = effectiveEntries.find(
        (entry) =>
          entry.partyId === partyId &&
          utcDateKey(entry.occurredAt) === entryDate,
      );
      const existingDaily = dailyEntries.find(
        (entry) =>
          entry.partyId === partyId &&
          utcDateKey(entry.occurredAt) === entryDate,
      );
      for (const [session, field] of Object.entries({
        MORNING: "morningReturnQuantity",
        DAY: "dayReturnQuantity",
        EVENING: "eveningReturnQuantity",
      })) {
        const sellerReturn = visibleSales
          .filter((sale) => utcDateKey(sale.occurredAt) === entryDate)
          .reduce((total, sale) => total + BigInt(sale[field]), 0n);
        const alreadyReturned = visibleDailyEntries
          .filter((entry) => entry.id !== existingDaily?.id && utcDateKey(entry.occurredAt) === entryDate)
          .reduce((total, entry) => total + BigInt(entry[field]), 0n);
        if (returns[session] > sellerReturn - alreadyReturned) {
          throw accountingError("RETURN_EXCEEDS_AVAILABLE_STOCK", `${field}`);
        }
      }

      const unitRatePaise = partyProfileFromRow(party).ticketRatePaise;
      const netPurchaseQuantity = purchaseQuantity - totalReturnQuantity;
      const commissionLimit =
        netPurchaseQuantity > 0n ? netPurchaseQuantity * unitRatePaise : 0n;
      if (commissionPaise > commissionLimit) {
        throw accountingError("RATE_OUT_OF_RANGE", "commissionPaise");
      }
      const tdsRateBps = percentageRate(
        organization.tdsRateBps ?? DEFAULT_TDS_RATE_BPS,
        "tdsRateBps",
      );
      const tdsPaise = roundedPercentage(commissionPaise, tdsRateBps);
      const grossPurchasePaise = netPurchaseQuantity * unitRatePaise;
      const entryData = {
        partyId,
        purchaseQuantity,
        morningReturnQuantity: returns.MORNING,
        dayReturnQuantity: returns.DAY,
        eveningReturnQuantity: returns.EVENING,
        totalReturnQuantity,
        netPurchaseQuantity,
        unitRatePaise,
        commissionPaise,
        tdsRateBps,
        tdsPaise,
        grossPurchasePaise,
        netPayablePaise: grossPurchasePaise - commissionPaise + tdsPaise,
        occurredAt: range.startsAt,
        updatedByAdminId: actorAdminId,
      };
      const entry = existingDaily
        ? await client.foundationLotteryStockistEntry.update({
            where: { id: existingDaily.id },
            data: entryData,
          })
        : await client.foundationLotteryStockistEntry.create({
            data: {
              organizationId,
              ...entryData,
              reference: await nextReference(client, {
                organizationId,
                occurredAt: range.startsAt,
                documentType: "PUR",
              }),
              createdByAdminId: actorAdminId,
            },
          });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: purchaseQuantity > 0n || totalReturnQuantity > 0n
            ? "DAILY_STOCKIST_ENTRY_SAVED"
            : "DAILY_STOCKIST_ENTRY_CLEARED",
          entityType: "STOCKIST_DAILY_ENTRY",
          entityId: entry.id,
          actorAdminId,
          metadata: {
            previous: existing ? serialize(existing) : null,
            latest: serialize(entry),
          },
        },
      });
      return serialize(entry);
    });
  }

  async function clearDailyEntries(input, actorAdminId) {
    const organizationId = requiredText(input?.organizationId, "organizationId");
    const occurredAt = optionalDate(input?.occurredAt, "occurredAt", now());
    const scope = requiredText(input?.scope, "scope").toUpperCase();
    if (!new Set(["ALL", "SELLER", "STOCKIST", "PAYMENT"]).has(scope)) {
      throw accountingError("INVALID_CLEARANCE_SCOPE", "scope");
    }
    const range = utcDayRange(occurredAt);
    return prisma.$transaction(async (client) => {
      await ensureOrganization(client, organizationId);
      const clearance = await client.foundationLotteryEntryClearance.create({
        data: {
          organizationId,
          occurredAt: range.startsAt,
          scope,
          createdByAdminId: actorAdminId,
        },
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "DAILY_ENTRIES_CLEARED",
          entityType: "DAILY_ENTRY_CLEARANCE",
          entityId: clearance.id,
          actorAdminId,
          metadata: { day: utcDateKey(range.startsAt), scope },
        },
      });
      return serialize(clearance);
    });
  }

  function assertPositiveDispatch(calculated) {
    if (BigInt(calculated.dispatchQuantity) === 0n) {
      throw accountingError("INVALID_SALE_QUANTITY", "dispatchQuantity");
    }
  }

  function saleData({ context, calculated, reference, status, actorAdminId }) {
    return {
      organizationId: context.organizationId,
      partyId: context.partyId,
      periodId: context.periodId,
      reference,
      occurredAt: context.occurredAt,
      dispatchQuantity: Number(calculated.dispatchQuantity),
      morningReturnQuantity: Number(calculated.morningReturnQuantity),
      dayReturnQuantity: Number(calculated.dayReturnQuantity),
      eveningReturnQuantity: Number(calculated.eveningReturnQuantity),
      returnQuantity: Number(calculated.returnQuantity),
      netTickets: Number(calculated.netTickets),
      ticketRatePaise: asBigInt(calculated.ticketRatePaise),
      commissionRateBps: Number(calculated.commissionRateBps),
      commissionPaise: asBigInt(calculated.commissionPaise),
      tdsRateBps: Number(calculated.tdsRateBps),
      tdsPaise: asBigInt(calculated.tdsPaise),
      grossSalesPaise: asBigInt(calculated.grossSalesPaise),
      netPayablePaise: asBigInt(calculated.netPayablePaise),
      status,
      createdByAdminId: actorAdminId,
    };
  }

  async function writePostedSaleArtifacts(
    client,
    { sale, calculated, organizationId, occurredAt, actorAdminId },
  ) {
    const ledger = buildLotterySaleLedger(calculated);
    const movements = [
      {
        movementType: "DISPATCH",
        quantity: asBigInt(calculated.dispatchQuantity),
      },
      ...(BigInt(calculated.returnQuantity) > 0n
        ? [
            {
              movementType: "RETURN",
              quantity: asBigInt(calculated.returnQuantity),
            },
          ]
        : []),
    ];
    const existingMovements =
      await client.foundationLotteryStockMovement.findMany({
        where: { organizationId },
      });
    stockSummary([
      ...existingMovements.map((movement) => ({
        type: movement.movementType,
        quantity: movement.quantity,
      })),
      ...movements.map((movement) => ({
        type: movement.movementType,
        quantity: movement.quantity,
      })),
    ]);
    await client.foundationLotteryStockMovement.createMany({
      data: movements.map((movement) => ({
        organizationId,
        movementType: movement.movementType,
        quantity: movement.quantity,
        reference: sale.reference,
        occurredAt,
        createdByAdminId: actorAdminId,
      })),
    });
    await client.foundationLotteryLedgerEntry.createMany({
      data: ledger.map((entry) => ({
        organizationId,
        transactionId: sale.id,
        sourceType: "LOTTERY_SALE",
        sourceId: sale.id,
        lineNumber: entry.lineNumber,
        accountCode: entry.accountCode,
        side: entry.side,
        amountPaise: asBigInt(entry.amountPaise),
        occurredAt,
        createdByAdminId: actorAdminId,
      })),
    });
    return ledger;
  }

  async function createSellerSale(
    client,
    { input, actorAdminId, status },
  ) {
    const context = postingContext(input);
    const calculated = await calculateSellerEntry(client, context, input);
    const reference = await nextReference(client, {
      organizationId: context.organizationId,
      occurredAt: context.occurredAt,
      documentType: "SAL",
      reference: context.reference,
    });
    const sale = await client.foundationLotterySale.create({
      data: saleData({ context, calculated, reference, status, actorAdminId }),
    });
    return { context, calculated, reference, sale };
  }

  async function calculateSellerEntry(client, context, input) {
    const [party, organization] = await Promise.all([
      ensureSellerParty(client, context.organizationId, context.partyId),
      ensureOrganization(client, context.organizationId),
    ]);
    const calculated = saleCalculation(party, organization, input);
    assertPositiveDispatch(calculated);
    return calculated;
  }

  async function findDailySellerDraft(client, organizationId, saleId) {
    const draft = await client.foundationLotterySale.findFirst({
      where: { id: saleId, organizationId, status: "DRAFT" },
    });
    if (!draft) throw accountingError("DRAFT_SALE_NOT_FOUND", "saleId");
    return draft;
  }

  function dailySellerDraftRequest(input) {
    return {
      organizationId: requiredText(input?.organizationId, "organizationId"),
      saleId: requiredText(input?.saleId, "saleId"),
    };
  }

  async function saveExistingDailySellerDraft(
    client,
    { existing, context, input, actorAdminId, eventType },
  ) {
    const calculated = await calculateSellerEntry(client, context, input);
    const sale = await client.foundationLotterySale.update({
      where: { id: existing.id },
      data: saleData({
        context,
        calculated,
        reference: existing.reference,
        status: "DRAFT",
        actorAdminId: existing.createdByAdminId,
      }),
    });
    await client.foundationLotteryAuditEvent.create({
      data: {
        organizationId: context.organizationId,
        eventType,
        entityType: "SALE",
        entityId: sale.id,
        actorAdminId,
        metadata: { reference: sale.reference, calculation: calculated },
      },
    });
    return { sale: serialize(sale), calculated };
  }

  async function createDailySellerDraft(input, actorAdminId) {
    return prisma.$transaction(async (client) => {
      const context = postingContext(input);
      const range = utcDayRange(context.occurredAt);
      const [candidate, clearances] = await Promise.all([
        client.foundationLotterySale.findFirst({
        where: {
          organizationId: context.organizationId,
          partyId: context.partyId,
          status: "DRAFT",
          occurredAt: { gte: range.startsAt, lt: range.endsAt },
        },
        }),
        client.foundationLotteryEntryClearance.findMany({
          where: { organizationId: context.organizationId },
        }),
      ]);
      const existing =
        candidate && !rowWasCleared(clearances, candidate, "SELLER")
          ? candidate
          : null;
      if (existing) {
        return saveExistingDailySellerDraft(client, {
          existing,
          context,
          input,
          actorAdminId,
          eventType: "DAILY_SELLER_DRAFT_AUTOSAVED",
        });
      }
      const { context: createdContext, calculated, reference, sale } = await createSellerSale(
        client,
        { input, actorAdminId, status: "DRAFT" },
      );
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId: createdContext.organizationId,
          eventType: "DAILY_SELLER_DRAFT_SAVED",
          entityType: "SALE",
          entityId: sale.id,
          actorAdminId,
          metadata: { reference, calculation: calculated },
        },
      });
      return { sale: serialize(sale), calculated };
    });
  }

  async function updateDailySellerDraft(input, actorAdminId) {
    const context = postingContext(input);
    const saleId = requiredText(input?.saleId, "saleId");
    return prisma.$transaction(async (client) => {
      const existing = await client.foundationLotterySale.findFirst({
        where: {
          id: saleId,
          organizationId: context.organizationId,
          status: "DRAFT",
        },
      });
      if (!existing) throw accountingError("DRAFT_SALE_NOT_FOUND", "saleId");
      return saveExistingDailySellerDraft(client, {
        existing,
        context,
        input,
        actorAdminId,
        eventType: "DAILY_SELLER_DRAFT_UPDATED",
      });
    });
  }

  async function deleteDailySellerDraft(input, actorAdminId) {
    const { organizationId, saleId } = dailySellerDraftRequest(input);
    return prisma.$transaction(async (client) => {
      const draft = await findDailySellerDraft(client, organizationId, saleId);
      await client.foundationLotterySale.delete({ where: { id: draft.id } });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "DAILY_SELLER_DRAFT_DELETED",
          entityType: "SALE",
          entityId: draft.id,
          actorAdminId,
          metadata: { reference: draft.reference },
        },
      });
      return { id: draft.id };
    });
  }

  async function postDailySellerDraft(input, actorAdminId) {
    const { organizationId, saleId } = dailySellerDraftRequest(input);
    return prisma.$transaction(async (client) => {
      const draft = await findDailySellerDraft(client, organizationId, saleId);
      const party = await ensureSellerParty(
        client,
        organizationId,
        draft.partyId,
      );
      const organization = await ensureOrganization(client, organizationId);
      const calculated = saleCalculation(party, organization, draft);
      assertPositiveDispatch(calculated);
      const sale = await client.foundationLotterySale.update({
        where: { id: draft.id },
        data: saleData({
          context: {
            organizationId,
            partyId: draft.partyId,
            periodId: draft.periodId,
            occurredAt: draft.occurredAt,
          },
          calculated,
          reference: draft.reference,
          status: "POSTED",
          actorAdminId: draft.createdByAdminId,
        }),
      });
      const ledger = await writePostedSaleArtifacts(client, {
        sale,
        calculated,
        organizationId,
        occurredAt: sale.occurredAt,
        actorAdminId,
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "DAILY_SELLER_ENTRY_POSTED",
          entityType: "SALE",
          entityId: sale.id,
          actorAdminId,
          metadata: { reference: sale.reference, calculation: calculated },
        },
      });
      return { sale: serialize(sale), calculated, ledger };
    });
  }

  async function correctPostedSale(input, actorAdminId) {
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
    const saleId = requiredText(input?.saleId, "saleId");
    return prisma.$transaction(async (client) => {
      const original = await client.foundationLotterySale.findFirst({
        where: { id: saleId, organizationId, status: "POSTED" },
      });
      if (!original) throw accountingError("SALE_NOT_FOUND", "saleId");
      const settlementCount = await client.foundationLotterySettlement.count({
        where: { organizationId, saleId: original.id },
      });
      if (settlementCount > 0) {
        throw accountingError("SALE_HAS_SETTLEMENTS", "saleId");
      }
      await ensureSellerParty(client, organizationId, original.partyId);
      const calculated = calculateLotterySale({
        dispatchQuantity: original.dispatchQuantity,
        returnQuantity: original.returnQuantity,
        morningReturnQuantity: original.morningReturnQuantity ?? 0,
        dayReturnQuantity:
          original.dayReturnQuantity ?? original.returnQuantity,
        eveningReturnQuantity: original.eveningReturnQuantity ?? 0,
        ticketRatePaise: original.ticketRatePaise,
        commissionPaise: original.commissionPaise,
        tdsRateBps: original.tdsRateBps,
      });
      const reversalReference = await nextReference(client, {
        organizationId,
        occurredAt: original.occurredAt,
        documentType: "COR",
      });
      await client.foundationLotterySale.update({
        where: { id: original.id },
        data: { status: "REVERSED" },
      });
      const reversalLedger = buildLotterySaleLedger(calculated).map(
        (entry) => ({
          ...entry,
          side: entry.side === "DEBIT" ? "CREDIT" : "DEBIT",
        }),
      );
      if (BigInt(calculated.netTickets) > 0n) {
        await client.foundationLotteryStockMovement.create({
          data: {
            organizationId,
            movementType: "ADJUSTMENT",
            quantity: asBigInt(calculated.netTickets),
            reference: reversalReference,
            occurredAt: original.occurredAt,
            createdByAdminId: actorAdminId,
          },
        });
      }
      await client.foundationLotteryLedgerEntry.createMany({
        data: reversalLedger.map((entry) => ({
          organizationId,
          transactionId: reversalReference,
          sourceType: "LOTTERY_SALE_REVERSAL",
          sourceId: original.id,
          lineNumber: entry.lineNumber,
          accountCode: entry.accountCode,
          side: entry.side,
          amountPaise: asBigInt(entry.amountPaise),
          occurredAt: original.occurredAt,
          createdByAdminId: actorAdminId,
        })),
      });
      const draftReference = await nextReference(client, {
        organizationId,
        occurredAt: original.occurredAt,
        documentType: "SAL",
      });
      const draft = await client.foundationLotterySale.create({
        data: {
          ...saleData({
            context: {
              organizationId,
              partyId: original.partyId,
              periodId: original.periodId,
              occurredAt: original.occurredAt,
            },
            calculated,
            reference: draftReference,
            status: "DRAFT",
            actorAdminId,
          }),
          correctionOfSaleId: original.id,
        },
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "SALE_REVERSED_FOR_CORRECTION",
          entityType: "SALE",
          entityId: original.id,
          actorAdminId,
          metadata: {
            reversalReference,
            replacementDraftReference: draftReference,
          },
        },
      });
      return { draft: serialize(draft), reversalReference };
    });
  }

  async function recordSale(input, actorAdminId) {
    return prisma.$transaction(async (client) => {
      const { context, calculated, reference, sale } = await createSellerSale(
        client,
        { input, actorAdminId, status: "POSTED" },
      );
      const ledger = await writePostedSaleArtifacts(client, {
        sale,
        calculated,
        organizationId: context.organizationId,
        occurredAt: context.occurredAt,
        actorAdminId,
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId: context.organizationId,
          eventType: "SALE_POSTED",
          entityType: "SALE",
          entityId: sale.id,
          actorAdminId,
          metadata: { reference, calculation: calculated },
        },
      });
      return { sale: serialize(sale), calculated, ledger };
    });
  }

  async function recordPayment(input, actorAdminId) {
    const { organizationId, partyId, reference, occurredAt, periodId } =
      postingContext(input);
    const payment = validatePayment(input);

    return prisma.$transaction(async (client) => {
      await ensureParty(client, organizationId, partyId);
      if (payment.direction !== "RECEIPT") {
        const priorPayments = await client.foundationLotteryPayment.findMany({
          where: {
            organizationId,
            status: "POSTED",
            occurredAt: { lte: occurredAt },
          },
        });
        for (const method of PAYMENT_METHOD_FIELDS) {
          const requested = BigInt(payment.methodSplit[method] || 0);
          if (requested === 0n) continue;
          const available = paymentMethodBalance(priorPayments, method);
          if (requested > available) {
            throw accountingError(
              "INVALID_PAYMENT",
              `methodSplit.${method}`,
            );
          }
        }
      }
      const resolvedReference = await nextReference(client, {
        organizationId,
        occurredAt,
        documentType: "PAY",
        reference,
      });
      const saved = await client.foundationLotteryPayment.create({
        data: {
          organizationId,
          partyId,
          periodId,
          direction: payment.direction,
          totalAmountPaise: asBigInt(payment.totalAmountPaise),
          methodSplit: payment.methodSplit,
          reference: resolvedReference,
          occurredAt,
          status: "POSTED",
          createdByAdminId: actorAdminId,
        },
      });
      const transactionSide =
        payment.direction === "RECEIPT" ? "DEBIT" : "CREDIT";
      const offsetSide = transactionSide === "DEBIT" ? "CREDIT" : "DEBIT";
      const methodEntries = Object.entries(payment.methodSplit)
        .filter(([, amount]) => BigInt(amount) > 0n)
        .map(([method, amount], index) => ({
          organizationId,
          transactionId: saved.id,
          sourceType: "LOTTERY_PAYMENT",
          sourceId: saved.id,
          lineNumber: index + 1,
          accountCode: `PAYMENT_${method.replace("Paise", "").toUpperCase()}`,
          side: transactionSide,
          amountPaise: asBigInt(amount),
          occurredAt,
          createdByAdminId: actorAdminId,
        }));
      await client.foundationLotteryLedgerEntry.createMany({
        data: [
          ...methodEntries,
          {
            organizationId,
            transactionId: saved.id,
            sourceType: "LOTTERY_PAYMENT",
            sourceId: saved.id,
            lineNumber: methodEntries.length + 1,
            accountCode:
              payment.direction === "RECEIPT"
                ? "PARTY_RECEIVABLE"
                : payment.direction === "PAYMENT"
                  ? "PARTY_PAYABLE"
                  : "OPERATING_EXPENSE",
            side: offsetSide,
            amountPaise: asBigInt(payment.totalAmountPaise),
            occurredAt,
            createdByAdminId: actorAdminId,
          },
        ],
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "PAYMENT_POSTED",
          entityType: "PAYMENT",
          entityId: saved.id,
          actorAdminId,
          metadata: {
            reference: resolvedReference,
            direction: payment.direction,
          },
        },
      });
      return { payment: serialize(saved), verifiedPayment: payment };
    });
  }

  async function recordSettlement(input, actorAdminId) {
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
    const saleId = requiredText(input?.saleId, "saleId");
    const paymentId = requiredText(input?.paymentId, "paymentId");
    const amountPaise = inputBigInt(input.amountPaise, "amountPaise");
    if (amountPaise <= 0n)
      throw accountingError("INVALID_SETTLEMENT", "amountPaise");

    return prisma.$transaction(async (client) => {
      const [sale, payment, saleAllocated, paymentAllocated] =
        await Promise.all([
          client.foundationLotterySale.findFirst({
            where: { id: saleId, organizationId, status: "POSTED" },
          }),
          client.foundationLotteryPayment.findFirst({
            where: { id: paymentId, organizationId, direction: "RECEIPT" },
          }),
          client.foundationLotterySettlement.aggregate({
            where: { organizationId, saleId },
            _sum: { amountPaise: true },
          }),
          client.foundationLotterySettlement.aggregate({
            where: { organizationId, paymentId },
            _sum: { amountPaise: true },
          }),
        ]);
      if (!sale) throw accountingError("SALE_NOT_FOUND", "saleId");
      if (!payment) throw accountingError("PAYMENT_NOT_FOUND", "paymentId");
      const remainingSale =
        BigInt(sale.netPayablePaise) -
        BigInt(saleAllocated._sum.amountPaise || 0);
      const remainingPayment =
        BigInt(payment.totalAmountPaise) -
        BigInt(paymentAllocated._sum.amountPaise || 0);
      if (amountPaise > remainingSale || amountPaise > remainingPayment) {
        throw accountingError("SETTLEMENT_EXCEEDS_BALANCE", "amountPaise");
      }
      const settlement = await client.foundationLotterySettlement.create({
        data: {
          organizationId,
          saleId,
          paymentId,
          amountPaise,
          createdByAdminId: actorAdminId,
        },
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "PAYMENT_SETTLED",
          entityType: "SETTLEMENT",
          entityId: settlement.id,
          actorAdminId,
          metadata: { saleId, paymentId, amountPaise: amountPaise.toString() },
        },
      });
      return serialize(settlement);
    });
  }

  async function previewSale(input) {
    const context = postingContext(input);
    const party = await ensureSellerParty(
      prisma,
      context.organizationId,
      context.partyId,
    );
    const organization = await ensureOrganization(prisma, context.organizationId);
    const calculated = saleCalculation(party, organization, input);
    assertPositiveDispatch(calculated);
    return {
      calculated,
      ledger: buildLotterySaleLedger(calculated),
    };
  }

  async function getWorkspace({ organizationId }) {
    const scopedOrganizationId = requiredText(organizationId, "organizationId");
    const organization =
      await prisma.foundationAccountingOrganization.findFirst({
        where: { id: scopedOrganizationId, status: "ACTIVE" },
      });
    if (!organization) {
      throw accountingError("ORGANIZATION_NOT_FOUND", "organizationId");
    }

    const [
      parties,
      periods,
      stockMovements,
      stockistEntries,
      sales,
      draftSales,
      payments,
      settlements,
      ledgerEntries,
      auditEvents,
      clearances,
      expenseCategories,
      expenseProfiles,
      expenseBills,
      expensePayments,
      customerBills,
      summary,
    ] = await Promise.all([
      prisma.foundationAccountingParty.findMany({
        where: { organizationId: scopedOrganizationId, status: "ACTIVE" },
        orderBy: { name: "asc" },
      }),
      prisma.foundationLotteryAccountingPeriod.findMany({
        where: { organizationId: scopedOrganizationId },
        orderBy: { startsAt: "desc" },
      }),
      prisma.foundationLotteryStockMovement.findMany({
        where: { organizationId: scopedOrganizationId },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.foundationLotteryStockistEntry.findMany({
        where: { organizationId: scopedOrganizationId },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.foundationLotterySale.findMany({
        where: { organizationId: scopedOrganizationId, status: "POSTED" },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.foundationLotterySale.findMany({
        where: { organizationId: scopedOrganizationId, status: "DRAFT" },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.foundationLotteryPayment.findMany({
        where: { organizationId: scopedOrganizationId, status: "POSTED" },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.foundationLotterySettlement.findMany({
        where: { organizationId: scopedOrganizationId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.foundationLotteryLedgerEntry.findMany({
        where: { organizationId: scopedOrganizationId },
        orderBy: [{ occurredAt: "desc" }, { lineNumber: "asc" }],
      }),
      prisma.foundationLotteryAuditEvent.findMany({
        where: { organizationId: scopedOrganizationId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.foundationLotteryEntryClearance.findMany({
        where: { organizationId: scopedOrganizationId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.foundationAccountingExpenseCategory.findMany({
        where: { organizationId: scopedOrganizationId, status: "ACTIVE" },
        orderBy: { name: "asc" },
      }),
      prisma.foundationAccountingExpenseProfile.findMany({
        where: { organizationId: scopedOrganizationId, status: "ACTIVE" },
        orderBy: { name: "asc" },
      }),
      prisma.foundationAccountingExpenseBill.findMany({
        where: { organizationId: scopedOrganizationId },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.foundationAccountingExpensePayment.findMany({
        where: { organizationId: scopedOrganizationId },
        orderBy: { occurredAt: "desc" },
      }),
      prisma.foundationAccountingCustomerBill.findMany({
        where: { organizationId: scopedOrganizationId },
        orderBy: { occurredAt: "desc" },
      }),
      getVerifiedSummary({ organizationId: scopedOrganizationId }),
    ]);

    const partyNames = new Map(parties.map((party) => [party.id, party.name]));
    const visibleStockMovements = stockMovements.filter(
      (movement) =>
        !rowWasCleared(
          clearances,
          movement,
          clearanceScopeForStockMovement(movement),
        ),
    );
    const visibleSales = visibleAfterClearances(clearances, sales, "SELLER");
    const visibleDraftSales = visibleAfterClearances(
      clearances,
      draftSales,
      "SELLER",
    );
    const visiblePayments = visibleAfterClearances(
      clearances,
      payments,
      "PAYMENT",
    );
    const visibleDailyEntries = visibleAfterClearances(
      clearances,
      stockistEntries,
      "STOCKIST",
    );
    const visibleStockistEntries = effectiveStockistEntries(
      visibleStockMovements,
      visibleDailyEntries,
      parties,
    );
    const periodLabels = new Map(
      periods.map((period) => [period.id, period.label]),
    );
    const saleSettled = new Map();
    const paymentSettled = new Map();
    const visibleSaleIds = new Set(visibleSales.map((sale) => sale.id));
    const visiblePaymentIds = new Set(visiblePayments.map((payment) => payment.id));
    const visibleSettlements = settlements.filter(
      (settlement) =>
        visibleSaleIds.has(settlement.saleId) &&
        visiblePaymentIds.has(settlement.paymentId),
    );
    for (const settlement of visibleSettlements) {
      saleSettled.set(
        settlement.saleId,
        (saleSettled.get(settlement.saleId) || 0n) +
          BigInt(settlement.amountPaise),
      );
      paymentSettled.set(
        settlement.paymentId,
        (paymentSettled.get(settlement.paymentId) || 0n) +
          BigInt(settlement.amountPaise),
      );
    }
    const salesById = new Map(visibleSales.map((sale) => [sale.id, sale]));
    const paymentsById = new Map(
      visiblePayments.map((payment) => [payment.id, payment]),
    );

    return serialize({
      organization,
      parties,
      periods,
      stockMovements: visibleStockMovements.map((movement) => ({
        ...movement,
        partyName: movement.partyId
          ? partyNames.get(movement.partyId) || UNKNOWN_PARTY_NAME
          : null,
      })),
      stockistEntries: visibleStockistEntries,
      sales: visibleSales.map((sale) => {
        const settledPaise = saleSettled.get(sale.id) || 0n;
        return {
          ...sale,
          partyName: partyNames.get(sale.partyId) || UNKNOWN_PARTY_NAME,
          periodLabel: sale.periodId
            ? periodLabels.get(sale.periodId) || null
            : null,
          settledPaise,
          outstandingPaise: BigInt(sale.netPayablePaise) - settledPaise,
        };
      }),
      draftSales: visibleDraftSales.map((sale) => ({
        ...sale,
        partyName: partyNames.get(sale.partyId) || UNKNOWN_PARTY_NAME,
        periodLabel: sale.periodId
          ? periodLabels.get(sale.periodId) || null
          : null,
      })),
      payments: visiblePayments.map((payment) => {
        const settledPaise = paymentSettled.get(payment.id) || 0n;
        return {
          ...payment,
          partyName: partyNames.get(payment.partyId) || UNKNOWN_PARTY_NAME,
          periodLabel: payment.periodId
            ? periodLabels.get(payment.periodId) || null
            : null,
          settledPaise,
          availablePaise: BigInt(payment.totalAmountPaise) - settledPaise,
        };
      }),
      settlements: visibleSettlements.map((settlement) => ({
        ...settlement,
        saleReference:
          salesById.get(settlement.saleId)?.reference || "Unknown sale",
        paymentReference:
          paymentsById.get(settlement.paymentId)?.reference ||
          "Unknown payment",
      })),
      ledgerEntries,
      auditEvents,
      expenseCategories,
      expenseProfiles,
      expenseBills: expenseBills.map((bill) => {
        const profile = expenseProfiles.find((item) => item.id === bill.profileId);
        const category = profile
          ? expenseCategories.find((item) => item.id === profile.categoryId)
          : null;
        return {
          ...bill,
          profileName: profile?.name || "Unknown expense",
          categoryId: profile?.categoryId || "",
          categoryName: category?.name || "Expense",
        };
      }),
      expensePayments: expensePayments.map((payment) => {
        const profile = expenseProfiles.find((item) => item.id === payment.profileId);
        const category = profile
          ? expenseCategories.find((item) => item.id === profile.categoryId)
          : null;
        return {
          ...payment,
          profileName: profile?.name || "Unknown expense",
          categoryId: profile?.categoryId || "",
          categoryName: category?.name || "Expense",
        };
      }),
      customerBills: customerBills.map((bill) => ({
        ...bill,
        partyName: partyNames.get(bill.partyId) || UNKNOWN_PARTY_NAME,
      })),
      summary,
      insights: analyzeLotterySummary(summary),
    });
  }

  async function getVerifiedSummary({ organizationId, from, to }) {
    const scopedOrganizationId = requiredText(organizationId, "organizationId");
    const occurredAt = {};
    if (from) occurredAt.gte = optionalDate(from, "from");
    if (to) occurredAt.lte = optionalDate(to, "to");
    const dateFilter = Object.keys(occurredAt).length ? { occurredAt } : {};
    const [sales, payments, stockMovements, stockistEntries, parties, clearances] = await Promise.all([
      prisma.foundationLotterySale.findMany({
        where: {
          organizationId: scopedOrganizationId,
          status: "POSTED",
          ...dateFilter,
        },
        orderBy: { occurredAt: "asc" },
      }),
      prisma.foundationLotteryPayment.findMany({
        where: {
          organizationId: scopedOrganizationId,
          status: "POSTED",
          ...dateFilter,
        },
        orderBy: { occurredAt: "asc" },
      }),
      prisma.foundationLotteryStockMovement.findMany({
        where: { organizationId: scopedOrganizationId, ...dateFilter },
        orderBy: { occurredAt: "asc" },
      }),
      prisma.foundationLotteryStockistEntry.findMany({
        where: { organizationId: scopedOrganizationId, ...dateFilter },
        orderBy: { occurredAt: "asc" },
      }),
      prisma.foundationAccountingParty.findMany({
        where: { organizationId: scopedOrganizationId, status: "ACTIVE" },
      }),
      prisma.foundationLotteryEntryClearance.findMany({
        where: { organizationId: scopedOrganizationId },
      }),
    ]);
    const visibleSales = visibleAfterClearances(clearances, sales, "SELLER");
    const visiblePayments = visibleAfterClearances(
      clearances,
      payments,
      "PAYMENT",
    );
    const visibleStockMovements = stockMovements.filter(
      (movement) =>
        !rowWasCleared(
          clearances,
          movement,
          clearanceScopeForStockMovement(movement),
        ),
    );
    const visibleStockistEntries = visibleAfterClearances(
      clearances,
      stockistEntries,
      "STOCKIST",
    );
    const effectiveEntries = effectiveStockistEntries(
      visibleStockMovements,
      visibleStockistEntries,
      parties,
    );
    const nonStockistMovements = visibleStockMovements.filter(
      (movement) =>
        !movement.partyId ||
        !new Set(["RECEIPT", "STOCKIST_RETURN"]).has(movement.movementType),
    );
    const saleInputs = visibleSales.map((sale) => {
      const input = {
        dispatchQuantity: sale.dispatchQuantity,
        returnQuantity: sale.returnQuantity,
        morningReturnQuantity: sale.morningReturnQuantity ?? 0,
        dayReturnQuantity: sale.dayReturnQuantity ?? sale.returnQuantity,
        eveningReturnQuantity: sale.eveningReturnQuantity ?? 0,
        ticketRatePaise: sale.ticketRatePaise,
        commissionPaise: sale.commissionPaise,
        tdsRateBps: sale.tdsRateBps,
      };
      const calculated = calculateLotterySale(input);
      const stored = [
        ["grossSalesPaise", sale.grossSalesPaise],
        ["commissionPaise", sale.commissionPaise],
        ["tdsPaise", sale.tdsPaise],
        ["netPayablePaise", sale.netPayablePaise],
        ["returnQuantity", sale.returnQuantity],
      ];
      if (
        stored.some(([field, value]) => calculated[field] !== String(value))
      ) {
        throw accountingError("DATA_INTEGRITY_ERROR", "sale");
      }
      return input;
    });
    return summarizeLotteryAccounting({
      sales: saleInputs,
      payments: visiblePayments.map((payment) => ({
        direction: payment.direction,
        totalAmountPaise: payment.totalAmountPaise,
        methodSplit: payment.methodSplit,
      })),
      stockMovements: [
        ...nonStockistMovements.map((movement) => ({
          type: movement.movementType,
          quantity: movement.quantity,
        })),
        ...effectiveEntries.flatMap((entry) => [
          ...(BigInt(entry.purchaseQuantity) > 0n
            ? [{ type: "RECEIPT", quantity: entry.purchaseQuantity }]
            : []),
          ...(BigInt(entry.totalReturnQuantity) > 0n
            ? [{ type: "STOCKIST_RETURN", quantity: entry.totalReturnQuantity }]
            : []),
        ]),
      ],
    });
  }

  async function analyzeVerifiedAccounting(scope) {
    const summary = await getVerifiedSummary(scope);
    return { summary, insights: analyzeLotterySummary(summary) };
  }

  return {
    analyzeVerifiedAccounting,
    clearDailyEntries,
    correctPostedSale,
    createDailySellerDraft,
    createExpenseCategory,
    createExpenseProfile,
    createOrganization,
    createParty,
    createFinancialYearPeriod,
    createPeriod,
    deleteDailySellerDraft,
    getWorkspace,
    getVerifiedSummary,
    listOrganizations,
    previewSale,
    recordCustomerBill,
    recordExpenseBill,
    recordExpensePayment,
    recordPayment,
    recordSale,
    recordSettlement,
    recordStockMovement,
    saveDailyStockistEntry,
    postDailySellerDraft,
    updateOrganizationTdsRate,
    updateUserLedgerStorage,
    updateDailySellerDraft,
    updateExpenseCategory,
    updateExpenseProfile,
    updatePartyProfile,
  };
}

module.exports = { createLotteryAccountingService, serialize };
