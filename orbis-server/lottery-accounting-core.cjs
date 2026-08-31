const MONEY_UNIT = "PAISE";
const RATE_UNIT = "BASIS_POINTS";
const MAX_RATE_BPS = 10_000n;

function accountingError(code, field) {
  const error = new Error(code);
  error.code = code;
  error.field = field;
  return error;
}

function integer(value, field, { allowNegative = false } = {}) {
  let parsed;
  try {
    if (typeof value === "bigint") parsed = value;
    else if (typeof value === "number" && Number.isSafeInteger(value)) {
      parsed = BigInt(value);
    } else if (typeof value === "string" && /^-?\d+$/.test(value)) {
      parsed = BigInt(value);
    } else {
      throw new Error("INVALID");
    }
  } catch {
    throw accountingError("INVALID_INTEGER", field);
  }
  if (!allowNegative && parsed < 0n) {
    throw accountingError("NEGATIVE_VALUE", field);
  }
  return parsed;
}

function rate(value, field) {
  const parsed = integer(value, field);
  if (parsed > MAX_RATE_BPS) throw accountingError("RATE_OUT_OF_RANGE", field);
  return parsed;
}

function roundedBasisPoints(amount, basisPoints) {
  return (amount * basisPoints + 5_000n) / 10_000n;
}

function returnBreakdown(input, dispatchQuantity) {
  const hasTimedReturn = [
    "morningReturnQuantity",
    "dayReturnQuantity",
    "eveningReturnQuantity",
  ].some((field) => input[field] !== undefined);
  if (!hasTimedReturn) {
    const returnQuantity = integer(input.returnQuantity ?? 0, "returnQuantity");
    if (returnQuantity > dispatchQuantity) {
      throw accountingError("RETURN_EXCEEDS_DISPATCH", "returnQuantity");
    }
    return {
      morningReturnQuantity: 0n,
      dayReturnQuantity: returnQuantity,
      eveningReturnQuantity: 0n,
      returnQuantity,
    };
  }

  const morningReturnQuantity = integer(
    input.morningReturnQuantity ?? 0,
    "morningReturnQuantity",
  );
  const dayReturnQuantity = integer(
    input.dayReturnQuantity ?? 0,
    "dayReturnQuantity",
  );
  const eveningReturnQuantity = integer(
    input.eveningReturnQuantity ?? 0,
    "eveningReturnQuantity",
  );
  const returnQuantity =
    morningReturnQuantity + dayReturnQuantity + eveningReturnQuantity;
  if (returnQuantity > dispatchQuantity) {
    throw accountingError("RETURN_EXCEEDS_DISPATCH", "returnQuantity");
  }
  if (
    input.returnQuantity !== undefined &&
    integer(input.returnQuantity, "returnQuantity") !== returnQuantity
  ) {
    throw accountingError("RETURN_TOTAL_MISMATCH", "returnQuantity");
  }
  return {
    morningReturnQuantity,
    dayReturnQuantity,
    eveningReturnQuantity,
    returnQuantity,
  };
}

