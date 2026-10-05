-- Allow a voucher credit to exceed sales without rewriting historical rows.
-- Validation fails and the transaction rolls back if old arithmetic is inconsistent.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "public"."FoundationLotterySale"
  DROP CONSTRAINT "FoundationLotterySale_amount_check",
  ADD CONSTRAINT "FoundationLotterySale_amount_check" CHECK (
    "grossSalesPaise" >= 0 AND "commissionPaise" >= 0 AND "tdsPaise" >= 0
    AND "tdsPaise" <= "commissionPaise"
    AND "netPayablePaise"::numeric =
      "grossSalesPaise"::numeric - "commissionPaise"::numeric + "tdsPaise"::numeric
  ) NOT VALID;
ALTER TABLE "public"."FoundationLotterySale"
  VALIDATE CONSTRAINT "FoundationLotterySale_amount_check";
COMMIT;
