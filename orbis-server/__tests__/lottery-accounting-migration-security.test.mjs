// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(
    "prisma/migrations/20260830230000_add_lottery_accounting_core/migration.sql",
  ),
  "utf8",
);

const TABLES = [
  "FoundationAccountingOrganization",
  "FoundationAccountingParty",
  "FoundationLotteryAccountingPeriod",
  "FoundationLotteryStockMovement",
  "FoundationLotterySale",
  "FoundationLotteryPayment",
  "FoundationLotterySettlement",
  "FoundationLotteryLedgerEntry",
  "FoundationLotteryAuditEvent",
];

describe("Lottery Accounting migration security", () => {
  it("creates every organization-scoped accounting table with RLS", () => {
    for (const table of TABLES) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
      expect(migration).toContain(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
    }
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("uses exact integer money/rate constraints and organization indexes", () => {
    expect(migration).toContain('"ticketRatePaise" BIGINT NOT NULL');
    expect(migration).toContain('"commissionRateBps" BETWEEN 0 AND 10000');
    expect(migration).toContain('"tdsRateBps" BETWEEN 0 AND 10000');
    expect(migration).toContain(
      '"netTickets" = "dispatchQuantity" - "returnQuantity"',
    );
    expect(migration).toContain('"organizationId", "occurredAt"');
  });

  it("makes posted financial, ledger and audit rows immutable", () => {
    expect(migration).toContain(
      'CREATE FUNCTION "FoundationLotteryRejectMutation"()',
    );
    expect(migration).toContain("POSTED_LOTTERY_ACCOUNTING_ROWS_ARE_IMMUTABLE");
    for (const table of TABLES.slice(3)) {
      expect(migration).toContain(`BEFORE UPDATE OR DELETE ON "${table}"`);
    }
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION "FoundationLotteryRejectMutation"() FROM PUBLIC, anon, authenticated',
    );
  });

  it("adds persisted review evidence before version publishing", () => {
    expect(migration).toContain(
      "ADD COLUMN \"reviewStatus\" TEXT NOT NULL DEFAULT 'NOT_RUN'",
    );
    expect(migration).toContain('ADD COLUMN "reviewReport" JSONB');
    expect(migration).toContain('ADD COLUMN "reviewedByAdminId" TEXT');
    expect(migration.trim().startsWith("BEGIN;")).toBe(true);
    expect(migration.trim().endsWith("COMMIT;")).toBe(true);
  });
});
