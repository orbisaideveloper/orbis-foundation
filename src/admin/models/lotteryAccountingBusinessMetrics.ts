import { accountingBusinessDate } from "./lotteryAccountingBusinessDate";
import { lotteryExpensePeriodCost } from "./lotteryAccountingExpenseBalance";
import type { LotteryWorkspace } from "./lotteryAccountingTypes";

export function lotteryBusinessMetrics(workspace: LotteryWorkspace, from: string, to: string) {
  const within = (value: string) => {
    const day = accountingBusinessDate(value);
    return Boolean(day && day >= from && day <= to);
  };
  const sum = (values: string[]) => values.reduce((total, value) => total + BigInt(value), 0n);
  const sales = [...workspace.sales, ...workspace.draftSales].filter((sale) => within(sale.occurredAt));
  const purchases = workspace.stockistEntries.filter((entry) => within(entry.occurredAt));
  const sellerGross = sum(sales.map((sale) => sale.grossSalesPaise));
  const customerGross = sum(workspace.customerBills.filter((bill) => within(bill.occurredAt)).map((bill) => bill.amountPaise));
  const stockistGross = sum(purchases.map((entry) => entry.grossPurchasePaise));
  const sellerCommission = sum(sales.map((sale) => sale.commissionPaise));
  const stockistCommission = sum(purchases.map((entry) => entry.commissionPaise));
  const commissionDifference = stockistCommission - sellerCommission;
  const expenses = lotteryExpensePeriodCost(workspace, from, to) +
    sum(workspace.payments.filter((payment) => payment.direction === "EXPENSE" && within(payment.occurredAt))
      .map((payment) => payment.totalAmountPaise));
  return { sales, purchases, sellerGross, customerGross, stockistGross, sellerCommission,
    stockistCommission, commissionDifference, expenses,
    profit: sellerGross + customerGross - stockistGross + commissionDifference - expenses };
}
