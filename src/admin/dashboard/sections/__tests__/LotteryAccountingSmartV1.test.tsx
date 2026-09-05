import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LotteryAccountingWorkspace } from "../LotteryAccountingWorkspace";
import type { LotteryAccountingClient } from "../../../models/lotteryAccountingClient";
import type { LotteryWorkspace } from "../../../models/lotteryAccountingTypes";

const RECORDED_AT = "2026-09-03T00:00:00.000Z";
const STOCKIST_A_ID = "stockist-a";
const CASH_CUSTOMER_ID = "cash-customer";
const SALARY_RAJU_ID = "salary-raju";
const DASHBOARD_TITLE = "Demo Lottery dashboard";
const organization = {
  id: "org-1",
  name: "Demo Lottery",
  tdsRateBps: 200,
  userLedgerStorage: "CLOUD" as const,
  status: "ACTIVE",
  createdAt: RECORDED_AT,
};

const workspace: LotteryWorkspace = {
  organization,
  parties: [
    {
      id: "seller-a",
      organizationId: "org-1",
      partyType: "SELLER",
      name: "Seller A",
      phone: null,
      uniqueCode: "seller-a-code",
      ticketRatePaise: "1000",
      commissionRateBps: 0,
      tdsRateBps: 0,
      status: "ACTIVE",
    },
    {
      id: "seller-b",
      organizationId: "org-1",
      partyType: "SELLER",
      name: "Seller B",
      phone: null,
      uniqueCode: "seller-b-code",
      ticketRatePaise: "1000",
      commissionRateBps: 0,
      tdsRateBps: 0,
      status: "ACTIVE",
    },
    {
      id: STOCKIST_A_ID,
      organizationId: "org-1",
      partyType: "STOCKIST",
      name: "Stockist A",
      phone: null,
      uniqueCode: "stockist-a-code",
      ticketRatePaise: "900",
      commissionRateBps: 0,
      tdsRateBps: 0,
      status: "ACTIVE",
    },
    {
      id: CASH_CUSTOMER_ID,
      organizationId: "org-1",
      partyType: "CUSTOMER",
      name: "Cash Customer",
      phone: null,
      uniqueCode: "cash-customer-code",
      ticketRatePaise: "0",
      commissionRateBps: 0,
      tdsRateBps: 0,
      status: "ACTIVE",
    },
  ],
  periods: [],
  stockMovements: [],
  stockistEntries: [
    {
      id: "purchase-1",
      partyId: STOCKIST_A_ID,
      partyName: "Stockist A",
      reference: "PUR-1",
      purchaseQuantity: "100",
      morningReturnQuantity: "5",
      dayReturnQuantity: "5",
      eveningReturnQuantity: "0",
      totalReturnQuantity: "10",
      netPurchaseQuantity: "90",
      unitRatePaise: "900",
      grossPurchasePaise: "81000",
      commissionPaise: "10000",
      tdsRateBps: 200,
      tdsPaise: "200",
      netPayablePaise: "71200",
      occurredAt: RECORDED_AT,
      source: "DAILY",
    },
  ],
  sales: [
    {
      id: "sale-1",
      partyId: "seller-a",
      partyName: "Seller A",
      periodId: null,
      periodLabel: null,
      reference: "SAL-1",
      dispatchQuantity: 100,
      morningReturnQuantity: 5,
      dayReturnQuantity: 5,
      eveningReturnQuantity: 0,
      returnQuantity: 10,
      netTickets: 90,
      ticketRatePaise: "1000",
      grossSalesPaise: "90000",
      commissionRateBps: 0,
      commissionPaise: "10000",
      tdsRateBps: 200,
      tdsPaise: "200",
      netPayablePaise: "80200",
      settledPaise: "0",
      outstandingPaise: "80200",
      status: "POSTED",
      occurredAt: RECORDED_AT,
    },
  ],
  draftSales: [],
  payments: [],
  settlements: [],
  ledgerEntries: [],
  auditEvents: [],
  expenseCategories: [
    {
      id: "salary",
      organizationId: "org-1",
      name: "Salary",
      status: "ACTIVE",
      createdAt: RECORDED_AT,
      updatedAt: RECORDED_AT,
    },
    {
      id: "electric",
      organizationId: "org-1",
      name: "Electric Bill",
      status: "ACTIVE",
      createdAt: RECORDED_AT,
      updatedAt: RECORDED_AT,
    },
  ],
  expenseProfiles: [
    {
      id: SALARY_RAJU_ID,
      organizationId: "org-1",
      categoryId: "salary",
      name: "Raju",
      usualAmountPaise: "720000",
      scheduleType: "MONTHLY",
      recurringStartsAt: RECORDED_AT,
      note: "Monthly",
      status: "ACTIVE",
      createdAt: RECORDED_AT,
      updatedAt: RECORDED_AT,
    },
  ],
  expenseBills: [
    {
      id: "bill-1",
      organizationId: "org-1",
      profileId: SALARY_RAJU_ID,
      profileName: "Raju",
      categoryId: "salary",
      categoryName: "Salary",
      amountPaise: "720000",
      reference: "EXB-1",
      billingMonth: "2026-09",
      occurredAt: RECORDED_AT,
      createdAt: RECORDED_AT,
    },
  ],
  expensePayments: [],
  customerBills: [
    {
      id: "customer-bill-1",
      organizationId: "org-1",
      partyId: CASH_CUSTOMER_ID,
      partyName: "Cash Customer",
      quantity: "1",
      unitRatePaise: "1000",
      amountPaise: "1000",
      reference: "CUS-1",
      occurredAt: RECORDED_AT,
      createdAt: RECORDED_AT,
    },
  ],
  summary: {
    verified: true,
    moneyUnit: "PAISE",
    salesCount: 1,
    paymentCount: 0,
    grossSalesPaise: "90000",
    commissionPaise: "10000",
    tdsPaise: "200",
    netPayablePaise: "80200",
    collectedPaise: "0",
    outgoingPaise: "0",
    expensePaise: "0",
    outstandingPaise: "80200",
    operatingResultPaise: "80200",
    netCashFlowPaise: "0",
    stock: {
      received: "100",
      dispatched: "100",
      returned: "10",
      stockistReturned: "10",
      adjustment: "0",
      closing: "0",
    },
    anomalies: [],
  },
  insights: [
    {
      skill: "profit-loss",
      status: "POSITIVE",
      amountPaise: "80200",
      sourceFields: ["netPayablePaise", "expensePaise"],
    },
  ],
};

