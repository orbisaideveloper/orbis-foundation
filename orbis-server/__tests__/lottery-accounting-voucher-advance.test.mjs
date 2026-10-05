// @vitest-environment node

import { createRequire } from "node:module";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculateLotterySeller } from "../../src/admin/models/lotteryAccountingSellerCalculation.ts";

const require = createRequire(import.meta.url);
const { calculateLotterySale, buildLotterySaleLedger } = require("../lottery-accounting-core.cjs");

function verifyAdvance(input) {
  const backend = calculateLotterySale(input);
  const frontend = calculateLotterySeller(input);
  expect(frontend.hasInvalidCommission).toBe(false);
  expect(frontend.partyPayablePaise.toString()).toBe(backend.netPayablePaise);
  expect(frontend.tdsPaise.toString()).toBe(backend.tdsPaise);
  const journal = buildLotterySaleLedger(backend);
  const signedTotal = journal.reduce((sum, line) =>
    sum + BigInt(line.amountPaise) * (line.side === "DEBIT" ? 1n : -1n), 0n);
  expect(signedTotal).toBe(0n);
  expect(journal.every((line) => BigInt(line.amountPaise) > 0n)).toBe(true);
  return { backend, journal };
}

const input = {
  dispatchQuantity: 1,
  morningReturnQuantity: 0,
  dayReturnQuantity: 0,
  eveningReturnQuantity: 0,
  ticketRatePaise: 200000,
  commissionPaise: 500000,
  tdsRateBps: 1000,
};

describe("Voucher advance compatibility", () => {
  it("keeps a 2000 bill and 5000 voucher as a 2500 advance after 500 TDS", () => {
    const { backend, journal } = verifyAdvance(input);
    expect(backend).toMatchObject({
      grossSalesPaise: "200000", tdsPaise: "50000", netPayablePaise: "-250000",
    });
    expect(journal).toContainEqual(expect.objectContaining({
      accountCode: "PARTY_RECEIVABLE", side: "CREDIT", amountPaise: "250000",
    }));
    const next = calculateLotterySale({ ...input, commissionPaise: 0,
      previousOutstandingPaise: backend.netPayablePaise });
    expect(next.currentOutstandingPaise).toBe("-50000");
  });

  it.each([0, 200, 1000, 10000])("balances excess vouchers with TDS rate %s", (tdsRateBps) => {
    verifyAdvance({ ...input, tdsRateBps });
    verifyAdvance({ ...input, dispatchQuantity: 0, tdsRateBps });
  });

  it("retains historical percentage snapshots", () => {
    const { commissionPaise, ...historical } = input;
    void commissionPaise;
    expect(calculateLotterySale({ ...historical, commissionRateBps: 500 })).toMatchObject({
      commissionPaise: "10000", tdsPaise: "1000", netPayablePaise: "191000",
    });
  });

  it("balances generated vouchers independently of the sale size", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 1000000 }),
      fc.integer({ min: 0, max: 5000000 }),
      fc.integer({ min: 0, max: 10000 }),
      (ticketRatePaise, commissionPaise, tdsRateBps) => {
        verifyAdvance({ ...input, ticketRatePaise, commissionPaise, tdsRateBps });
      },
    ), { numRuns: 300, seed: 20261004 });
  });
});
