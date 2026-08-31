// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(
    "prisma/migrations/20260831000000_add_daily_seller_accounting/migration.sql",
  ),
  "utf8",
);

describe("Daily seller accounting migration security", () => {
  it("keeps the new sequence table private behind RLS and direct-access revokes", () => {
    expect(migration).toContain(
      'CREATE TABLE "FoundationLotteryDocumentSequence"',
    );
    expect(migration).toContain(
      'ALTER TABLE "FoundationLotteryDocumentSequence" ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).toContain(
      'REVOKE ALL ON TABLE "FoundationLotteryDocumentSequence" FROM PUBLIC, anon, authenticated',
    );
    expect(migration).not.toMatch(
      /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE).*FoundationLotteryDocumentSequence/i,
    );
  });

  it("persists the three return times, party profile and financial-year sequence", () => {
    expect(migration).toContain(
      'ADD COLUMN "ticketRatePaise" BIGINT NOT NULL DEFAULT 0',
    );
    expect(migration).toContain(
      'ADD COLUMN "morningReturnQuantity" INTEGER NOT NULL DEFAULT 0',
    );
    expect(migration).toContain(
      'ADD COLUMN "dayReturnQuantity" INTEGER NOT NULL DEFAULT 0',
    );
    expect(migration).toContain(
      'ADD COLUMN "eveningReturnQuantity" INTEGER NOT NULL DEFAULT 0',
    );
    expect(migration).toContain(
      '"returnQuantity" = "morningReturnQuantity" + "dayReturnQuantity" + "eveningReturnQuantity"',
    );
    expect(migration).toContain(
      '"organizationId", "financialYear", "documentType"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "FoundationLotteryDocSeq_org_fy_type_uq"',
    );
    expect(migration).toContain(
      'CREATE INDEX "FoundationLotteryDocSeq_org_fy_idx"',
    );
  });

  it("allows only draft edits and a server-audited POSTED to REVERSED transition", () => {
    expect(migration).toContain(
      'CREATE FUNCTION "FoundationLotterySaleDraftMutationGuard"()',
    );
    expect(migration).toContain("OLD.\"status\" <> 'DRAFT'");
    expect(migration).toContain("NEW.\"status\" NOT IN ('DRAFT', 'POSTED')");
    expect(migration).toContain("OLD.\"status\" = 'POSTED'");
    expect(migration).toContain("NEW.\"status\" = 'REVERSED'");
    expect(migration).toContain("POSTED_LOTTERY_ACCOUNTING_ROWS_ARE_IMMUTABLE");
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION "FoundationLotterySaleDraftMutationGuard"() FROM PUBLIC, anon, authenticated',
    );
    expect(migration).toContain(
      'BEFORE UPDATE OR DELETE ON "FoundationLotterySale"',
    );
  });
});
