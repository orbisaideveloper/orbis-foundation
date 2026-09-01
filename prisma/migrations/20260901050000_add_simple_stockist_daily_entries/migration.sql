BEGIN;

CREATE TABLE "FoundationLotteryStockistEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "purchaseQuantity" BIGINT NOT NULL DEFAULT 0,
  "morningReturnQuantity" BIGINT NOT NULL DEFAULT 0,
  "dayReturnQuantity" BIGINT NOT NULL DEFAULT 0,
  "eveningReturnQuantity" BIGINT NOT NULL DEFAULT 0,
  "totalReturnQuantity" BIGINT NOT NULL DEFAULT 0,
  "netPurchaseQuantity" BIGINT NOT NULL DEFAULT 0,
  "unitRatePaise" BIGINT NOT NULL DEFAULT 0,
  "grossPurchasePaise" BIGINT NOT NULL DEFAULT 0,
  "commissionPaise" BIGINT NOT NULL DEFAULT 0,
  "tdsRateBps" INTEGER NOT NULL DEFAULT 0,
  "tdsPaise" BIGINT NOT NULL DEFAULT 0,
  "netPayablePaise" BIGINT NOT NULL DEFAULT 0,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "updatedByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoundationLotteryStockistEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationLotteryStockistEntry_quantity_check" CHECK (
    "purchaseQuantity" >= 0 AND
    "morningReturnQuantity" >= 0 AND
    "dayReturnQuantity" >= 0 AND
    "eveningReturnQuantity" >= 0 AND
    "totalReturnQuantity" = "morningReturnQuantity" + "dayReturnQuantity" + "eveningReturnQuantity" AND
    "netPurchaseQuantity" = "purchaseQuantity" - "totalReturnQuantity"
  ),
  CONSTRAINT "FoundationLotteryStockistEntry_money_check" CHECK (
    "unitRatePaise" >= 0 AND "commissionPaise" >= 0 AND
    "tdsRateBps" BETWEEN 0 AND 10000
  ),
  CONSTRAINT "FoundationLotteryStockistEntry_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FoundationLotteryStockistEntry_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "FoundationAccountingParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FoundationLotteryStockistEntry_organizationId_partyId_occurredAt_key"
  ON "FoundationLotteryStockistEntry"("organizationId", "partyId", "occurredAt");
CREATE UNIQUE INDEX "FoundationLotteryStockistEntry_organizationId_reference_key"
  ON "FoundationLotteryStockistEntry"("organizationId", "reference");
CREATE INDEX "FoundationLotteryStockistEntry_organizationId_occurredAt_idx"
  ON "FoundationLotteryStockistEntry"("organizationId", "occurredAt");
CREATE INDEX "FoundationLotteryStockistEntry_partyId_occurredAt_idx"
  ON "FoundationLotteryStockistEntry"("partyId", "occurredAt");

ALTER TABLE "FoundationLotteryStockistEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FoundationLotteryStockistEntry" FROM PUBLIC, anon, authenticated;

COMMIT;
