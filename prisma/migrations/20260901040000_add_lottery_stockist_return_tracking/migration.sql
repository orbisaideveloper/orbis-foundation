-- Seller return stays in warehouse stock. A later manual stockist return
-- references the original receipt and reduces that warehouse stock.
ALTER TABLE "FoundationLotteryStockMovement"
  ADD COLUMN "sourceReceiptId" TEXT,
  ADD COLUMN "returnSession" TEXT;

CREATE INDEX "FoundationLotteryStockMovement_sourceReceiptId_idx"
  ON "FoundationLotteryStockMovement"("sourceReceiptId");
