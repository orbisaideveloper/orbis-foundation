import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const migrationPath = path.join(
  ROOT,
  "prisma/migrations/20260903223000_add_lottery_expense_customer_books/migration.sql",
);

describe("lottery accounting additive expense/customer migration", () => {
  it("adds new books without altering or dropping existing Lottery core tables", async () => {
    const sql = await readFile(migrationPath, "utf8");

    for (const table of [
      "FoundationAccountingExpenseCategory",
      "FoundationAccountingExpenseProfile",
      "FoundationAccountingExpenseBill",
      "FoundationAccountingExpensePayment",
      "FoundationAccountingCustomerBill",
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }

    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).not.toMatch(
      /ALTER TABLE "FoundationLottery(Sale|Payment|StockistEntry)"[\s\S]*DROP/i,
    );
    expect(sql).toContain("ON DELETE RESTRICT");
    expect(sql).toContain("COMMIT;");
  });
});
