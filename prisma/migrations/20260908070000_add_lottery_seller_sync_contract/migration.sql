BEGIN;

ALTER TABLE "FoundationLotterySale"
  ADD COLUMN "syncVersion" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "FoundationLotterySale_syncVersion_check"
    CHECK ("syncVersion" > 0);

-- Daily Seller is one editable draft per organization/seller/day. The partial
-- index keeps concurrent first-sync requests from creating duplicate drafts.
CREATE UNIQUE INDEX "FoundationLotterySale_one_daily_draft_uq"
  ON "FoundationLotterySale"("organizationId", "partyId", "occurredAt")
  WHERE "status" = 'DRAFT';

CREATE TABLE "FoundationLotterySellerSyncOperation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "expectedVersion" INTEGER NOT NULL,
  "acknowledgedVersion" INTEGER NOT NULL,
  "acknowledgement" JSONB NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationLotterySellerSyncOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationLotterySellerSyncOperation_expectedVersion_check"
    CHECK ("expectedVersion" >= 0),
  CONSTRAINT "FoundationLotterySellerSyncOperation_acknowledgedVersion_check"
    CHECK ("acknowledgedVersion" > 0)
);

CREATE UNIQUE INDEX "FoundationLotterySellerSyncOperation_org_operation_uq"
  ON "FoundationLotterySellerSyncOperation"("organizationId", "operationId");
CREATE INDEX "FoundationLotterySellerSyncOperation_org_sale_created_idx"
  ON "FoundationLotterySellerSyncOperation"("organizationId", "saleId", "createdAt");
CREATE INDEX "FoundationLotterySellerSyncOperation_sale_created_idx"
  ON "FoundationLotterySellerSyncOperation"("saleId", "createdAt");

ALTER TABLE "FoundationLotterySellerSyncOperation"
  ADD CONSTRAINT "FoundationLotterySellerSyncOperation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotterySellerSyncOperation"
  ADD CONSTRAINT "FoundationLotterySellerSyncOperation_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "FoundationLotterySale"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FoundationLotterySellerSyncOperation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FoundationLotterySellerSyncOperation" FROM PUBLIC, anon, authenticated;

COMMIT;
