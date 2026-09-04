BEGIN;

-- Additive accounting masters/books only. Existing Lottery core tables and
-- historical calculations are intentionally untouched.
CREATE TABLE "FoundationAccountingExpenseCategory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoundationAccountingExpenseCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FoundationAccountingExpenseProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "usualAmountPaise" BIGINT NOT NULL DEFAULT 0,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoundationAccountingExpenseProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationAccountingExpenseProfile_amount_check" CHECK ("usualAmountPaise" >= 0)
);

CREATE TABLE "FoundationAccountingExpenseBill" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "reference" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationAccountingExpenseBill_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationAccountingExpenseBill_amount_check" CHECK ("amountPaise" > 0)
);

CREATE TABLE "FoundationAccountingExpensePayment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "totalAmountPaise" BIGINT NOT NULL,
  "cashPaise" BIGINT NOT NULL DEFAULT 0,
  "bankPaise" BIGINT NOT NULL DEFAULT 0,
  "reference" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationAccountingExpensePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationAccountingExpensePayment_amount_check"
    CHECK ("totalAmountPaise" > 0 AND "cashPaise" >= 0 AND "bankPaise" >= 0 AND "totalAmountPaise" = "cashPaise" + "bankPaise")
);

CREATE TABLE "FoundationAccountingCustomerBill" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "quantity" BIGINT NOT NULL,
  "unitRatePaise" BIGINT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "reference" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FoundationAccountingCustomerBill_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FoundationAccountingCustomerBill_amount_check"
    CHECK ("quantity" > 0 AND "unitRatePaise" > 0 AND "amountPaise" = "quantity" * "unitRatePaise")
);

CREATE UNIQUE INDEX "FoundationAccountingExpenseCategory_org_name_key"
  ON "FoundationAccountingExpenseCategory"("organizationId", "name");
CREATE INDEX "FoundationAccountingExpenseCategory_org_status_idx"
  ON "FoundationAccountingExpenseCategory"("organizationId", "status");

CREATE UNIQUE INDEX "FoundationAccountingExpenseProfile_org_category_name_key"
  ON "FoundationAccountingExpenseProfile"("organizationId", "categoryId", "name");
CREATE INDEX "FoundationAccountingExpenseProfile_org_status_idx"
  ON "FoundationAccountingExpenseProfile"("organizationId", "status");
CREATE INDEX "FoundationAccountingExpenseProfile_category_idx"
  ON "FoundationAccountingExpenseProfile"("categoryId");

CREATE UNIQUE INDEX "FoundationAccountingExpenseBill_org_reference_key"
  ON "FoundationAccountingExpenseBill"("organizationId", "reference");
CREATE INDEX "FoundationAccountingExpenseBill_profile_date_idx"
  ON "FoundationAccountingExpenseBill"("profileId", "occurredAt");
CREATE INDEX "FoundationAccountingExpenseBill_org_date_idx"
  ON "FoundationAccountingExpenseBill"("organizationId", "occurredAt");

CREATE UNIQUE INDEX "FoundationAccountingExpensePayment_org_reference_key"
  ON "FoundationAccountingExpensePayment"("organizationId", "reference");
CREATE INDEX "FoundationAccountingExpensePayment_profile_date_idx"
  ON "FoundationAccountingExpensePayment"("profileId", "occurredAt");
CREATE INDEX "FoundationAccountingExpensePayment_org_date_idx"
  ON "FoundationAccountingExpensePayment"("organizationId", "occurredAt");

CREATE UNIQUE INDEX "FoundationAccountingCustomerBill_org_reference_key"
  ON "FoundationAccountingCustomerBill"("organizationId", "reference");
CREATE INDEX "FoundationAccountingCustomerBill_party_date_idx"
  ON "FoundationAccountingCustomerBill"("partyId", "occurredAt");
CREATE INDEX "FoundationAccountingCustomerBill_org_date_idx"
  ON "FoundationAccountingCustomerBill"("organizationId", "occurredAt");

ALTER TABLE "FoundationAccountingExpenseCategory"
  ADD CONSTRAINT "FoundationAccountingExpenseCategory_org_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FoundationAccountingExpenseProfile"
  ADD CONSTRAINT "FoundationAccountingExpenseProfile_org_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationAccountingExpenseProfile"
  ADD CONSTRAINT "FoundationAccountingExpenseProfile_category_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "FoundationAccountingExpenseCategory"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FoundationAccountingExpenseBill"
  ADD CONSTRAINT "FoundationAccountingExpenseBill_org_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationAccountingExpenseBill"
  ADD CONSTRAINT "FoundationAccountingExpenseBill_profile_fkey"
  FOREIGN KEY ("profileId") REFERENCES "FoundationAccountingExpenseProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FoundationAccountingExpensePayment"
  ADD CONSTRAINT "FoundationAccountingExpensePayment_org_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationAccountingExpensePayment"
  ADD CONSTRAINT "FoundationAccountingExpensePayment_profile_fkey"
  FOREIGN KEY ("profileId") REFERENCES "FoundationAccountingExpenseProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FoundationAccountingCustomerBill"
  ADD CONSTRAINT "FoundationAccountingCustomerBill_org_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "FoundationAccountingOrganization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FoundationAccountingCustomerBill"
  ADD CONSTRAINT "FoundationAccountingCustomerBill_party_fkey"
  FOREIGN KEY ("partyId") REFERENCES "FoundationAccountingParty"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
