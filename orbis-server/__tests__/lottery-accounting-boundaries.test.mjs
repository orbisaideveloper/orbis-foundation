// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  calculateLotterySale, buildLotterySaleLedger,
  validatePayment, summarizeLotteryAccounting,
} = require("../lottery-accounting-core.cjs");

const input = {
  dispatchQuantity: 2, ticketRatePaise: 100,
  commissionPaise: 0, tdsRateBps: 0,
};

describe("Accounting financial boundary protection", () => {
  it.each([
    true, null, {}, [], "", "1x", "x1", "1.0", " 1",
    Number.MAX_SAFE_INTEGER + 1, NaN, Infinity,
  ])("rejects non-exact quantities %#", (value) => {
    expect(() => calculateLotterySale({
      ...input, dispatchQuantity: value,
    })).toThrow("INVALID_INTEGER");
  });

  it("retains exact bigint, units and advance balance", () => {
    expect(calculateLotterySale({
      ...input, dispatchQuantity: 2n,
      previousOutstandingPaise: "-300",
    })).toMatchObject({
      moneyUnit: "PAISE", rateUnit: "BASIS_POINTS",
      grossSalesPaise: "200", currentOutstandingPaise: "-100",
    });
  });

  it("rejects rates above 100 percent and accepts the boundary", () => {
    expect(() => calculateLotterySale({
      ...input, tdsRateBps: 10001,
    })).toThrow("RATE_OUT_OF_RANGE");
    expect(calculateLotterySale({
      ...input, commissionPaise: 100, tdsRateBps: 10000,
    }).tdsPaise).toBe("100");
  });

  it("accepts full legacy returns and rejects excess returns", () => {
    expect(calculateLotterySale({
      ...input, returnQuantity: 2,
    })).toMatchObject({ netTickets: "0", grossSalesPaise: "0" });
    expect(() => calculateLotterySale({
      ...input, returnQuantity: 3,
    })).toThrow("RETURN_EXCEEDS_DISPATCH");
  });

  it("handles a single timed return without losing it", () => {
    expect(calculateLotterySale({
      ...input, morningReturnQuantity: 1,
    })).toMatchObject({
      morningReturnQuantity: "1", dayReturnQuantity: "0",
      eveningReturnQuantity: "0", returnQuantity: "1",
      grossSalesPaise: "100",
    });
  });

  it("rejects inconsistent ledger amounts and numbers lines correctly", () => {
    const sale = calculateLotterySale(input);
    expect(buildLotterySaleLedger(sale)).toEqual([
      { lineNumber: 1, accountCode: "PARTY_RECEIVABLE",
        side: "DEBIT", amountPaise: "200" },
      { lineNumber: 2, accountCode: "LOTTERY_SALES",
        side: "CREDIT", amountPaise: "200" },
    ]);
    expect(() => buildLotterySaleLedger({
      ...sale, netPayablePaise: "201",
    })).toThrow("UNBALANCED_LEDGER");
  });

  it("retains PWT separately from cash and validates split fields", () => {
    expect(validatePayment({
      direction: "RECEIPT", totalAmountPaise: 500000,
      methodSplit: { pwtPaise: 60000, cashPaise: 440000 },
    })).toMatchObject({
      totalAmountPaise: "500000",
      methodSplit: {
        pwtPaise: "60000", cashPaise: "440000",
        bankPaise: "0", upiPaise: "0", chequePaise: "0",
      },
    });
    for (const field of [
      "cashPaise", "bankPaise", "upiPaise", "chequePaise", "pwtPaise",
    ]) {
      expect(() => validatePayment({
        direction: "RECEIPT", totalAmountPaise: 1,
        methodSplit: { [field]: -1 },
      })).toThrow("NEGATIVE_VALUE");
    }
  });

  it("keeps customer dues, outgoing payments and profit distinct", () => {
    const payment = (direction, amount) => ({
      direction, totalAmountPaise: amount,
      methodSplit: { cashPaise: amount },
    });
    expect(summarizeLotteryAccounting({
      sales: [input],
      customerBills: [{ amountPaise: "300" }],
      payments: [
        payment("RECEIPT", 100),
        payment("PAYMENT", 20),
        payment("EXPENSE", 30),
      ],
    })).toMatchObject({
      collectedPaise: "100", outgoingPaise: "50",
      expensePaise: "30", outstandingPaise: "400",
      operatingResultPaise: "470", netCashFlowPaise: "50",
    });
  });
});
