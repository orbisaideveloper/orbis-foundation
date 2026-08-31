BEGIN;

ALTER TABLE "FoundationManagedProductModelVersion"
ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'NOT_RUN',
ADD COLUMN "reviewReport" JSONB,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedByAdminId" TEXT;

CREATE TABLE "FoundationAccountingOrganization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoundationAccountingOrganization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundationAccountingParty" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "partyType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoundationAccountingParty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundationLotteryAccountingPeriod" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoundationLotteryAccountingPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationLotteryAccountingPeriod_dates_check" CHECK ("endsAt" >= "startsAt")
);

CREATE TABLE "FoundationLotteryStockMovement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "movementType" TEXT NOT NULL,
  "quantity" BIGINT NOT NULL,
  "reference" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationLotteryStockMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationLotteryStockMovement_type_check" CHECK ("movementType" IN ('RECEIPT', 'DISPATCH', 'RETURN', 'ADJUSTMENT')),
  CONSTRAINT "FoundationLotteryStockMovement_quantity_check" CHECK (("movementType" = 'ADJUSTMENT' AND "quantity" <> 0) OR ("movementType" <> 'ADJUSTMENT' AND "quantity" > 0))
);

CREATE TABLE "FoundationLotterySale" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "periodId" TEXT,
  "reference" TEXT NOT NULL,
  "dispatchQuantity" INTEGER NOT NULL,
  "returnQuantity" INTEGER NOT NULL,
  "netTickets" INTEGER NOT NULL,
  "ticketRatePaise" BIGINT NOT NULL,
  "grossSalesPaise" BIGINT NOT NULL,
  "commissionRateBps" INTEGER NOT NULL,
  "commissionPaise" BIGINT NOT NULL,
  "tdsRateBps" INTEGER NOT NULL,
  "tdsPaise" BIGINT NOT NULL,
  "netPayablePaise" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationLotterySale_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationLotterySale_quantity_check" CHECK ("dispatchQuantity" >= 0 AND "returnQuantity" >= 0 AND "returnQuantity" <= "dispatchQuantity" AND "netTickets" = "dispatchQuantity" - "returnQuantity"),
  CONSTRAINT "FoundationLotterySale_rate_check" CHECK ("ticketRatePaise" >= 0 AND "commissionRateBps" BETWEEN 0 AND 10000 AND "tdsRateBps" BETWEEN 0 AND 10000),
  CONSTRAINT "FoundationLotterySale_amount_check" CHECK ("grossSalesPaise" >= 0 AND "commissionPaise" >= 0 AND "tdsPaise" >= 0 AND "netPayablePaise" >= 0)
);

CREATE TABLE "FoundationLotteryPayment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "periodId" TEXT,
  "direction" TEXT NOT NULL,
  "totalAmountPaise" BIGINT NOT NULL,
  "methodSplit" JSONB NOT NULL,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationLotteryPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationLotteryPayment_direction_check" CHECK ("direction" IN ('RECEIPT', 'PAYMENT', 'EXPENSE')),
  CONSTRAINT "FoundationLotteryPayment_amount_check" CHECK ("totalAmountPaise" > 0)
);

CREATE TABLE "FoundationLotterySettlement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationLotterySettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationLotterySettlement_amount_check" CHECK ("amountPaise" > 0)
);

CREATE TABLE "FoundationLotteryLedgerEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "accountCode" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationLotteryLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationLotteryLedgerEntry_side_check" CHECK ("side" IN ('DEBIT', 'CREDIT')),
  CONSTRAINT "FoundationLotteryLedgerEntry_amount_check" CHECK ("amountPaise" > 0)
);

