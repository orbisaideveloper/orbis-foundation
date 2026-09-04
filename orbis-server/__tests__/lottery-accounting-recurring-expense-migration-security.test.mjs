import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const migrationPath = path.join(
  ROOT,
  "prisma/migrations/20260904103000_add_recurring_expense_schedule/migration.sql",
);

describe("lottery accounting recurring expense migration", () => {
  it("adds recurring fields without destructive schema changes", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain('"scheduleType"');
    expect(sql).toContain('"recurringStartsAt"');
    expect(sql).toContain('"billingMonth"');
    expect(sql).toContain("'ONE_TIME'");
    expect(sql).toContain("'MONTHLY'");
    expect(sql).toContain(
      '"FoundationAccountingExpenseBill_org_profile_month_key"',
    );
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).toContain("COMMIT;");
  });
});