function calculateLotterySale(input) {
  if (!input || typeof input !== "object") {
    throw accountingError("INVALID_SALE", "sale");
  }
  const dispatchQuantity = integer(input.dispatchQuantity, "dispatchQuantity");
  const returns = returnBreakdown(input, dispatchQuantity);
  const ticketRatePaise = integer(input.ticketRatePaise, "ticketRatePaise");
  const commissionRateBps = rate(input.commissionRateBps, "commissionRateBps");
  const tdsRateBps = rate(input.tdsRateBps, "tdsRateBps");
  const previousOutstandingPaise = integer(
    input.previousOutstandingPaise ?? 0,
    "previousOutstandingPaise",
    { allowNegative: true },
  );
  const netTickets = dispatchQuantity - returns.returnQuantity;
  const grossSalesPaise = netTickets * ticketRatePaise;
  const commissionPaise = roundedBasisPoints(
    grossSalesPaise,
    commissionRateBps,
  );
  const tdsPaise = roundedBasisPoints(commissionPaise, tdsRateBps);
  // TDS is withheld from the commission, not charged again on top of it.
  // Example: ₹1,000 gross − ₹100 commission + ₹2 TDS = ₹902 payable.
  const netPayablePaise = grossSalesPaise - commissionPaise + tdsPaise;
  const currentOutstandingPaise = previousOutstandingPaise + netPayablePaise;

  return Object.freeze({
    moneyUnit: MONEY_UNIT,
    rateUnit: RATE_UNIT,
    dispatchQuantity: dispatchQuantity.toString(),
    morningReturnQuantity: returns.morningReturnQuantity.toString(),
    dayReturnQuantity: returns.dayReturnQuantity.toString(),
    eveningReturnQuantity: returns.eveningReturnQuantity.toString(),
    returnQuantity: returns.returnQuantity.toString(),
    netTickets: netTickets.toString(),
    ticketRatePaise: ticketRatePaise.toString(),
    commissionRateBps: commissionRateBps.toString(),
    tdsRateBps: tdsRateBps.toString(),
    grossSalesPaise: grossSalesPaise.toString(),
    commissionPaise: commissionPaise.toString(),
    tdsPaise: tdsPaise.toString(),
    netPayablePaise: netPayablePaise.toString(),
    previousOutstandingPaise: previousOutstandingPaise.toString(),
    currentOutstandingPaise: currentOutstandingPaise.toString(),
  });
}

function buildLotterySaleLedger(calculatedSale) {
  const netPayable = integer(calculatedSale.netPayablePaise, "netPayablePaise");
  const commission = integer(calculatedSale.commissionPaise, "commissionPaise");
  const tds = integer(calculatedSale.tdsPaise, "tdsPaise");
  const gross = integer(calculatedSale.grossSalesPaise, "grossSalesPaise");
  const entries = [
    { accountCode: "PARTY_RECEIVABLE", side: "DEBIT", amountPaise: netPayable },
    {
      accountCode: "COMMISSION_EXPENSE",
      side: "DEBIT",
      amountPaise: commission,
    },
    { accountCode: "TDS_PAYABLE", side: "CREDIT", amountPaise: tds },
    { accountCode: "LOTTERY_SALES", side: "CREDIT", amountPaise: gross },
  ].filter((entry) => entry.amountPaise > 0n);
  const debit = entries
    .filter((entry) => entry.side === "DEBIT")
    .reduce((total, entry) => total + entry.amountPaise, 0n);
  const credit = entries
    .filter((entry) => entry.side === "CREDIT")
    .reduce((total, entry) => total + entry.amountPaise, 0n);
  if (debit !== credit) throw accountingError("UNBALANCED_LEDGER", "ledger");
  return Object.freeze(
    entries.map((entry, index) =>
      Object.freeze({
        lineNumber: index + 1,
        accountCode: entry.accountCode,
        side: entry.side,
        amountPaise: entry.amountPaise.toString(),
      }),
    ),
  );
}

function validatePayment(input) {
  if (!input || typeof input !== "object") {
    throw accountingError("INVALID_PAYMENT", "payment");
  }
  const totalAmountPaise = integer(input.totalAmountPaise, "totalAmountPaise");
  if (totalAmountPaise === 0n) {
    throw accountingError("ZERO_PAYMENT", "totalAmountPaise");
  }
  const split = input.methodSplit || {};
  const methodSplit = {
    cashPaise: integer(split.cashPaise ?? 0, "methodSplit.cashPaise"),
    bankPaise: integer(split.bankPaise ?? 0, "methodSplit.bankPaise"),
    upiPaise: integer(split.upiPaise ?? 0, "methodSplit.upiPaise"),
    chequePaise: integer(split.chequePaise ?? 0, "methodSplit.chequePaise"),
    pwtPaise: integer(split.pwtPaise ?? 0, "methodSplit.pwtPaise"),
  };
  const splitTotal = Object.values(methodSplit).reduce(
    (total, amount) => total + amount,
    0n,
  );
  if (splitTotal !== totalAmountPaise) {
    throw accountingError("PAYMENT_SPLIT_MISMATCH", "methodSplit");
  }
  const direction = String(input.direction || "").toUpperCase();
  if (!new Set(["RECEIPT", "PAYMENT", "EXPENSE"]).has(direction)) {
    throw accountingError("INVALID_PAYMENT_DIRECTION", "direction");
  }
  return Object.freeze({
    direction,
    totalAmountPaise: totalAmountPaise.toString(),
    methodSplit: Object.freeze(
      Object.fromEntries(
        Object.entries(methodSplit).map(([key, value]) => [
          key,
          value.toString(),
        ]),
      ),
    ),
  });
}

