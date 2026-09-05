#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL is required.}"
command -v psql >/dev/null 2>&1 || {
  echo "psql is required for the direct read-only database drift check." >&2
  exit 2
}

echo "ORBIS Accounting DB drift check (READ-ONLY)"
echo "No migration or write SQL will be executed."

sql() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "$1"
}

required_tables=(
  FoundationAccountingOrganization
  FoundationAccountingParty
  FoundationLotterySale
  FoundationLotteryPayment
  FoundationLotteryLedgerEntry
  FoundationLotteryAuditEvent
  FoundationAccountingExpenseCategory
  FoundationAccountingExpenseProfile
  FoundationAccountingExpenseBill
  FoundationAccountingExpensePayment
  FoundationAccountingCustomerBill
)

fail=0
for table in "${required_tables[@]}"; do
  count="$(sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}'")"
  if [[ "$count" == "1" ]]; then
    echo "PASS table: $table"
  else
    echo "FAIL table missing: $table"
    fail=1
  fi
done

for item in   "FoundationAccountingExpenseProfile:scheduleType"   "FoundationAccountingExpenseProfile:recurringStartsAt"   "FoundationAccountingExpenseBill:billingMonth"
do
  table="${item%%:*}"
  column="${item#*:}"
  count="$(sql "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}'")"
  if [[ "$count" == "1" ]]; then
    echo "PASS column: $table.$column"
  else
    echo "FAIL column missing: $table.$column"
    fail=1
  fi
done

for constraint in   FoundationAccountingExpenseProfile_schedule_type_check   FoundationAccountingExpenseBill_billing_month_check
do
  count="$(sql "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.conname='${constraint}'")"
  if [[ "$count" == "1" ]]; then
    echo "PASS constraint: $constraint"
  else
    echo "FAIL constraint missing: $constraint"
    fail=1
  fi
done

for index in   FoundationAccountingExpenseBill_org_profile_month_key   FoundationAccountingExpenseProfile_org_schedule_idx
do
  count="$(sql "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='${index}'")"
  if [[ "$count" == "1" ]]; then
    echo "PASS index: $index"
  else
    echo "FAIL index missing: $index"
    fail=1
  fi
done

echo
echo "Security visibility (diagnostic):"
for table in   FoundationAccountingExpenseCategory   FoundationAccountingExpenseProfile   FoundationAccountingExpenseBill   FoundationAccountingExpensePayment   FoundationAccountingCustomerBill
do
  rls="$(sql "SELECT CASE WHEN relrowsecurity THEN 'ON' ELSE 'OFF' END FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='${table}'")"
  echo "RLS $table: ${rls:-MISSING}"
done

if [[ "$fail" -ne 0 ]]; then
  echo "DATABASE DRIFT CHECK: FAIL"
  exit 1
fi

echo "DATABASE DRIFT CHECK: PASS"