CREATE TABLE "FoundationLotteryAuditEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "actorAdminId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationLotteryAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FoundationAccountingParty_organizationId_name_key" ON "FoundationAccountingParty"("organizationId", "name");
CREATE INDEX "FoundationAccountingParty_organizationId_status_idx" ON "FoundationAccountingParty"("organizationId", "status");
CREATE UNIQUE INDEX "FoundationLotteryAccountingPeriod_organizationId_label_key" ON "FoundationLotteryAccountingPeriod"("organizationId", "label");
CREATE INDEX "FoundationLotteryAccountingPeriod_dates_idx" ON "FoundationLotteryAccountingPeriod"("organizationId", "startsAt", "endsAt");
CREATE UNIQUE INDEX "FoundationLotteryStockMovement_reference_key" ON "FoundationLotteryStockMovement"("organizationId", "reference", "movementType");
CREATE INDEX "FoundationLotteryStockMovement_occurredAt_idx" ON "FoundationLotteryStockMovement"("organizationId", "occurredAt");
CREATE UNIQUE INDEX "FoundationLotterySale_reference_key" ON "FoundationLotterySale"("organizationId", "reference");
CREATE INDEX "FoundationLotterySale_organizationId_occurredAt_idx" ON "FoundationLotterySale"("organizationId", "occurredAt");
CREATE INDEX "FoundationLotterySale_partyId_occurredAt_idx" ON "FoundationLotterySale"("partyId", "occurredAt");
CREATE INDEX "FoundationLotterySale_periodId_idx" ON "FoundationLotterySale"("periodId");
CREATE UNIQUE INDEX "FoundationLotteryPayment_reference_key" ON "FoundationLotteryPayment"("organizationId", "reference");
CREATE INDEX "FoundationLotteryPayment_organizationId_occurredAt_idx" ON "FoundationLotteryPayment"("organizationId", "occurredAt");
CREATE INDEX "FoundationLotteryPayment_partyId_occurredAt_idx" ON "FoundationLotteryPayment"("partyId", "occurredAt");
CREATE INDEX "FoundationLotteryPayment_periodId_idx" ON "FoundationLotteryPayment"("periodId");
CREATE UNIQUE INDEX "FoundationLotterySettlement_saleId_paymentId_key" ON "FoundationLotterySettlement"("saleId", "paymentId");
CREATE INDEX "FoundationLotterySettlement_organizationId_createdAt_idx" ON "FoundationLotterySettlement"("organizationId", "createdAt");
CREATE INDEX "FoundationLotterySettlement_paymentId_idx" ON "FoundationLotterySettlement"("paymentId");
CREATE UNIQUE INDEX "FoundationLotteryLedgerEntry_transactionId_lineNumber_key" ON "FoundationLotteryLedgerEntry"("transactionId", "lineNumber");
CREATE INDEX "FoundationLotteryLedgerEntry_organizationId_occurredAt_idx" ON "FoundationLotteryLedgerEntry"("organizationId", "occurredAt");
CREATE INDEX "FoundationLotteryLedgerEntry_source_idx" ON "FoundationLotteryLedgerEntry"("sourceType", "sourceId");
CREATE INDEX "FoundationLotteryAuditEvent_organizationId_createdAt_idx" ON "FoundationLotteryAuditEvent"("organizationId", "createdAt");
CREATE INDEX "FoundationLotteryAuditEvent_entity_idx" ON "FoundationLotteryAuditEvent"("entityType", "entityId");

ALTER TABLE "FoundationAccountingParty" ADD CONSTRAINT "FoundationAccountingParty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotteryAccountingPeriod" ADD CONSTRAINT "FoundationLotteryAccountingPeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotteryStockMovement" ADD CONSTRAINT "FoundationLotteryStockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotterySale" ADD CONSTRAINT "FoundationLotterySale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotterySale" ADD CONSTRAINT "FoundationLotterySale_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FoundationAccountingParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotterySale" ADD CONSTRAINT "FoundationLotterySale_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FoundationLotteryAccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotteryPayment" ADD CONSTRAINT "FoundationLotteryPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotteryPayment" ADD CONSTRAINT "FoundationLotteryPayment_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FoundationAccountingParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotteryPayment" ADD CONSTRAINT "FoundationLotteryPayment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FoundationLotteryAccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotterySettlement" ADD CONSTRAINT "FoundationLotterySettlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotterySettlement" ADD CONSTRAINT "FoundationLotterySettlement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "FoundationLotterySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotterySettlement" ADD CONSTRAINT "FoundationLotterySettlement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FoundationLotteryPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotteryLedgerEntry" ADD CONSTRAINT "FoundationLotteryLedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationLotteryAuditEvent" ADD CONSTRAINT "FoundationLotteryAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "FoundationLotteryRejectMutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'POSTED_LOTTERY_ACCOUNTING_ROWS_ARE_IMMUTABLE';
END;
$$;

REVOKE ALL ON FUNCTION "FoundationLotteryRejectMutation"() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "FoundationLotteryStockMovement_immutable" BEFORE UPDATE OR DELETE ON "FoundationLotteryStockMovement" FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"();
CREATE TRIGGER "FoundationLotterySale_immutable" BEFORE UPDATE OR DELETE ON "FoundationLotterySale" FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"();
CREATE TRIGGER "FoundationLotteryPayment_immutable" BEFORE UPDATE OR DELETE ON "FoundationLotteryPayment" FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"();
CREATE TRIGGER "FoundationLotterySettlement_immutable" BEFORE UPDATE OR DELETE ON "FoundationLotterySettlement" FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"();
CREATE TRIGGER "FoundationLotteryLedgerEntry_immutable" BEFORE UPDATE OR DELETE ON "FoundationLotteryLedgerEntry" FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"();
CREATE TRIGGER "FoundationLotteryAuditEvent_immutable" BEFORE UPDATE OR DELETE ON "FoundationLotteryAuditEvent" FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"();

ALTER TABLE "FoundationAccountingOrganization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationAccountingParty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationLotteryAccountingPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationLotteryStockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationLotterySale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationLotteryPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationLotterySettlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationLotteryLedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationLotteryAuditEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "FoundationAccountingOrganization", "FoundationAccountingParty", "FoundationLotteryAccountingPeriod", "FoundationLotteryStockMovement", "FoundationLotterySale", "FoundationLotteryPayment", "FoundationLotterySettlement", "FoundationLotteryLedgerEntry", "FoundationLotteryAuditEvent" FROM PUBLIC, anon, authenticated;

COMMIT;
