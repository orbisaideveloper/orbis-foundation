const {
  accountingError,
  analyzeLotterySummary,
  buildLotterySaleLedger,
  calculateLotterySale,
  stockSummary,
  summarizeLotteryAccounting,
  validatePayment,
} = require("./lottery-accounting-core.cjs");

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

function requiredPositiveMoney(value, field) {
  const parsed = nonNegativeInteger(value, field);
  if (parsed === 0n) throw accountingError("PARTY_PROFILE_REQUIRED", field);
  return parsed;
}

function partyProfileFromInput(input) {
  return {
    ticketRatePaise: requiredPositiveMoney(
      input?.ticketRatePaise,
      "ticketRatePaise",
    ),
    commissionRateBps: percentageRate(
      input?.commissionRateBps,
      "commissionRateBps",
    ),
    tdsRateBps: percentageRate(input?.tdsRateBps, "tdsRateBps"),
  };
}

function partyProfileFromRow(party) {
  if (
    !party ||
    party.ticketRatePaise === null ||
    party.ticketRatePaise === undefined ||
    party.commissionRateBps === null ||
    party.commissionRateBps === undefined ||
    party.tdsRateBps === null ||
    party.tdsRateBps === undefined ||
    BigInt(party.ticketRatePaise) <= 0n
  ) {
    throw accountingError("PARTY_PROFILE_REQUIRED", "partyId");
  }
  return {
    ticketRatePaise: BigInt(party.ticketRatePaise),
    commissionRateBps: percentageRate(
      party.commissionRateBps,
      "commissionRateBps",
    ),
    tdsRateBps: percentageRate(party.tdsRateBps, "tdsRateBps"),
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

function serialize(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
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

  function saleCalculation(party, input) {
    const profile = partyProfileFromRow(party);
    return calculateLotterySale({
      ...input,
      ticketRatePaise: profile.ticketRatePaise,
      commissionRateBps: profile.commissionRateBps,
      tdsRateBps: profile.tdsRateBps,
    });
  }

  async function createOrganization(input, actorAdminId) {
    const name = requiredText(input?.name, "name");
    return prisma.$transaction(async (client) => {
      const organization = await client.foundationAccountingOrganization.create(
        {
          data: { name, status: "ACTIVE" },
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
    const profile =
      partyType === "SELLER"
        ? partyProfileFromInput(input)
        : {
            ticketRatePaise: 0n,
            commissionRateBps: 0,
            tdsRateBps: 0,
          };
    return prisma.$transaction(async (client) => {
      const party = await client.foundationAccountingParty.create({
        data: {
          organizationId,
          name,
          partyType,
          phone: input.phone?.trim() || null,
          ticketRatePaise: profile.ticketRatePaise,
          commissionRateBps: profile.commissionRateBps,
          tdsRateBps: profile.tdsRateBps,
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
            ...(partyType === "SELLER"
              ? {
                  ticketRatePaise: profile.ticketRatePaise.toString(),
                  commissionRateBps: profile.commissionRateBps,
                  tdsRateBps: profile.tdsRateBps,
                }
              : {}),
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
      if (party.partyType !== "SELLER") {
        throw accountingError("INVALID_SALE_PARTY", "partyId");
      }
      const updated = await client.foundationAccountingParty.update({
        where: { id: party.id },
        data: {
          ticketRatePaise: profile.ticketRatePaise,
          commissionRateBps: profile.commissionRateBps,
          tdsRateBps: profile.tdsRateBps,
        },
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
          eventType: "PARTY_PRICING_PROFILE_UPDATED",
          entityType: "PARTY",
          entityId: party.id,
          actorAdminId,
          metadata: {
            ticketRatePaise: profile.ticketRatePaise.toString(),
            commissionRateBps: profile.commissionRateBps,
            tdsRateBps: profile.tdsRateBps,
          },
        },
      });
      return serialize(updated);
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
      const existing = await client.foundationLotteryAccountingPeriod.findFirst(
        {
          where: { organizationId, label: period.label },
        },
      );
      if (existing) return serialize(existing);
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
      !new Set(["RECEIPT", "DISPATCH", "RETURN", "ADJUSTMENT"]).has(
        movementType,
      )
    ) {
      throw accountingError("INVALID_STOCK_TYPE", "type");
    }
    const quantity = inputBigInt(input.quantity, "quantity");
    if (quantity === 0n || (quantity < 0n && movementType !== "ADJUSTMENT")) {
      throw accountingError("INVALID_STOCK_QUANTITY", "quantity");
    }

    return prisma.$transaction(async (client) => {
      const reference = await nextReference(client, {
        organizationId,
        occurredAt,
        documentType: "STK",
        reference: suppliedReference,
      });
      const movement = await client.foundationLotteryStockMovement.create({
        data: {
          organizationId,
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
          metadata: { movementType, quantity: quantity.toString(), reference },
        },
      });
      return serialize(movement);
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

  async function createDailySellerDraft(input, actorAdminId) {
    const context = postingContext(input);
    return prisma.$transaction(async (client) => {
      const party = await ensureSellerParty(
        client,
        context.organizationId,
        context.partyId,
      );
      const calculated = saleCalculation(party, input);
      assertPositiveDispatch(calculated);
      const reference = await nextReference(client, {
        organizationId: context.organizationId,
        occurredAt: context.occurredAt,
        documentType: "SAL",
        reference: context.reference,
      });
      const sale = await client.foundationLotterySale.create({
        data: saleData({
          context,
          calculated,
          reference,
          status: "DRAFT",
          actorAdminId,
        }),
      });
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId: context.organizationId,
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
      const party = await ensureSellerParty(
        client,
        context.organizationId,
        context.partyId,
      );
      const calculated = saleCalculation(party, input);
      assertPositiveDispatch(calculated);
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
          eventType: "DAILY_SELLER_DRAFT_UPDATED",
          entityType: "SALE",
          entityId: sale.id,
          actorAdminId,
          metadata: { reference: sale.reference, calculation: calculated },
        },
      });
      return { sale: serialize(sale), calculated };
    });
  }

  async function deleteDailySellerDraft(input, actorAdminId) {
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
    const saleId = requiredText(input?.saleId, "saleId");
    return prisma.$transaction(async (client) => {
      const draft = await client.foundationLotterySale.findFirst({
        where: { id: saleId, organizationId, status: "DRAFT" },
      });
      if (!draft) throw accountingError("DRAFT_SALE_NOT_FOUND", "saleId");
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
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
    const saleId = requiredText(input?.saleId, "saleId");
    return prisma.$transaction(async (client) => {
      const draft = await client.foundationLotterySale.findFirst({
        where: { id: saleId, organizationId, status: "DRAFT" },
      });
      if (!draft) throw accountingError("DRAFT_SALE_NOT_FOUND", "saleId");
      const party = await ensureSellerParty(
        client,
        organizationId,
        draft.partyId,
      );
      const calculated = saleCalculation(party, draft);
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
        commissionRateBps: original.commissionRateBps,
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
    const context = postingContext(input);
    return prisma.$transaction(async (client) => {
      const party = await ensureSellerParty(
        client,
        context.organizationId,
        context.partyId,
      );
      const calculated = saleCalculation(party, input);
      assertPositiveDispatch(calculated);
      const reference = await nextReference(client, {
        organizationId: context.organizationId,
        occurredAt: context.occurredAt,
        documentType: "SAL",
        reference: context.reference,
      });
      const sale = await client.foundationLotterySale.create({
        data: saleData({
          context,
          calculated,
          reference,
          status: "POSTED",
          actorAdminId,
        }),
      });
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
              payment.direction === "EXPENSE"
                ? "OPERATING_EXPENSE"
                : "PARTY_RECEIVABLE",
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
    const calculated = saleCalculation(party, input);
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
      sales,
      draftSales,
      payments,
      settlements,
      ledgerEntries,
      auditEvents,
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
      getVerifiedSummary({ organizationId: scopedOrganizationId }),
    ]);

    const partyNames = new Map(parties.map((party) => [party.id, party.name]));
    const periodLabels = new Map(
      periods.map((period) => [period.id, period.label]),
    );
    const saleSettled = new Map();
    const paymentSettled = new Map();
    for (const settlement of settlements) {
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
    const salesById = new Map(sales.map((sale) => [sale.id, sale]));
    const paymentsById = new Map(
      payments.map((payment) => [payment.id, payment]),
    );

    return serialize({
      organization,
      parties,
      periods,
      stockMovements,
      sales: sales.map((sale) => {
        const settledPaise = saleSettled.get(sale.id) || 0n;
        return {
          ...sale,
          partyName: partyNames.get(sale.partyId) || "Unknown party",
          periodLabel: sale.periodId
            ? periodLabels.get(sale.periodId) || null
            : null,
          settledPaise,
          outstandingPaise: BigInt(sale.netPayablePaise) - settledPaise,
        };
      }),
      draftSales: draftSales.map((sale) => ({
        ...sale,
        partyName: partyNames.get(sale.partyId) || "Unknown party",
        periodLabel: sale.periodId
          ? periodLabels.get(sale.periodId) || null
          : null,
      })),
      payments: payments.map((payment) => {
        const settledPaise = paymentSettled.get(payment.id) || 0n;
        return {
          ...payment,
          partyName: partyNames.get(payment.partyId) || "Unknown party",
          periodLabel: payment.periodId
            ? periodLabels.get(payment.periodId) || null
            : null,
          settledPaise,
          availablePaise: BigInt(payment.totalAmountPaise) - settledPaise,
        };
      }),
      settlements: settlements.map((settlement) => ({
        ...settlement,
        saleReference:
          salesById.get(settlement.saleId)?.reference || "Unknown sale",
        paymentReference:
          paymentsById.get(settlement.paymentId)?.reference ||
          "Unknown payment",
      })),
      ledgerEntries,
      auditEvents,
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
    const [sales, payments, stockMovements] = await Promise.all([
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
    ]);
    const saleInputs = sales.map((sale) => {
      const input = {
        dispatchQuantity: sale.dispatchQuantity,
        returnQuantity: sale.returnQuantity,
        morningReturnQuantity: sale.morningReturnQuantity ?? 0,
        dayReturnQuantity: sale.dayReturnQuantity ?? sale.returnQuantity,
        eveningReturnQuantity: sale.eveningReturnQuantity ?? 0,
        ticketRatePaise: sale.ticketRatePaise,
        commissionRateBps: sale.commissionRateBps,
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
      payments: payments.map((payment) => ({
        direction: payment.direction,
        totalAmountPaise: payment.totalAmountPaise,
        methodSplit: payment.methodSplit,
      })),
      stockMovements: stockMovements.map((movement) => ({
        type: movement.movementType,
        quantity: movement.quantity,
      })),
    });
  }

  async function analyzeVerifiedAccounting(scope) {
    const summary = await getVerifiedSummary(scope);
    return { summary, insights: analyzeLotterySummary(summary) };
  }

  return {
    analyzeVerifiedAccounting,
    correctPostedSale,
    createDailySellerDraft,
    createOrganization,
    createParty,
    createFinancialYearPeriod,
    createPeriod,
    deleteDailySellerDraft,
    getWorkspace,
    getVerifiedSummary,
    listOrganizations,
    previewSale,
    recordPayment,
    recordSale,
    recordSettlement,
    recordStockMovement,
    postDailySellerDraft,
    updateDailySellerDraft,
    updatePartyProfile,
  };
}

module.exports = { createLotteryAccountingService, serialize };