function createApi(): LotteryAccountingClient {
  return {
    listOrganizations: vi.fn().mockResolvedValue([organization]),
    loadWorkspace: vi.fn().mockResolvedValue(workspace),
    createOrganization: vi.fn().mockResolvedValue(organization),
    createParty: vi.fn().mockResolvedValue(undefined),
    updatePartyProfile: vi.fn().mockResolvedValue(undefined),
    createExpenseCategory: vi.fn().mockResolvedValue(undefined),
    updateExpenseCategory: vi.fn().mockResolvedValue(undefined),
    createExpenseProfile: vi.fn().mockResolvedValue(undefined),
    updateExpenseProfile: vi.fn().mockResolvedValue(undefined),
    recordExpenseBill: vi.fn().mockResolvedValue(undefined),
    recordExpensePayment: vi.fn().mockResolvedValue(undefined),
    recordCustomerBill: vi.fn().mockResolvedValue(undefined),
    updateOrganizationTdsRate: vi.fn().mockResolvedValue(undefined),
    updateUserLedgerStorage: vi.fn().mockResolvedValue(undefined),
    createPeriod: vi.fn().mockResolvedValue(undefined),
    createFinancialYearPeriod: vi.fn().mockResolvedValue(undefined),
    recordStockMovement: vi.fn().mockResolvedValue(undefined),
    saveDailyStockistEntry: vi.fn().mockResolvedValue({
      partyId: STOCKIST_A_ID,
      occurredAt: RECORDED_AT,
    }),
    clearDailyEntries: vi.fn().mockResolvedValue(undefined),
    previewSale: vi.fn().mockResolvedValue({
      calculated: {
        netTickets: "90",
        grossSalesPaise: "90000",
        commissionPaise: "10000",
        tdsPaise: "200",
        netPayablePaise: "80200",
      },
      ledger: [],
    }),
    recordSale: vi.fn().mockResolvedValue(undefined),
    saveDailySellerDraft: vi.fn().mockResolvedValue({
      id: "draft-1",
      reference: "SAL-DRAFT",
      status: "DRAFT",
    }),
    updateDailySellerDraft: vi.fn().mockResolvedValue({
      id: "draft-1",
      reference: "SAL-DRAFT",
      status: "DRAFT",
    }),
    deleteDailySellerDraft: vi.fn().mockResolvedValue(undefined),
    postDailySellerDraft: vi.fn().mockResolvedValue(undefined),
    correctPostedSale: vi.fn().mockResolvedValue({
      id: "draft-2",
      reference: "SAL-COR",
      status: "DRAFT",
    }),
    recordPayment: vi.fn().mockResolvedValue(undefined),
    recordSettlement: vi.fn().mockResolvedValue(undefined),
  };
}

