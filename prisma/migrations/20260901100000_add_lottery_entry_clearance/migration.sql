BEGIN;

CREATE TABLE "FoundationLotteryEntryClearance" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "scope" TEXT NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationLotteryEntryClearance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationLotteryEntryClearance_scope_check"
    CHECK ("scope" IN ('ALL', 'SELLER', 'STOCKIST', 'PAYMENT')),
  CONSTRAINT "FoundationLotteryEntryClearance_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "FoundationLotteryEntryClearance_organizationId_occurredAt_scope_idx"
  ON "FoundationLotteryEntryClearance"("organizationId", "occurredAt", "scope");

ALTER TABLE "FoundationLotteryEntryClearance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FoundationLotteryEntryClearance" FROM PUBLIC, anon, authenticated;

COMMIT;
