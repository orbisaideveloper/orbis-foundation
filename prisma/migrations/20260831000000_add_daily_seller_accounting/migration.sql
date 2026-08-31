BEGIN;

ALTER TABLE "FoundationAccountingParty"
  ADD COLUMN "ticketRatePaise" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "commissionRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tdsRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "FoundationAccountingParty_pricing_profile_check"
    CHECK (
      "ticketRatePaise" >= 0
      AND "commissionRateBps" BETWEEN 0 AND 10000
      AND "tdsRateBps" BETWEEN 0 AND 10000
    );

ALTER TABLE "FoundationLotterySale"
  ADD COLUMN "morningReturnQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "dayReturnQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "eveningReturnQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "correctionOfSaleId" TEXT;

-- Legacy one-total returns are preserved as the day return. New entries always
-- save Morning, Day and Evening values separately and verify their total.
UPDATE "FoundationLotterySale"
SET "dayReturnQuantity" = "returnQuantity"
WHERE "morningReturnQuantity" = 0
  AND "dayReturnQuantity" = 0
  AND "eveningReturnQuantity" = 0;

ALTER TABLE "FoundationLotterySale"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT',
  ADD CONSTRAINT "FoundationLotterySale_status_check"
    CHECK ("status" IN ('DRAFT', 'POSTED', 'REVERSED')),
  ADD CONSTRAINT "FoundationLotterySale_timed_return_check"
    CHECK (
      "morningReturnQuantity" >= 0
      AND "dayReturnQuantity" >= 0
      AND "eveningReturnQuantity" >= 0
      AND "returnQuantity" = "morningReturnQuantity" + "dayReturnQuantity" + "eveningReturnQuantity"
    );

CREATE INDEX "FoundationLotterySale_organizationId_status_occurredAt_idx"
  ON "FoundationLotterySale"("organizationId", "status", "occurredAt");
CREATE INDEX "FoundationLotterySale_correctionOfSaleId_idx"
  ON "FoundationLotterySale"("correctionOfSaleId");

CREATE TABLE "FoundationLotteryDocumentSequence" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "financialYear" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "nextValue" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoundationLotteryDocumentSequence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationLotteryDocumentSequence_nextValue_check" CHECK ("nextValue" > 0)
);

CREATE UNIQUE INDEX "FoundationLotteryDocSeq_org_fy_type_uq"
  ON "FoundationLotteryDocumentSequence"("organizationId", "financialYear", "documentType");
CREATE INDEX "FoundationLotteryDocSeq_org_fy_idx"
  ON "FoundationLotteryDocumentSequence"("organizationId", "financialYear");

ALTER TABLE "FoundationLotteryDocumentSequence"
  ADD CONSTRAINT "FoundationLotteryDocumentSequence_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep posted accounting immutable. Only a draft can be edited/deleted. A
-- posted sale can transition once to REVERSED, with no financial field changed;
-- the server writes compensating stock and ledger entries plus an audit event.
CREATE FUNCTION "FoundationLotterySaleDraftMutationGuard"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'POSTED_LOTTERY_ACCOUNTING_ROWS_ARE_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'DRAFT' THEN
    IF NEW."status" NOT IN ('DRAFT', 'POSTED') THEN
      RAISE EXCEPTION 'INVALID_LOTTERY_SALE_STATUS_TRANSITION';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'POSTED'
    AND NEW."status" = 'REVERSED'
    AND (to_jsonb(NEW) - 'status') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'POSTED_LOTTERY_ACCOUNTING_ROWS_ARE_IMMUTABLE';
END;
$$;

REVOKE ALL ON FUNCTION "FoundationLotterySaleDraftMutationGuard"() FROM PUBLIC, anon, authenticated;

DROP TRIGGER "FoundationLotterySale_immutable" ON "FoundationLotterySale";
CREATE TRIGGER "FoundationLotterySale_draft_guard"
BEFORE UPDATE OR DELETE ON "FoundationLotterySale"
FOR EACH ROW EXECUTE FUNCTION "FoundationLotterySaleDraftMutationGuard"();

ALTER TABLE "FoundationLotteryDocumentSequence" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FoundationLotteryDocumentSequence" FROM PUBLIC, anon, authenticated;

COMMIT;