describe("LotteryAccountingWorkspace smart V1", () => {
  it("keeps the approved dashboard cards and priority dues", async () => {
    render(<LotteryAccountingWorkspace api={createApi()} />);
    expect(await screen.findByText(DASHBOARD_TITLE)).toBeInTheDocument();
    expect(screen.getByText("Net Profit")).toBeInTheDocument();
    expect(screen.getByText("Receivable")).toBeInTheDocument();
    expect(screen.getByText("Payable")).toBeInTheDocument();
    expect(screen.getByText("Commission reconciliation")).toBeInTheDocument();
    expect(screen.getByText("ORBIS AI business check")).toBeInTheDocument();
  });

  it("uses one seller in Grid while Table can still show every seller", async () => {
    render(<LotteryAccountingWorkspace api={createApi()} />);
    await screen.findByText(DASHBOARD_TITLE);
    fireEvent.click(screen.getByRole("button", { name: "Daily entry" }));
    const grid = await screen.findByRole("region", { name: "Seller grid" });
    expect(within(grid).getByText("Seller A")).toBeInTheDocument();
    expect(within(grid).queryByText("Seller B")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("Seller A")).toBeInTheDocument();
    expect(within(table).getByText("Seller B")).toBeInTheDocument();
  });

  it("filters Ledger Book then type then a particular account and period", async () => {
    render(<LotteryAccountingWorkspace api={createApi()} />);
    await screen.findByText(DASHBOARD_TITLE);
    fireEvent.click(screen.getByRole("button", { name: "Ledger" }));

    const book = screen.getByLabelText("Ledger Book");
    fireEvent.change(book, { target: { value: "commission" } });
    expect(screen.getByLabelText("Ledger type")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ledger type"), {
      target: { value: "seller" },
    });
    expect(screen.getByLabelText("Ledger Party")).toHaveValue(
      "commission-seller-seller-a",
    );
    expect(screen.getByRole("button", { name: "7 Days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compact List" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Table View" })).toBeInTheDocument();
  });

  it("keeps Expenses as top type with editable Category and Profile lists", async () => {
    render(<LotteryAccountingWorkspace api={createApi()} />);
    await screen.findByText(DASHBOARD_TITLE);
    fireEvent.click(screen.getByRole("button", { name: "Masters" }));
    fireEvent.click(screen.getByRole("button", { name: "Expenses" }));

    expect(screen.getByText("Expenses → Category → Profile/Name. Both Category and Profile can be added or edited.")).toBeInTheDocument();
    expect(screen.getByLabelText("Expense master category")).toHaveValue("salary");
    expect(screen.getByRole("button", { name: "+ Add Category" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Category" })).toBeInTheDocument();
    const addProfile = screen.getByRole("button", { name: "+ Add Profile" });
    expect(addProfile).toBeInTheDocument();
    fireEvent.click(addProfile);
    expect(screen.getByLabelText("Expense payment type")).toHaveValue("ONE_TIME");
    expect(screen.getByRole("option", { name: "Monthly recurring" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raju" })).toBeInTheDocument();
  });

  it("receives Customer money through the same Universal Payment", async () => {
    const api = createApi();
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(DASHBOARD_TITLE);
    fireEvent.click(screen.getByRole("button", { name: "Payment" }));
    fireEvent.change(screen.getByLabelText("Payment account type"), {
      target: { value: "CUSTOMER" },
    });
    expect(screen.getByLabelText("Payment party")).toHaveValue(CASH_CUSTOMER_ID);
    fireEvent.change(screen.getByLabelText("Payment Cash"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Receive ₹10\.00/ }));

    await waitFor(() => expect(api.recordPayment).toHaveBeenCalled());
    expect(api.recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        partyId: CASH_CUSTOMER_ID,
        direction: "RECEIPT",
        totalAmountPaise: "1000",
      }),
    );
  });
  it("shows a monthly expense due and accepts a partial payment from Universal Payment", async () => {
    const api = createApi();
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(DASHBOARD_TITLE);

    fireEvent.click(screen.getByRole("button", { name: "Payment" }));
    fireEvent.change(screen.getByLabelText("Payment account type"), {
      target: { value: "EXPENSE" },
    });

    expect(screen.getByLabelText("Expense subcategory")).toHaveValue("salary");
    expect(screen.getByLabelText("Payment party")).toHaveValue(SALARY_RAJU_ID);

    const currentBill = screen.getByText("Current Bill").parentElement;
    const pending = screen.getByText("Pending").parentElement;
    expect(currentBill).toHaveTextContent("₹7,200.00");
    expect(currentBill).toHaveTextContent("Monthly");
    expect(pending).toHaveTextContent("₹7,200.00");

    fireEvent.change(screen.getByLabelText("Payment Cash"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Pay ₹1,000\.00/ }));

    await waitFor(() => expect(api.recordExpensePayment).toHaveBeenCalled());
    expect(api.recordExpensePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: SALARY_RAJU_ID,
        totalAmountPaise: "100000",
        cashPaise: "100000",
      }),
    );
  });

});
