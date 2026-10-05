const { businessDateKey } = require("./accounting-business-date.cjs");
const ACCOUNTING_PAYMENT_METHODS = Object.freeze([
  "cashPaise", "bankPaise", "upiPaise", "chequePaise", "pwtPaise",
]);

function paymentMethodBalance(payments, method, expensePayments = []) {
  const posted = payments.reduce((balance, payment) => {
    const amount = BigInt(payment.methodSplit?.[method] || 0);
    return balance + (payment.direction === "RECEIPT" ? amount : -amount);
  }, 0n);
  return posted - expensePayments.reduce((total, payment) =>
    total + BigInt(payment[method] || 0), 0n);
}

function accountingMoneyBalances(payments, expensePayments = []) {
  return Object.fromEntries(ACCOUNTING_PAYMENT_METHODS.map((method) =>
    [method, paymentMethodBalance(payments, method, expensePayments)]));
}

function visiblePaymentRows(payments, clearances) {
  return payments.filter((payment) => !clearances.some((clearance) =>
    (clearance.scope === "ALL" || clearance.scope === "PAYMENT") &&
    businessDateKey(clearance.occurredAt) === businessDateKey(payment.occurredAt) &&
    new Date(payment.updatedAt || payment.createdAt || 0) <= new Date(clearance.createdAt)));
}

module.exports = { ACCOUNTING_PAYMENT_METHODS, paymentMethodBalance, accountingMoneyBalances, visiblePaymentRows };