function stockSummary(movements = []) {
  const totals = { RECEIPT: 0n, DISPATCH: 0n, RETURN: 0n, ADJUSTMENT: 0n };
  for (const movement of movements) {
    const type = String(movement.type || "").toUpperCase();
    if (!(type in totals)) throw accountingError("INVALID_STOCK_TYPE", "type");
    totals[type] += integer(movement.quantity, "quantity", {
      allowNegative: type === "ADJUSTMENT",
    });
  }
  const closing =
    totals.RECEIPT - totals.DISPATCH + totals.RETURN + totals.ADJUSTMENT;
  if (closing < 0n) throw accountingError("NEGATIVE_STOCK", "stock");
  return Object.freeze({
    received: totals.RECEIPT.toString(),
    dispatched: totals.DISPATCH.toString(),
    returned: totals.RETURN.toString(),
    adjustment: totals.ADJUSTMENT.toString(),
    closing: closing.toString(),
  });
}

function summarizeLotteryAccounting({
  sales = [],
  payments = [],
  stockMovements = [],
}) {
  const calculatedSales = sales.map(calculateLotterySale);
  const checkedPayments = payments.map(validatePayment);
  const total = (items, field) =>
    items.reduce((sum, item) => sum + BigInt(item[field]), 0n);
  const grossSales = total(calculatedSales, "grossSalesPaise");
  const commission = total(calculatedSales, "commissionPaise");
  const tds = total(calculatedSales, "tdsPaise");
  const netPayable = total(calculatedSales, "netPayablePaise");
  const receipts = checkedPayments
    .filter((payment) => payment.direction === "RECEIPT")
    .reduce((sum, payment) => sum + BigInt(payment.totalAmountPaise), 0n);
  const outgoing = checkedPayments
    .filter((payment) => payment.direction !== "RECEIPT")
    .reduce((sum, payment) => sum + BigInt(payment.totalAmountPaise), 0n);
  const expenses = checkedPayments
    .filter((payment) => payment.direction === "EXPENSE")
    .reduce((sum, payment) => sum + BigInt(payment.totalAmountPaise), 0n);
  const outstanding = netPayable - receipts;
  const operatingResult = netPayable - expenses;
  const anomalies = [];
  if (outstanding < 0n) anomalies.push("COLLECTION_EXCEEDS_NET_PAYABLE");
  if (grossSales > 0n && commission * 100n > grossSales * 25n) {
    anomalies.push("COMMISSION_ABOVE_25_PERCENT");
  }

  return Object.freeze({
    verified: true,
    moneyUnit: MONEY_UNIT,
    salesCount: calculatedSales.length,
    paymentCount: checkedPayments.length,
    grossSalesPaise: grossSales.toString(),
    commissionPaise: commission.toString(),
    tdsPaise: tds.toString(),
    netPayablePaise: netPayable.toString(),
    collectedPaise: receipts.toString(),
    outgoingPaise: outgoing.toString(),
    expensePaise: expenses.toString(),
    outstandingPaise: outstanding.toString(),
    operatingResultPaise: operatingResult.toString(),
    netCashFlowPaise: (receipts - outgoing).toString(),
    stock: stockSummary(stockMovements),
    anomalies: Object.freeze(anomalies),
  });
}

