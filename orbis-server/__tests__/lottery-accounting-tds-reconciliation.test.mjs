// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { lotteryPeriodTds, reconcileLotteryTds as uiReconcile } from "../../src/admin/models/lotteryAccountingTdsReconciliation.ts";
const require = createRequire(import.meta.url);
const { reconcileLotteryTds } = require("../accounting-tds-reconciliation.cjs");
const { summarizeLotteryAccounting } = require("../lottery-accounting-core.cjs");

const saleInput = { dispatchQuantity: 20, returnQuantity: 0, ticketRatePaise: "10000",
  commissionPaise: "50000", tdsRateBps: 1000 };

describe("TDS reconciliation without changing financial snapshots", () => {
  it("separates payable, credit and legacy tax; difference is not profit", () => {
    const stockistEntries = [
      { source: "DAILY", grossPurchasePaise: "170000", commissionPaise: "20000", tdsPaise: "2000" },
      { source: "LEGACY", grossPurchasePaise: "10000", commissionPaise: "1000", tdsPaise: "900" },
    ];
    const before = structuredClone(stockistEntries);
    const summary = summarizeLotteryAccounting({ sales: [saleInput], stockistEntries });
    expect(summary.tdsReconciliation).toEqual({ generatedPayablePaise: "5000", recordedCreditPaise: "2000",
      legacyUnclassifiedPaise: "900", comparisonDifferencePaise: "3000", settlementStatus: "NOT_RECORDED" });
    expect(summary.tdsPaise).toBe("5000"); // backward compatible seller total
    expect(summary.operatingResultPaise).toBe("-9000");
    expect(stockistEntries).toEqual(before);
    const changedTax = stockistEntries.map((row) => ({ ...row, tdsPaise: "900000" }));
    expect(summarizeLotteryAccounting({ sales: [saleInput], stockistEntries: changedTax }).operatingResultPaise)
      .toBe(summary.operatingResultPaise);
  });

  it("excludes draft/reversed seller amounts and never assumes an unknown stockist source is credit", () => {
    expect(reconcileLotteryTds([{ status: "DRAFT", tdsPaise: "700" },
      { status: "REVERSED", tdsPaise: "300" }, { status: "POSTED", tdsPaise: "200" }],
    [{ tdsPaise: "100" }])).toMatchObject({ generatedPayablePaise: "200", recordedCreditPaise: "0",
      legacyUnclassifiedPaise: "100", comparisonDifferencePaise: "200" });
  });

  it("returns a signed comparison while preserving the two separate accounts", () => {
    expect(reconcileLotteryTds([{ tdsPaise: "100" }], [{ source: "DAILY", tdsPaise: "600" }]))
      .toMatchObject({ generatedPayablePaise: "100", recordedCreditPaise: "600", comparisonDifferencePaise: "-500" });
  });

  it("matches server and dashboard for large paise amounts and mixed historical sources", () => {
    for (let index = 0n; index < 100n; index++) {
      const sales = [{ tdsPaise: (900719925474099300n + index).toString() }];
      const entries = [{ source: "DAILY", tdsPaise: (index * 31n).toString() },
        { source: "LEGACY", tdsPaise: (index * 7n).toString() }];
      expect(uiReconcile(sales, entries)).toEqual(reconcileLotteryTds(sales, entries));
    }
  });

  it("uses Kolkata period boundaries and ignores draft seller previews", () => {
    const workspace = { sales: [{ status: "POSTED", tdsPaise: "500", occurredAt: "2026-09-30T18:30:00Z" },
      { status: "POSTED", tdsPaise: "200", occurredAt: "2026-09-30T18:29:59Z" }],
    draftSales: [{ tdsPaise: "999999", occurredAt: "2026-10-01" }],
    stockistEntries: [{ source: "DAILY", tdsPaise: "300", occurredAt: "2026-10-01" }] };
    expect(lotteryPeriodTds(workspace, "2026-10-01", "2026-10-01"))
      .toEqual(reconcileLotteryTds([{ tdsPaise: "500" }], [{ source: "DAILY", tdsPaise: "300" }]));
  });

  it("does not turn a PWT or cash receipt into TDS", () => {
    const summary = summarizeLotteryAccounting({ payments: [{ direction: "RECEIPT", totalAmountPaise: "60000",
      methodSplit: { pwtPaise: "60000" } }] });
    expect(summary.tdsReconciliation).toEqual({ generatedPayablePaise: "0", recordedCreditPaise: "0",
      legacyUnclassifiedPaise: "0", comparisonDifferencePaise: "0", settlementStatus: "NOT_RECORDED" });
  });
});
