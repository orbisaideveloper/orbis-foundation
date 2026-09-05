// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function migration(relative) {
  return fs.readFileSync(path.resolve(relative), "utf8");
}

const core = migration(
  "prisma/migrations/20260830230000_add_lottery_accounting_core/migration.sql",
);
const books = migration(
  "prisma/migrations/20260903223000_add_lottery_expense_customer_books/migration.sql",
);
const recurring = migration(
  "prisma/migrations/20260904103000_add_recurring_expense_schedule/migration.sql",
);
const hardening = migration(
  "prisma/migrations/20260905001000_harden_expense_customer_books/migration.sql",
);

describe("Lottery Accounting financial control contracts", () => {
  it("keeps core posted accounting rows append-only and private", () => {
    for (const table of [
      "FoundationLotteryStockMovement",
      "FoundationLotterySale",
      "FoundationLotteryPayment",
      "FoundationLotterySettlement",
      "FoundationLotteryLedgerEntry",
      "FoundationLotteryAuditEvent",
    ]) {
      expect(core).toContain(`CREATE TRIGGER "${table}_immutable"`);
      expect(core).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
    expect(core).toContain(
      'CREATE UNIQUE INDEX "FoundationLotteryLedgerEntry_transactionId_lineNumber_key"',
    );
  });

  it("keeps money exact in paise and enforces payment/customer arithmetic in the database", () => {
    expect(books).toContain('"usualAmountPaise" BIGINT NOT NULL DEFAULT 0');
    expect(books).toContain('"amountPaise" BIGINT NOT NULL');
    expect(books).toContain(
      '"totalAmountPaise" = "cashPaise" + "bankPaise"',
    );
    expect(books).toContain(
      '"amountPaise" = "quantity" * "unitRatePaise"',
    );
    expect(books).toContain(
      'CREATE UNIQUE INDEX "FoundationAccountingExpenseBill_org_reference_key"',
    );
    expect(books).toContain(
      'CREATE UNIQUE INDEX "FoundationAccountingExpensePayment_org_reference_key"',
    );
    expect(books).toContain(
      'CREATE UNIQUE INDEX "FoundationAccountingCustomerBill_org_reference_key"',
    );
  });

  it("prevents duplicate monthly recurring bills for the same organization/profile/month", () => {
    expect(recurring).toContain(
      'CREATE UNIQUE INDEX "FoundationAccountingExpenseBill_org_profile_month_key"',
    );
    expect(recurring).toContain(
      '"billingMonth" ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\'',
    );
  });

  it("gives additive expense and customer books the same private database boundary as the core", () => {
    for (const table of [
      "FoundationAccountingExpenseCategory",
      "FoundationAccountingExpenseProfile",
      "FoundationAccountingExpenseBill",
      "FoundationAccountingExpensePayment",
      "FoundationAccountingCustomerBill",
    ]) {
      expect(hardening).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
    }
    const normalizedHardening = hardening.replace(/\s+/g, " ").trim();
    expect(normalizedHardening).toContain(
      'REVOKE ALL ON TABLE "FoundationAccountingExpenseCategory", "FoundationAccountingExpenseProfile", "FoundationAccountingExpenseBill", "FoundationAccountingExpensePayment", "FoundationAccountingCustomerBill" FROM PUBLIC, anon, authenticated;',
    );
  });

  it("makes posted expense bills, expense payments and customer bills immutable", () => {
    for (const table of [
      "FoundationAccountingExpenseBill",
      "FoundationAccountingExpensePayment",
      "FoundationAccountingCustomerBill",
    ]) {
      expect(hardening).toContain(`CREATE TRIGGER "${table}_immutable"`);
      expect(hardening).toContain(
        `BEFORE UPDATE OR DELETE ON "${table}"`,
      );
    }
    expect(hardening).toContain(
      'EXECUTE FUNCTION "FoundationLotteryRejectMutation"()',
    );
  });
});
