import { describe, expect, it } from "vitest";
import {
  calculateLotterySeller,
  roundedBasisPoints,
  sumLotterySellerCalculations,
} from "../lotteryAccountingSellerCalculation";

const validInput = {
  dispatchQuantity: "100",
  morningReturnQuantity: "5",
  dayReturnQuantity: "10",
  eveningReturnQuantity: "5",
  ticketRatePaise: "1000",
  commissionPaise: "4000",
  tdsRateBps: 1000,
};

describe("lotteryAccountingSellerCalculation", () => {
  it("calculates one seller with exact integer paise and return invariants", () => {
    expect(calculateLotterySeller(validInput)).toEqual({
      dispatch: 100n,
      morningReturn: 5n,
      dayReturn: 10n,
      eveningReturn: 5n,
      totalReturn: 20n,
      netSale: 80n,
      grossAmountPaise: 80000n,
      commissionPaise: 4000n,
      tdsPaise: 400n,
      partyPayablePaise: 76400n,
      hasInvalidReturn: false,
      hasInvalidCommission: false,
    });
  });

  it("blocks a return above dispatch and a commission above net amount", () => {
    const invalidReturn = calculateLotterySeller({
      ...validInput,
      dispatchQuantity: 10,
      morningReturnQuantity: 6,
      dayReturnQuantity: 5,
      eveningReturnQuantity: 0,
    });
    expect(invalidReturn.hasInvalidReturn).toBe(true);
    expect(invalidReturn.netSale).toBe(0n);
    expect(invalidReturn.grossAmountPaise).toBe(0n);

    const invalidCommission = calculateLotterySeller({
      ...validInput,
      commissionPaise: "90000",
    });
    expect(invalidCommission.hasInvalidCommission).toBe(true);
    expect(invalidCommission.tdsPaise).toBe(0n);
    expect(invalidCommission.partyPayablePaise).toBe(0n);
  });

  it("normalizes malformed natural-number inputs to zero and rounds basis points deterministically", () => {
    const result = calculateLotterySeller({
      ...validInput,
      dispatchQuantity: "12.5",
      morningReturnQuantity: "bad",
      ticketRatePaise: "bad",
      commissionPaise: "bad",
    });
    expect(result.dispatch).toBe(0n);
    expect(result.morningReturn).toBe(0n);
    expect(result.grossAmountPaise).toBe(0n);
    expect(result.commissionPaise).toBe(0n);
    expect(roundedBasisPoints(105n, 500)).toBe(5n);
  });

  it("sums the same shared calculations used by row and daily totals", () => {
    const first = calculateLotterySeller(validInput);
    const second = calculateLotterySeller({
      ...validInput,
      dispatchQuantity: "50",
      morningReturnQuantity: "2",
      dayReturnQuantity: "3",
      eveningReturnQuantity: "5",
      commissionPaise: "2000",
    });
    expect(sumLotterySellerCalculations([first, second])).toEqual({
      dispatch: 150n,
      morningReturn: 7n,
      dayReturn: 13n,
      eveningReturn: 10n,
      totalReturn: 30n,
      netSale: 120n,
      grossAmountPaise: 120000n,
      commissionPaise: 6000n,
      tdsPaise: 600n,
      partyPayablePaise: 114600n,
    });
  });
});
