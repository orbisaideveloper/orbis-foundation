BEGIN;

-- Corrective migration for the partial expense/customer-book hardening state
-- observed on 2026-09-06.
--
-- Intentionally does NOT change existing RLS enablement or create policies.
-- It only:
--   1) verifies the already-observed security prerequisites,
--   2) revokes direct PUBLIC/anon/authenticated table privileges, and
--   3) creates the three missing immutable-row triggers when absent.
--
-- The trigger creation is replay-safe so a fresh database that already ran
-- 20260905001000_harden_expense_customer_books will not fail here.

DO $$
DECLARE
  missing_rls_count INTEGER;
  policy_count INTEGER;
BEGIN
  SELECT count(*)
  INTO missing_rls_count
  FROM (
    VALUES
      ('FoundationAccountingExpenseCategory'),
      ('FoundationAccountingExpenseProfile'),
      ('FoundationAccountingExpenseBill'),
      ('FoundationAccountingExpensePayment'),
      ('FoundationAccountingCustomerBill')
  ) AS target(table_name)
  LEFT JOIN pg_class c
    ON c.relname = target.table_name
  LEFT JOIN pg_namespace n
    ON n.oid = c.relnamespace
   AND n.nspname = 'public'
  WHERE c.oid IS NULL
     OR n.oid IS NULL
     OR NOT c.relrowsecurity;

  IF missing_rls_count <> 0 THEN
    RAISE EXCEPTION
      'ACCOUNTING_HARDENING_REPAIR_ABORTED: expected all five target tables to exist with RLS already enabled';
  END IF;

  IF to_regprocedure('public."FoundationLotteryRejectMutation"()') IS NULL THEN
    RAISE EXCEPTION
      'ACCOUNTING_HARDENING_REPAIR_ABORTED: FoundationLotteryRejectMutation() is missing';
  END IF;

  SELECT count(*)
  INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'FoundationAccountingExpenseCategory',
      'FoundationAccountingExpenseProfile',
      'FoundationAccountingExpenseBill',
      'FoundationAccountingExpensePayment',
      'FoundationAccountingCustomerBill'
    );

  IF policy_count <> 0 THEN
    RAISE EXCEPTION
      'ACCOUNTING_HARDENING_REPAIR_ABORTED: unexpected RLS policies exist on target tables';
  END IF;
END;
$$;

REVOKE ALL ON TABLE
  "FoundationAccountingExpenseCategory",
  "FoundationAccountingExpenseProfile",
  "FoundationAccountingExpenseBill",
  "FoundationAccountingExpensePayment",
  "FoundationAccountingCustomerBill"
FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  reject_mutation_oid OID :=
    to_regprocedure('public."FoundationLotteryRejectMutation"()');
  existing_function_oid OID;
  existing_enabled "char";
BEGIN
  SELECT t.tgfoid, t.tgenabled
  INTO existing_function_oid, existing_enabled
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'FoundationAccountingExpenseBill'
    AND t.tgname = 'FoundationAccountingExpenseBill_immutable'
    AND NOT t.tgisinternal;

  IF FOUND THEN
    IF existing_function_oid <> reject_mutation_oid OR existing_enabled = 'D' THEN
      RAISE EXCEPTION
        'ACCOUNTING_HARDENING_REPAIR_ABORTED: unexpected FoundationAccountingExpenseBill_immutable trigger definition';
    END IF;
  ELSE
    EXECUTE
      'CREATE TRIGGER "FoundationAccountingExpenseBill_immutable" ' ||
      'BEFORE UPDATE OR DELETE ON "FoundationAccountingExpenseBill" ' ||
      'FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"()';
  END IF;

  existing_function_oid := NULL;
  existing_enabled := NULL;

  SELECT t.tgfoid, t.tgenabled
  INTO existing_function_oid, existing_enabled
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'FoundationAccountingExpensePayment'
    AND t.tgname = 'FoundationAccountingExpensePayment_immutable'
    AND NOT t.tgisinternal;

  IF FOUND THEN
    IF existing_function_oid <> reject_mutation_oid OR existing_enabled = 'D' THEN
      RAISE EXCEPTION
        'ACCOUNTING_HARDENING_REPAIR_ABORTED: unexpected FoundationAccountingExpensePayment_immutable trigger definition';
    END IF;
  ELSE
    EXECUTE
      'CREATE TRIGGER "FoundationAccountingExpensePayment_immutable" ' ||
      'BEFORE UPDATE OR DELETE ON "FoundationAccountingExpensePayment" ' ||
      'FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"()';
  END IF;

  existing_function_oid := NULL;
  existing_enabled := NULL;

  SELECT t.tgfoid, t.tgenabled
  INTO existing_function_oid, existing_enabled
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'FoundationAccountingCustomerBill'
    AND t.tgname = 'FoundationAccountingCustomerBill_immutable'
    AND NOT t.tgisinternal;

  IF FOUND THEN
    IF existing_function_oid <> reject_mutation_oid OR existing_enabled = 'D' THEN
      RAISE EXCEPTION
        'ACCOUNTING_HARDENING_REPAIR_ABORTED: unexpected FoundationAccountingCustomerBill_immutable trigger definition';
    END IF;
  ELSE
    EXECUTE
      'CREATE TRIGGER "FoundationAccountingCustomerBill_immutable" ' ||
      'BEFORE UPDATE OR DELETE ON "FoundationAccountingCustomerBill" ' ||
      'FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"()';
  END IF;
END;
$$;

COMMIT;
