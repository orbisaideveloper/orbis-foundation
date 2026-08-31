// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  analyzeLotterySummary,
  buildLotterySaleLedger,
  calculateLotterySale,
  runLotteryCoreVerification,
  stockSummary,
  summarizeLotteryAccounting,
  validatePayment,
} = require("../lottery-accounting-core.cjs");

const saleInput = {
  dispatchQuantity: 100,
  morningReturnQuantity: 5,
  dayReturnQuantity: 10,
  eveningReturnQuantity: 5,
  ticketRatePaise: 1_000,
  commissionRateBps: 500,
  tdsRateBps: 1_000,
};

describe("Lottery Accounting Core", () => {
  it("calculates exact paise values and a balanced immutable ledger", () => {
    const sale = calculateLotterySale({
      ...saleInput,
      previousOutstandingPaise: "100",
    });
    expect(sale).toMatchObject({
      netTickets: "80",
      morningReturnQuantity: "5",
      dayReturnQuantity: "10",
      eveningReturnQuantity: "5",
      returnQuantity: "20",
      grossSalesPaise: "80000",
      commissionPaise: "4000",
      tdsPaise: "400",
      netPayablePaise: "76400",
      currentOutstandingPaise: "76500",
    });
    expect(Object.isFrozen(sale)).toBe(true);
    const ledger = buildLotterySaleLedger(sale);
    expect(ledger).toEqual([
      expect.objectContaining({
        accountCode: "PARTY_RECEIVABLE",
        side: "DEBIT",
        amountPaise: "76400",
      }),
      expect.objectContaining({
        accountCode: "COMMISSION_EXPENSE",
        side: "DEBIT",
        amountPaise: "4000",
      }),
      expect.objectContaining({
        accountCode: "TDS_PAYABLE",
        side: "CREDIT",
        amountPaise: "400",
      }),
      expect.objectContaining({
        accountCode: "LOTTERY_SALES",
        side: "CREDIT",
        amountPaise: "80000",
      }),
    ]);
    expect(Object.isFrozen(ledger)).toBe(true);
  });

  it("withholds TDS only from commission before calculating party payable", () => {
    const sale = calculateLotterySale({
      dispatchQuantity: 1,
      morningReturnQuantity: 0,
      dayReturnQuantity: 0,
      eveningReturnQuantity: 0,
      ticketRatePaise: 100_000,
      commissionRateBps: 1_000,
      tdsRateBps: 200,
    });
    expect(sale).toMatchObject({
      grossSalesPaise: "100000",
      commissionPaise: "10000",
      tdsPaise: "200",
      netPayablePaise: "90200",
    });
    expect(buildLotterySaleLedger(sale)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountCode: "TDS_PAYABLE",
          side: "CREDIT",
          amountPaise: "200",
        }),
      ]),
    );
  });

  it.each([
    [null, "INVALID_SALE"],
    [{ ...saleInput, dispatchQuantity: 1.5 }, "INVALID_INTEGER"],
    [{ ...saleInput, morningReturnQuantity: 101 }, "RETURN_EXCEEDS_DISPATCH"],
    [{ ...saleInput, returnQuantity: 99 }, "RETURN_TOTAL_MISMATCH"],
    [{ ...saleInput, commissionRateBps: 10_001 }, "RATE_OUT_OF_RANGE"],
    [{ ...saleInput, ticketRatePaise: -1 }, "NEGATIVE_VALUE"],
  ])("rejects invalid sale input %#", (input, code) => {
    expect(() => calculateLotterySale(input)).toThrow(code);
  });

  it("validates payment direction, exact split and positive total", () => {
    expect(
      validatePayment({
        direction: "receipt",
        totalAmountPaise: 500,
        methodSplit: { cashPaise: 200, upiPaise: 300 },
      }),
    ).toMatchObject({ direction: "RECEIPT", totalAmountPaise: "500" });
    expect(() => validatePayment(null)).toThrow("INVALID_PAYMENT");
    expect(() =>
      validatePayment({ direction: "RECEIPT", totalAmountPaise: 0 }),
    ).toThrow("ZERO_PAYMENT");
    expect(() =>
      validatePayment({
        direction: "OTHER",
        totalAmountPaise: 1,
        methodSplit: { cashPaise: 1 },
      }),
    ).toThrow("INVALID_PAYMENT_DIRECTION");
    expect(() =>
      validatePayment({
        direction: "RECEIPT",
        totalAmountPaise: 2,
        methodSplit: { cashPaise: 1 },
      }),
    ).toThrow("PAYMENT_SPLIT_MISMATCH");
  });

  it("summarizes stock, cash, dues, expenses and read-only AI findings", () => {
    const summary = summarizeLotteryAccounting({
      sales: [saleInput],
      payments: [
        {
          direction: "RECEIPT",
          totalAmountPaise: 50_000,
          methodSplit: { cashPaise: 50_000 },
        },
        {
          direction: "EXPENSE",
          totalAmountPaise: 6_000,
          methodSplit: { bankPaise: 6_000 },
        },
      ],
      stockMovements: [
        { type: "RECEIPT", quantity: 120 },
        { type: "DISPATCH", quantity: 100 },
        { type: "RETURN", quantity: 20 },
        { type: "ADJUSTMENT", quantity: -1 },
      ],
    });
    expect(summary).toMatchObject({
      verified: true,
      outstandingPaise: "26400",
      operatingResultPaise: "70400",
      netCashFlowPaise: "44000",
      stock: { closing: "39" },
    });
    expect(analyzeLotterySummary(summary)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill: "profit-loss", status: "POSITIVE" }),
        expect.objectContaining({ skill: "outstanding-dues", status: "DUE" }),
        expect.objectContaining({ skill: "anomaly-review", status: "CLEAR" }),
      ]),
    );
  });

  it("flags over-collection, high commission and credit/negative outcomes", () => {
    const summary = summarizeLotteryAccounting({
      sales: [{ ...saleInput, commissionRateBps: 3_000 }],
      payments: [
        {
          direction: "RECEIPT",
          totalAmountPaise: 100_000,
          methodSplit: { bankPaise: 100_000 },
        },
        {
          direction: "EXPENSE",
          totalAmountPaise: 100_000,
          methodSplit: { cashPaise: 100_000 },
        },
      ],
    });
    expect(summary.anomalies).toEqual([
      "COLLECTION_EXCEEDS_NET_PAYABLE",
      "COMMISSION_ABOVE_25_PERCENT",
    ]);
    expect(analyzeLotterySummary(summary)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill: "profit-loss", status: "NEGATIVE" }),
        expect.objectContaining({
          skill: "outstanding-dues",
          status: "CREDIT",
        }),
        expect.objectContaining({
          skill: "anomaly-review",
          status: "ATTENTION",
        }),
      ]),
    );
    expect(() => analyzeLotterySummary({ verified: false })).toThrow(
      "UNVERIFIED_SUMMARY",
    );
  });

  it("rejects invalid or negative stock and passes the canonical review", () => {
    expect(stockSummary([])).toMatchObject({ closing: "0" });
    expect(() => stockSummary([{ type: "UNKNOWN", quantity: 1 }])).toThrow(
      "INVALID_STOCK_TYPE",
    );
    expect(() => stockSummary([{ type: "DISPATCH", quantity: 1 }])).toThrow(
      "NEGATIVE_STOCK",
    );
    expect(runLotteryCoreVerification()).toMatchObject({ status: "PASSED" });
  });
});
