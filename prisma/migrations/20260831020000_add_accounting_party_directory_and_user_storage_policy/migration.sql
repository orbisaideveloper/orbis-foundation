BEGIN;

-- The directory is always private/common; only a future user ledger can be
-- switched by the Admin between cloud and device storage.
ALTER TABLE "FoundationAccountingOrganization"
  ADD COLUMN IF NOT EXISTS "userLedgerStorage" TEXT NOT NULL DEFAULT 'CLOUD';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FoundationAccountingOrganization_user_ledger_storage_check') THEN
    ALTER TABLE "FoundationAccountingOrganization"
      ADD CONSTRAINT "FoundationAccountingOrganization_user_ledger_storage_check"
      CHECK ("userLedgerStorage" IN ('CLOUD', 'DEVICE'));
  END IF;
END $$;

ALTER TABLE "FoundationAccountingParty"
  ADD COLUMN IF NOT EXISTS "uniqueCode" TEXT;

UPDATE "FoundationAccountingParty"
  SET "uniqueCode" = "id"
  WHERE "uniqueCode" IS NULL;

ALTER TABLE "FoundationAccountingParty"
  ALTER COLUMN "uniqueCode" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "FoundationAccountingParty_uniqueCode_key"
  ON "FoundationAccountingParty"("uniqueCode");

COMMIT;
