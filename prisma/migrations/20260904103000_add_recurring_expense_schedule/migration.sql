BEGIN;

ALTER TABLE "FoundationAccountingExpenseProfile"
  ADD COLUMN "scheduleType" TEXT NOT NULL DEFAULT 'ONE_TIME',
  ADD COLUMN "recurringStartsAt" TIMESTAMP(3);

ALTER TABLE "FoundationAccountingExpenseProfile"
  ADD CONSTRAINT "FoundationAccountingExpenseProfile_schedule_type_check"
  CHECK ("scheduleType" IN ('ONE_TIME', 'MONTHLY'));

ALTER TABLE "FoundationAccountingExpenseBill"
  ADD COLUMN "billingMonth" TEXT;

ALTER TABLE "FoundationAccountingExpenseBill"
  ADD CONSTRAINT "FoundationAccountingExpenseBill_billing_month_check"
  CHECK (
    "billingMonth" IS NULL
    OR "billingMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  );

CREATE UNIQUE INDEX "FoundationAccountingExpenseBill_org_profile_month_key"
  ON "FoundationAccountingExpenseBill"("organizationId", "profileId", "billingMonth");

CREATE INDEX "FoundationAccountingExpenseProfile_org_schedule_idx"
  ON "FoundationAccountingExpenseProfile"("organizationId", "scheduleType", "status");

COMMIT;
