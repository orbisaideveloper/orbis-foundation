BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "FoundationAccountingCorrection"
  DROP CONSTRAINT "FoundationAccountingCorrection_entity_type_check";
ALTER TABLE "FoundationAccountingCorrection"
  ADD CONSTRAINT "FoundationAccountingCorrection_entity_type_check"
  CHECK ("entityType" IN ('STOCKIST_ENTRY', 'CUSTOMER_BILL', 'EXPENSE_BILL',
    'EXPENSE_PAYMENT', 'PAYMENT', 'SELLER_SALE', 'STOCK_MOVEMENT', 'SETTLEMENT', 'LEGACY_STOCKIST_DAY')) NOT VALID;
ALTER TABLE "FoundationAccountingCorrection"
  VALIDATE CONSTRAINT "FoundationAccountingCorrection_entity_type_check";
COMMIT;
