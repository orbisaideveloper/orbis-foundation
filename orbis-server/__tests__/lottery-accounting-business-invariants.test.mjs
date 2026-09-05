// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildLotterySaleLedger,
  calculateLotterySale,
  stockSummary,
  validatePayment,
} = require("../lottery-accounting-core.cjs");

function sideTotal(ledger, side) {
  return ledger
    .filter((line) => line.side === side)
    .reduce((sum, line) => sum + BigInt(line.amountPaise), 0n);
}

describe("Lottery Accounting business invariants", () => {
  it.each([
    [1, 0, 0, 0, 100, 0, 0],
    [10, 1, 2, 3, 1250, 1250, 200],
    [100, 5, 10, 5, 1000, 4000, 200],
    [999, 100, 200, 300, 725, 50000, 750],
  ])(
    "keeps every sale journal balanced for dispatch=%s",
    (
      dispatchQuantity,
      morningReturnQuantity,
      dayReturnQuantity,
      eveningReturnQuantity,
      ticketRatePaise,
      commissionPaise,
      tdsRateBps,
    ) => {
      const calculated = calculateLotterySale({
        dispatchQuantity,
        morningReturnQuantity,
        dayReturnQuantity,
        eveningReturnQuantity,
        ticketRatePaise,
        commissionPaise,
        tdsRateBps,
      });
      const ledger = buildLotterySaleLedger(calculated);

      expect(sideTotal(ledger, "DEBIT")).toBe(sideTotal(ledger, "CREDIT"));
      expect(BigInt(calculated.returnQuantity)).toBe(
        BigInt(morningReturnQuantity + dayReturnQuantity + eveningReturnQuantity),
      );
      expect(BigInt(calculated.netTickets)).toBe(
        BigInt(dispatchQuantity) - BigInt(calculated.returnQuantity),
      );
      expect(BigInt(calculated.grossSalesPaise)).toBe(
        BigInt(calculated.netTickets) * BigInt(ticketRatePaise),
      );
      expect(BigInt(calculated.tdsPaise)).toBeLessThanOrEqual(
        BigInt(calculated.commissionPaise),
      );
    },
  );

  it("preserves stock conservation from receipt through seller return and stockist return", () => {
    const summary = stockSummary([
      { type: "RECEIPT", quantity: 250 },
      { type: "DISPATCH", quantity: 200 },
      { type: "RETURN", quantity: 30 },
      { type: "STOCKIST_RETURN", quantity: 20 },
      { type: "ADJUSTMENT", quantity: -5 },
    ]);

    expect(summary).toMatchObject({
      received: "250",
      dispatched: "200",
      returned: "30",
      stockistReturned: "20",
      adjustment: "-5",
      closing: "55",
    });
  });

  it("requires payment method splits to reconcile exactly to the payment total", () => {
    const payment = validatePayment({
      direction: "RECEIPT",
      totalAmountPaise: 123456,
      methodSplit: {
        cashPaise: 23456,
        bankPaise: 100000,
      },
    });
    expect(payment.totalAmountPaise).toBe("123456");

    expect(() =>
      validatePayment({
        direction: "RECEIPT",
        totalAmountPaise: 123456,
        methodSplit: {
          cashPaise: 23455,
          bankPaise: 100000,
        },
      }),
    ).toThrow("PAYMENT_SPLIT_MISMATCH");
  });

  it("rejects any stock lifecycle that would create negative physical stock", () => {
    expect(() =>
      stockSummary([
        { type: "RECEIPT", quantity: 10 },
        { type: "DISPATCH", quantity: 11 },
      ]),
    ).toThrow("NEGATIVE_STOCK");
  });
});
