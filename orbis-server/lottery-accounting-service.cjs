const {
  accountingError,
  analyzeLotterySummary,
  buildLotterySaleLedger,
  calculateLotterySale,
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

function serialize(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
}

function createLotteryAccountingService({ prisma, now = () => new Date() }) {
  if (!prisma) throw new Error("A Prisma client is required.");

  async function ensureParty(client, organizationId, partyId) {
    const party = await client.foundationAccountingParty.findFirst({
      where: { id: partyId, organizationId, status: "ACTIVE" },
    });
    if (!party) throw accountingError("PARTY_NOT_FOUND", "partyId");
    return party;
  }

  function postingContext(input) {
    return {
      organizationId: requiredText(input?.organizationId, "organizationId"),
      partyId: requiredText(input?.partyId, "partyId"),
      reference: requiredText(input?.reference, "reference"),
      occurredAt: optionalDate(input?.occurredAt, "occurredAt", now()),
      periodId: input?.periodId || null,
    };
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
    return prisma.$transaction(async (client) => {
      const party = await client.foundationAccountingParty.create({
        data: {
          organizationId,
          name,
          partyType,
          phone: input.phone?.trim() || null,
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
          metadata: { partyType },
        },
      });
      return serialize(party);
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

  async function recordStockMovement(input, actorAdminId) {
    const organizationId = requiredText(
      input?.organizationId,
      "organizationId",
    );
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
    const occurredAt = optionalDate(input.occurredAt, "occurredAt", now());
    const reference = requiredText(input.reference, "reference");

    return prisma.$transaction(async (client) => {
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

  async function recordSale(input, actorAdminId) {
    const { organizationId, partyId, reference, occurredAt, periodId } =
      postingContext(input);
    const calculated = calculateLotterySale(input);
    const ledger = buildLotterySaleLedger(calculated);

    return prisma.$transaction(async (client) => {
      await ensureParty(client, organizationId, partyId);
      const sale = await client.foundationLotterySale.create({
        data: {
          organizationId,
          partyId,
          periodId,
          reference,
          occurredAt,
          dispatchQuantity: Number(calculated.dispatchQuantity),
          returnQuantity: Number(calculated.returnQuantity),
          netTickets: Number(calculated.netTickets),
          ticketRatePaise: asBigInt(calculated.ticketRatePaise),
          commissionRateBps: Number(calculated.commissionRateBps),
          commissionPaise: asBigInt(calculated.commissionPaise),
          tdsRateBps: Number(calculated.tdsRateBps),
          tdsPaise: asBigInt(calculated.tdsPaise),
          grossSalesPaise: asBigInt(calculated.grossSalesPaise),
          netPayablePaise: asBigInt(calculated.netPayablePaise),
          status: "POSTED",
          createdByAdminId: actorAdminId,
        },
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
      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId,
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
      const saved = await client.foundationLotteryPayment.create({
        data: {
          organizationId,
          partyId,
          periodId,
          direction: payment.direction,
          totalAmountPaise: asBigInt(payment.totalAmountPaise),
          methodSplit: payment.methodSplit,
          reference,
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
          metadata: { reference, direction: payment.direction },
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
            where: { id: saleId, organizationId },
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
    createOrganization,
    createParty,
    createPeriod,
    getVerifiedSummary,
    recordPayment,
    recordSale,
    recordSettlement,
    recordStockMovement,
  };
}

module.exports = { createLotteryAccountingService, serialize };
