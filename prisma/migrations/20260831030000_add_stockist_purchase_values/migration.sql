BEGIN;

-- Price, commission and TDS are frozen with each stockist receipt so later
-- party-rate changes cannot rewrite an accounting fact.
ALTER TABLE "FoundationLotteryStockMovement"
  ADD COLUMN IF NOT EXISTS "partyId" TEXT,
  ADD COLUMN IF NOT EXISTS "unitRatePaise" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "grossPurchasePaise" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionPaise" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tdsRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tdsPaise" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netPayablePaise" BIGINT NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FoundationLotteryStockMovement_values_non_negative_check') THEN
    ALTER TABLE "FoundationLotteryStockMovement"
      ADD CONSTRAINT "FoundationLotteryStockMovement_values_non_negative_check"
      CHECK (
        "unitRatePaise" >= 0 AND "grossPurchasePaise" >= 0 AND "commissionPaise" >= 0
        AND "tdsRateBps" BETWEEN 0 AND 10000 AND "tdsPaise" >= 0 AND "netPayablePaise" >= 0
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FoundationLotteryStockMovement_partyId_fkey') THEN
    ALTER TABLE "FoundationLotteryStockMovement"
      ADD CONSTRAINT "FoundationLotteryStockMovement_partyId_fkey"
      FOREIGN KEY ("partyId") REFERENCES "FoundationAccountingParty"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "FoundationLotteryStockMovement_partyId_occurredAt_idx"
  ON "FoundationLotteryStockMovement"("partyId", "occurredAt");

COMMIT;
