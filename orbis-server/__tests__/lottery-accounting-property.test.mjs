// @vitest-environment node

import { createRequire } from "node:module";
import fc from "fast-check";
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

const validSaleArbitrary = fc
  .record({
    dispatchQuantity: fc.integer({ min: 1, max: 5_000 }),
    morningRaw: fc.nat(10_000),
    dayRaw: fc.nat(10_000),
    eveningRaw: fc.nat(10_000),
    ticketRatePaise: fc.integer({ min: 1, max: 50_000 }),
    commissionBps: fc.integer({ min: 0, max: 5_000 }),
    tdsRateBps: fc.integer({ min: 0, max: 10_000 }),
  })
  .map((input) => {
    let remaining = input.dispatchQuantity;
    const morningReturnQuantity = input.morningRaw % (remaining + 1);
    remaining -= morningReturnQuantity;
    const dayReturnQuantity = input.dayRaw % (remaining + 1);
    remaining -= dayReturnQuantity;
    const eveningReturnQuantity = input.eveningRaw % (remaining + 1);

    const netTickets =
      input.dispatchQuantity -
      morningReturnQuantity -
      dayReturnQuantity -
      eveningReturnQuantity;
    const grossSalesPaise = netTickets * input.ticketRatePaise;
    const commissionPaise = Math.floor(
      (grossSalesPaise * input.commissionBps) / 10_000,
    );

    return {
      dispatchQuantity: input.dispatchQuantity,
      morningReturnQuantity,
      dayReturnQuantity,
      eveningReturnQuantity,
      ticketRatePaise: input.ticketRatePaise,
      commissionPaise,
      tdsRateBps: input.tdsRateBps,
    };
  });

describe("Lottery Accounting property-based controls", () => {
  it("keeps accounting identities and double-entry balance for generated valid sales", () => {
    fc.assert(
      fc.property(validSaleArbitrary, (input) => {
        const calculated = calculateLotterySale(input);
        const ledger = buildLotterySaleLedger(calculated);

        expect(sideTotal(ledger, "DEBIT")).toBe(sideTotal(ledger, "CREDIT"));
        expect(BigInt(calculated.returnQuantity)).toBe(
          BigInt(
            input.morningReturnQuantity +
              input.dayReturnQuantity +
              input.eveningReturnQuantity,
          ),
        );
        expect(BigInt(calculated.grossSalesPaise)).toBe(
          BigInt(calculated.netTickets) * BigInt(input.ticketRatePaise),
        );
        expect(BigInt(calculated.netPayablePaise)).toBeGreaterThanOrEqual(0n);
      }),
      { numRuns: 300, seed: 2837 },
    );
  });

  it("keeps stock conservation for generated valid stock lifecycles", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50_000 }),
        fc.nat(50_000),
        fc.nat(50_000),
        fc.nat(50_000),
        (receipt, dispatchRaw, returnRaw, stockistReturnRaw) => {
          const dispatch = dispatchRaw % (receipt + 1);
          const sellerReturn = returnRaw % (dispatch + 1);
          const stockistReturn = stockistReturnRaw % (sellerReturn + 1);
          const result = stockSummary([
            { type: "RECEIPT", quantity: receipt },
            { type: "DISPATCH", quantity: dispatch },
            { type: "RETURN", quantity: sellerReturn },
            { type: "STOCKIST_RETURN", quantity: stockistReturn },
          ]);
          expect(BigInt(result.closing)).toBe(
            BigInt(receipt - dispatch + sellerReturn - stockistReturn),
          );
        },
      ),
      { numRuns: 300, seed: 2837 },
    );
  });

  it("accepts every generated payment whose split equals its total", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        (cashPaise, bankPaise) => {
          fc.pre(cashPaise + bankPaise > 0);
          const totalAmountPaise = cashPaise + bankPaise;
          const result = validatePayment({
            direction: "RECEIPT",
            totalAmountPaise,
            methodSplit: { cashPaise, bankPaise },
          });
          expect(result.totalAmountPaise).toBe(String(totalAmountPaise));
        },
      ),
      { numRuns: 300, seed: 2837 },
    );
  });
});
