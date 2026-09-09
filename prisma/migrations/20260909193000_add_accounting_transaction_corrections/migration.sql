BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public."FoundationLotteryRejectMutation"()') IS NULL THEN
    RAISE EXCEPTION
      'ACCOUNTING_CORRECTION_MIGRATION_ABORTED: FoundationLotteryRejectMutation() is missing';
  END IF;
END;
$$;

CREATE TABLE "FoundationAccountingCorrection" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "operationId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "previousSnapshot" JSONB NOT NULL,
  "replacement" JSONB NOT NULL,
  "acknowledgement" JSONB NOT NULL,
  "reason" TEXT,
  "actorAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationAccountingCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationAccountingCorrection_entity_type_check"
    CHECK ("entityType" IN (
      'STOCKIST_ENTRY',
      'CUSTOMER_BILL',
      'EXPENSE_BILL',
      'EXPENSE_PAYMENT',
      'PAYMENT'
    )),
  CONSTRAINT "FoundationAccountingCorrection_version_check"
    CHECK ("version" > 0),
  CONSTRAINT "FoundationAccountingCorrection_operation_check"
    CHECK (length(btrim("operationId")) > 0),
  CONSTRAINT "FoundationAccountingCorrection_hash_check"
    CHECK ("requestHash" ~ '^[0-9a-f]{64}$')
);

ALTER TABLE "FoundationAccountingCorrection"
  ADD CONSTRAINT "FoundationAccountingCorrection_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "FoundationAccountingOrganization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "FoundationAccountingCorrection_org_operation_key"
  ON "FoundationAccountingCorrection"("organizationId", "operationId");

CREATE UNIQUE INDEX "FoundationAccountingCorrection_org_entity_version_key"
  ON "FoundationAccountingCorrection"(
    "organizationId",
    "entityType",
    "entityId",
    "version"
  );

CREATE INDEX "FoundationAccountingCorrection_org_entity_created_idx"
  ON "FoundationAccountingCorrection"(
    "organizationId",
    "entityType",
    "entityId",
    "createdAt"
  );

ALTER TABLE "FoundationAccountingCorrection" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "FoundationAccountingCorrection"
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "FoundationAccountingCorrection_immutable"
BEFORE UPDATE OR DELETE ON "FoundationAccountingCorrection"
FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"();

COMMIT;
