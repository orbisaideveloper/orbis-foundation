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
  FoundationAccountingOrganizationMembership
  FoundationAccountingUserIdentity
  FoundationAccountingPartyClaim
  FoundationLotteryAccountingPeriod
  FoundationLotteryDocumentSequence
  FoundationLotteryStockMovement
  FoundationLotteryStockistEntry
  FoundationLotterySale
  FoundationLotteryPayment
  FoundationLotterySettlement
  FoundationLotteryLedgerEntry
  FoundationLotteryAuditEvent
  FoundationLotteryEntryClearance
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

for item in   "FoundationAccountingOrganization:userLedgerStorage"   "FoundationAccountingParty:uniqueCode"   "FoundationAccountingParty:email"   "FoundationAccountingParty:emailNormalized"   "FoundationAccountingParty:phoneNormalized"   "FoundationAccountingOrganizationMembership:userId"   "FoundationAccountingOrganizationMembership:role"   "FoundationAccountingOrganizationMembership:status"   "FoundationAccountingUserIdentity:orbisId"   "FoundationAccountingPartyClaim:partyId"   "FoundationAccountingPartyClaim:userId"   "FoundationAccountingPartyClaim:claimMethod"   "FoundationAccountingPartyClaim:status"   "FoundationAccountingExpenseProfile:scheduleType"   "FoundationAccountingExpenseProfile:recurringStartsAt"   "FoundationAccountingExpenseBill:billingMonth"
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

for constraint in   FoundationAccountingOrganization_user_ledger_storage_check   FoundationAccountingOrganizationMembership_pkey   FoundationAccountingOrganizationMembership_role_check   FoundationAccountingOrganizationMembership_status_check   FoundationAccountingOrganizationMembership_organizationId_fkey   FoundationAccountingUserIdentity_pkey   FoundationAccountingPartyClaim_pkey   FoundationAccountingPartyClaim_claim_method_check   FoundationAccountingPartyClaim_status_check   FoundationAccountingPartyClaim_partyId_fkey   FoundationAccountingExpenseProfile_schedule_type_check   FoundationAccountingExpenseBill_billing_month_check
do
  count="$(sql "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.conname='${constraint}'")"
  if [[ "$count" == "1" ]]; then
    echo "PASS constraint: $constraint"
  else
    echo "FAIL constraint missing: $constraint"
    fail=1
  fi
done

for index in   FoundationAccountingParty_uniqueCode_key   FoundationAccountingOrganizationMembership_organizationId_userId_key   FoundationAccountingOrganizationMembership_userId_status_idx   FoundationAccountingOrganizationMembership_organizationId_status_idx   FoundationAccountingParty_emailNormalized_status_idx   FoundationAccountingParty_phoneNormalized_status_idx   FoundationAccountingUserIdentity_orbisId_key   FoundationAccountingPartyClaim_partyId_key   FoundationAccountingPartyClaim_userId_status_idx   FoundationAccountingExpenseBill_org_profile_month_key   FoundationAccountingExpenseProfile_org_schedule_idx
do
  count="$(sql "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname=left('${index}',63)")"
  if [[ "$count" == "1" ]]; then
    echo "PASS index: $index"
  else
    echo "FAIL index missing: $index"
    fail=1
  fi
done

echo
echo "Security migration state:"
for table in   FoundationAccountingOrganizationMembership   FoundationAccountingUserIdentity   FoundationAccountingPartyClaim   FoundationAccountingExpenseCategory   FoundationAccountingExpenseProfile   FoundationAccountingExpenseBill   FoundationAccountingExpensePayment   FoundationAccountingCustomerBill
do
  rls="$(sql "SELECT CASE WHEN relrowsecurity THEN 'ON' ELSE 'OFF' END FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='${table}'")"
  if [[ "$rls" == "ON" ]]; then
    echo "PASS RLS: $table"
  else
    echo "FAIL RLS: $table (${rls:-MISSING})"
    fail=1
  fi
done

for item in \
  "FoundationAccountingExpenseBill:FoundationAccountingExpenseBill_immutable" \
  "FoundationAccountingExpensePayment:FoundationAccountingExpensePayment_immutable" \
  "FoundationAccountingCustomerBill:FoundationAccountingCustomerBill_immutable"
do
  table="${item%%:*}"
  trigger="${item#*:}"
  count="$(sql "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='${table}' AND t.tgname='${trigger}' AND NOT t.tgisinternal")"
  if [[ "$count" == "1" ]]; then
    echo "PASS trigger: $trigger"
  else
    echo "FAIL trigger missing: $trigger"
    fail=1
  fi
done

grant_count="$(sql "SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated') AND table_name IN ('FoundationAccountingOrganizationMembership','FoundationAccountingUserIdentity','FoundationAccountingPartyClaim','FoundationAccountingExpenseCategory','FoundationAccountingExpenseProfile','FoundationAccountingExpenseBill','FoundationAccountingExpensePayment','FoundationAccountingCustomerBill')")"
if [[ "$grant_count" == "0" ]]; then
  echo "PASS direct app grants: none"
else
  echo "FAIL direct app grants remain on hardened Accounting tables: $grant_count"
  fail=1
fi

blank_party_codes="$(sql "SELECT count(*) FROM \"FoundationAccountingParty\" WHERE \"uniqueCode\" IS NULL OR btrim(\"uniqueCode\")=''")"
if [[ "$blank_party_codes" == "0" ]]; then
  echo "PASS party unique codes: complete"
else
  echo "FAIL party unique codes missing/blank: $blank_party_codes"
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo "DATABASE DRIFT CHECK: FAIL"
  exit 1
fi

echo "DATABASE DRIFT CHECK: PASS"
