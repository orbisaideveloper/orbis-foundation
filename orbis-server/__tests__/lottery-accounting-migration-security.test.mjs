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

const globalTdsMigration = fs.readFileSync(
  path.resolve(
    "prisma/migrations/20260831010000_add_global_lottery_tds_rate/migration.sql",
  ),
  "utf8",
);
const partyDirectoryMigration = fs.readFileSync(
  path.resolve(
    "prisma/migrations/20260831020000_add_accounting_party_directory_and_user_storage_policy/migration.sql",
  ),
  "utf8",
);
const stockistPurchaseMigration = fs.readFileSync(
  path.resolve(
    "prisma/migrations/20260831030000_add_stockist_purchase_values/migration.sql",
  ),
  "utf8",
);
const stockistDailyEntryMigration = fs.readFileSync(
  path.resolve(
    "prisma/migrations/20260901050000_add_simple_stockist_daily_entries/migration.sql",
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

  it("keeps one organization-level TDS rate for every seller", () => {
    expect(globalTdsMigration).toContain(
      'ADD COLUMN "tdsRateBps" INTEGER NOT NULL DEFAULT 200',
    );
    expect(globalTdsMigration).toContain(
      '"FoundationAccountingOrganization_tds_rate_check"',
    );
    expect(globalTdsMigration.trim().startsWith("BEGIN;")).toBe(true);
    expect(globalTdsMigration.trim().endsWith("COMMIT;")).toBe(true);
  });

  it("keeps the party directory common while only future user ledger storage is configurable", () => {
    expect(partyDirectoryMigration).toContain('"userLedgerStorage" TEXT NOT NULL DEFAULT \'CLOUD\'');
    expect(partyDirectoryMigration).toContain('"uniqueCode" TEXT');
    expect(partyDirectoryMigration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "FoundationAccountingParty_uniqueCode_key"');
  });

  it("freezes stockist purchase values without relaxing existing private-table security", () => {
    expect(stockistPurchaseMigration).toContain('"grossPurchasePaise" BIGINT NOT NULL DEFAULT 0');
    expect(stockistPurchaseMigration).toContain('"FoundationLotteryStockMovement_partyId_fkey"');
    expect(stockistPurchaseMigration).toContain('"tdsRateBps" BETWEEN 0 AND 10000');
  });

  it("keeps editable stockist daily rows private and uniquely scoped by party and date", () => {
    expect(stockistDailyEntryMigration).toContain(
      'CREATE TABLE "FoundationLotteryStockistEntry"',
    );
    expect(stockistDailyEntryMigration).toContain(
      '"organizationId", "partyId", "occurredAt"',
    );
    expect(stockistDailyEntryMigration).toContain(
      'ALTER TABLE "FoundationLotteryStockistEntry" ENABLE ROW LEVEL SECURITY',
    );
    expect(stockistDailyEntryMigration).toContain(
      'REVOKE ALL ON TABLE "FoundationLotteryStockistEntry" FROM PUBLIC, anon, authenticated',
    );
    expect(stockistDailyEntryMigration.trim().startsWith("BEGIN;")).toBe(true);
    expect(stockistDailyEntryMigration.trim().endsWith("COMMIT;")).toBe(true);
  });
});
