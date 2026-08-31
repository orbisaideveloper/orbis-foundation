BEGIN;

-- One TDS rate is owned by the accounting organization, never by an
-- individual seller. Existing organizations begin with the agreed 2.00%.
ALTER TABLE "FoundationAccountingOrganization"
  ADD COLUMN "tdsRateBps" INTEGER NOT NULL DEFAULT 200,
  ADD CONSTRAINT "FoundationAccountingOrganization_tds_rate_check"
    CHECK ("tdsRateBps" BETWEEN 0 AND 10000);

COMMIT;