function analyzeLotterySummary(summary) {
  if (!summary?.verified) {
    throw accountingError("UNVERIFIED_SUMMARY", "summary");
  }
  const outstanding = BigInt(summary.outstandingPaise);
  const operatingResult = BigInt(summary.operatingResultPaise);
  return Object.freeze([
    Object.freeze({
      skill: "profit-loss",
      status: operatingResult >= 0n ? "POSITIVE" : "NEGATIVE",
      amountPaise: operatingResult.toString(),
      sourceFields: ["netPayablePaise", "expensePaise"],
    }),
    Object.freeze({
      skill: "outstanding-dues",
      status: outstanding > 0n ? "DUE" : outstanding < 0n ? "CREDIT" : "CLEAR",
      amountPaise: outstanding.toString(),
      sourceFields: ["netPayablePaise", "collectedPaise"],
    }),
    Object.freeze({
      skill: "anomaly-review",
      status: summary.anomalies.length ? "ATTENTION" : "CLEAR",
      findings: [...summary.anomalies],
      sourceFields: ["anomalies"],
    }),
    Object.freeze({
      skill: "tax-commission",
      status: "VERIFIED",
      commissionPaise: summary.commissionPaise,
      tdsPaise: summary.tdsPaise,
      sourceFields: ["grossSalesPaise", "commissionPaise", "tdsPaise"],
    }),
  ]);
}

function runLotteryCoreVerification() {
  try {
    const sale = calculateLotterySale({
      dispatchQuantity: 100,
      morningReturnQuantity: 5,
      dayReturnQuantity: 10,
      eveningReturnQuantity: 5,
      ticketRatePaise: 1_000,
      commissionRateBps: 500,
      tdsRateBps: 1_000,
    });
    const ledger = buildLotterySaleLedger(sale);
    const summary = summarizeLotteryAccounting({
      sales: [
        {
          dispatchQuantity: 100,
          morningReturnQuantity: 5,
          dayReturnQuantity: 10,
          eveningReturnQuantity: 5,
          ticketRatePaise: 1_000,
          commissionRateBps: 500,
          tdsRateBps: 1_000,
        },
      ],
      payments: [
        {
          direction: "RECEIPT",
          totalAmountPaise: 50_000,
          methodSplit: { cashPaise: 30_000, upiPaise: 20_000 },
        },
      ],
      stockMovements: [
        { type: "RECEIPT", quantity: 120 },
        { type: "DISPATCH", quantity: 100 },
        { type: "RETURN", quantity: 20 },
      ],
    });
    const checks = [
      ["net tickets", sale.netTickets === "80"],
      ["gross sales", sale.grossSalesPaise === "80000"],
      ["commission", sale.commissionPaise === "4000"],
      ["TDS", sale.tdsPaise === "400"],
      ["timed returns", sale.returnQuantity === "20"],
      ["net payable", sale.netPayablePaise === "76400"],
      ["balanced ledger", ledger.length === 4],
      ["outstanding", summary.outstandingPaise === "26400"],
      ["closing stock", summary.stock.closing === "40"],
      ["read-only AI skills", analyzeLotterySummary(summary).length === 4],
    ].map(([name, passed]) => ({ name, passed }));
    return Object.freeze({
      status: checks.every((check) => check.passed) ? "PASSED" : "FAILED",
      checks: Object.freeze(checks),
      canonicalSummary: summary,
    });
  } catch (error) {
    return Object.freeze({
      status: "FAILED",
      checks: Object.freeze([
        {
          name: "core execution",
          passed: false,
          code: error.code || "UNKNOWN",
        },
      ]),
      canonicalSummary: null,
    });
  }
}

module.exports = {
  MONEY_UNIT,
  RATE_UNIT,
  accountingError,
  analyzeLotterySummary,
  buildLotterySaleLedger,
  calculateLotterySale,
  runLotteryCoreVerification,
  stockSummary,
  summarizeLotteryAccounting,
  validatePayment,
};
