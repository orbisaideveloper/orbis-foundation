"use strict";

// Classify the existing recorded formulas; do not rewrite historical tax amounts.
// DAILY stockist entries use gross - commission + TDS. Legacy entries use a
// different formula and must remain unclassified until their direction is verified.
// The difference compares generated amounts; it is not a tax settlement/netting.
function reconcileLotteryTds(sales = [], stockistEntries = []) {
  const amount = (rows) => rows.reduce((sum, row) => sum + BigInt(row.tdsPaise ?? 0), 0n);
  const generatedPayable = amount(sales.filter((row) => !row.status || row.status === "POSTED"));
  const recordedCredit = amount(stockistEntries.filter((row) => row.source === "DAILY"));
  const legacyUnclassified = amount(stockistEntries.filter((row) => row.source !== "DAILY"));
  return {
    generatedPayablePaise: generatedPayable.toString(),
    recordedCreditPaise: recordedCredit.toString(),
    legacyUnclassifiedPaise: legacyUnclassified.toString(),
    comparisonDifferencePaise: (generatedPayable - recordedCredit).toString(),
    settlementStatus: "NOT_RECORDED",
  };
}

module.exports = { reconcileLotteryTds };
