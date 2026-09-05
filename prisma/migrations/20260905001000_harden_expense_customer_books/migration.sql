BEGIN;

ALTER TABLE "FoundationAccountingExpenseCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationAccountingExpenseProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationAccountingExpenseBill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationAccountingExpensePayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FoundationAccountingCustomerBill" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  "FoundationAccountingExpenseCategory",
  "FoundationAccountingExpenseProfile",
  "FoundationAccountingExpenseBill",
  "FoundationAccountingExpensePayment",
  "FoundationAccountingCustomerBill"
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "FoundationAccountingExpenseBill_immutable"
  BEFORE UPDATE OR DELETE ON "FoundationAccountingExpenseBill"
  FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"();

CREATE TRIGGER "FoundationAccountingExpensePayment_immutable"
  BEFORE UPDATE OR DELETE ON "FoundationAccountingExpensePayment"
  FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"();

CREATE TRIGGER "FoundationAccountingCustomerBill_immutable"
  BEFORE UPDATE OR DELETE ON "FoundationAccountingCustomerBill"
  FOR EACH ROW EXECUTE FUNCTION "FoundationLotteryRejectMutation"();

COMMIT;
