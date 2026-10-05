-- Aggregate checks only: no user identities or individual financial records.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT current_database() AS database_name,
       EXISTS (SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public."FoundationLotterySale"'::regclass
           AND conname = 'FoundationLotterySale_amount_check') AS amount_constraint_present;
SELECT conname, pg_get_constraintdef(oid) AS definition, convalidated
FROM pg_constraint
WHERE conrelid = 'public."FoundationLotterySale"'::regclass
  AND conname = 'FoundationLotterySale_amount_check';
SELECT COUNT(*) AS sale_rows,
       COUNT(*) FILTER (WHERE "netPayablePaise" < 0) AS signed_advance_rows,
       COUNT(*) FILTER (WHERE "grossSalesPaise" < 0 OR "commissionPaise" < 0
         OR "tdsPaise" < 0 OR "tdsPaise" > "commissionPaise"
         OR "netPayablePaise"::numeric <>
           "grossSalesPaise"::numeric - "commissionPaise"::numeric + "tdsPaise"::numeric
       ) AS incompatible_rows
FROM "public"."FoundationLotterySale";
COMMIT;
