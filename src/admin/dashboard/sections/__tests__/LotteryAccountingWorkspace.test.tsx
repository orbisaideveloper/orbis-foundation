import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LotteryAccountingWorkspace } from "../LotteryAccountingWorkspace";
import type { LotteryAccountingClient } from "../../../models/lotteryAccountingClient";
import type { LotteryWorkspace } from "../../../models/lotteryAccountingTypes";

const ORGANIZATION_NAME = "Demo Lottery";
const ORGANIZATION_OVERVIEW = `${ORGANIZATION_NAME} dashboard`;
const SELLER_DISPATCH_LABEL = "Seller A dispatch";
const DAILY_SELLER_ENTRY = "Daily seller entry";
const MORNING_RETURN_LABEL = "Seller A morning return";
const DAY_RETURN_LABEL = "Seller A day return";
const EVENING_RETURN_LABEL = "Seller A evening return";
const COMMISSION_LABEL = "Seller A commission amount";
const BACKDATED_ENTRY_DATE = "2026-08-29";
const FINANCIAL_YEAR_2026 = "FY26-27";
const RECORDED_AT = "2026-08-30T00:00:00.000Z";
const STOCKIST_ID = "stockist-1";
const SAVE_TABLE_BUTTON = "Save table";
const STOCKIST_NAME = "Stockist A";
const ACCOUNTING_ENTRY_DATE = "2026-08-30";
const DAILY_ENTRY_BUTTON = "Daily entry";
const DASHBOARD_FROM_DATE_LABEL = "Dashboard from date";
const DASHBOARD_TO_DATE_LABEL = "Dashboard to date";
const SECOND_SELLER_CODE = "party-code-2";
const PAYMENT_CASH_LABEL = "Payment Cash";
const CURRENT_RECORDED_AT = "2026-09-05T00:00:00.000Z";
const AMOUNT_TO_RECEIVE_LABEL = "Amount to receive";

const organization = {
  id: "org-1",
  name: ORGANIZATION_NAME,
  tdsRateBps: 200,
  userLedgerStorage: "CLOUD" as const,
  status: "ACTIVE",
  createdAt: "2026-08-31T00:00:00.000Z",
};

const workspace: LotteryWorkspace = {
  organization,
  parties: [
    {
      id: "party-1",
      organizationId: "org-1",
      partyType: "SELLER",
      name: "Seller A",
      phone: null,
      uniqueCode: "party-code-1",
      ticketRatePaise: "1000",
      commissionRateBps: 500,
      tdsRateBps: 1000,
      status: "ACTIVE",
    },
    {
      id: STOCKIST_ID,
      organizationId: "org-1",
      partyType: "STOCKIST",
      name: STOCKIST_NAME,
      phone: null,
      uniqueCode: "stockist-code-1",
      ticketRatePaise: "800",
      status: "ACTIVE",
    },
  ],
  periods: [
    {
      id: "period-1",
      organizationId: "org-1",
      label: FINANCIAL_YEAR_2026,
      startsAt: "2026-04-01T00:00:00.000Z",
      endsAt: "2027-03-31T00:00:00.000Z",
      status: "OPEN",
    },
  ],
  stockMovements: [
    {
      id: "stock-1",
      partyId: null,
      partyName: null,
      movementType: "RECEIPT",
      quantity: "120",
      unitRatePaise: "0",
      grossPurchasePaise: "0",
      commissionPaise: "0",
      tdsRateBps: 0,
      tdsPaise: "0",
      netPayablePaise: "0",
      reference: "STK-1",
      occurredAt: RECORDED_AT,
    },
    {
      id: "stock-2",
      partyId: null,
      partyName: null,
      movementType: "DISPATCH",
      quantity: "100",
      unitRatePaise: "0",
      grossPurchasePaise: "0",
      commissionPaise: "0",
      tdsRateBps: 0,
      tdsPaise: "0",
      netPayablePaise: "0",
      reference: "SALE-1",
      occurredAt: RECORDED_AT,
    },
    {
      id: "stock-3",
      partyId: null,
      partyName: null,
      movementType: "RETURN",
      quantity: "20",
      unitRatePaise: "0",
      grossPurchasePaise: "0",
      commissionPaise: "0",
      tdsRateBps: 0,
      tdsPaise: "0",
      netPayablePaise: "0",
      reference: "SALE-1",
      occurredAt: RECORDED_AT,
    },
  ],
  stockistEntries: [],
  sales: [
    {
      id: "sale-1",
      partyId: "party-1",
      partyName: "Seller A",
      periodId: "period-1",
      periodLabel: FINANCIAL_YEAR_2026,
      reference: "SALE-1",
      dispatchQuantity: 100,
      morningReturnQuantity: 5,
      dayReturnQuantity: 10,
      eveningReturnQuantity: 5,
      returnQuantity: 20,
      netTickets: 80,
      ticketRatePaise: "1000",
      grossSalesPaise: "80000",
      commissionRateBps: 500,
      commissionPaise: "4000",
      tdsRateBps: 1000,
      tdsPaise: "400",
      netPayablePaise: "76400",
      settledPaise: "40000",
      outstandingPaise: "36400",
      status: "POSTED",
      occurredAt: RECORDED_AT,
    },
  ],
  draftSales: [],
  payments: [
    {
      id: "payment-1",
      partyId: "party-1",
      partyName: "Seller A",
      periodId: "period-1",
      periodLabel: FINANCIAL_YEAR_2026,
      direction: "RECEIPT",
      totalAmountPaise: "50000",
      methodSplit: { cashPaise: "50000" },
      reference: "PAY-1",
      settledPaise: "40000",
      availablePaise: "10000",
      occurredAt: RECORDED_AT,
    },
  ],
  settlements: [],
  ledgerEntries: [
    {
      id: "ledger-1",
      sourceType: "LOTTERY_SALE",
      sourceId: "sale-1",
      lineNumber: 1,
      accountCode: "PARTY_RECEIVABLE",
      side: "DEBIT",
      amountPaise: "76400",
      occurredAt: RECORDED_AT,
    },
  ],
  auditEvents: [
    {
      id: "audit-1",
      eventType: "SALE_POSTED",
      entityType: "SALE",
      entityId: "sale-1",
      createdAt: RECORDED_AT,
    },
  ],
  expenseCategories: [],
  expenseProfiles: [],
  expenseBills: [],
  expensePayments: [],
  customerBills: [],
  summary: {
    verified: true,
    moneyUnit: "PAISE",
    salesCount: 1,
    paymentCount: 1,
    grossSalesPaise: "80000",
    commissionPaise: "4000",
    tdsPaise: "400",
    netPayablePaise: "76400",
    collectedPaise: "50000",
    outgoingPaise: "0",
    expensePaise: "0",
    outstandingPaise: "26400",
    operatingResultPaise: "76400",
    netCashFlowPaise: "50000",
    stock: {
      received: "120",
      dispatched: "100",
      returned: "20",
      stockistReturned: "0",
      adjustment: "0",
      closing: "40",
    },
    anomalies: [],
  },
  insights: [
    {
      skill: "profit-loss",
      status: "POSITIVE",
      amountPaise: "76400",
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
      partyId: STOCKIST_ID,
      occurredAt: "2026-09-01T00:00:00.000Z",
    }),
    previewSale: vi.fn().mockResolvedValue({
      calculated: {
        netTickets: "80",
        grossSalesPaise: "80000",
        commissionPaise: "4000",
        tdsPaise: "400",
        netPayablePaise: "76400",
      },
      ledger: [
        {
          lineNumber: 1,
          accountCode: "PARTY_RECEIVABLE",
          side: "DEBIT",
          amountPaise: "76400",
        },
      ],
    }),
    recordSale: vi.fn().mockResolvedValue(undefined),
    saveDailySellerDraft: vi.fn().mockResolvedValue({
      id: "draft-1",
      reference: "SAL-2026-1",
      status: "DRAFT",
    }),
    updateDailySellerDraft: vi.fn().mockResolvedValue({
      id: "draft-1",
      reference: "SAL-2026-1",
      status: "DRAFT",
    }),
    deleteDailySellerDraft: vi.fn().mockResolvedValue(undefined),
    postDailySellerDraft: vi.fn().mockResolvedValue(undefined),
    correctPostedSale: vi.fn().mockResolvedValue({
      id: "draft-corrected-1",
      reference: "SAL-2026-2",
      status: "DRAFT",
    }),
    recordPayment: vi.fn().mockResolvedValue({
      id: "payment-new",
      partyId: "party-1",
      periodId: null,
      direction: "RECEIPT",
      totalAmountPaise: "10000",
      methodSplit: {
        cashPaise: "10000",
        bankPaise: "0",
        upiPaise: "0",
        chequePaise: "0",
        pwtPaise: "0",
      },
      reference: "PAY-NEW",
      occurredAt: RECORDED_AT,
    }),
    recordSettlement: vi.fn().mockResolvedValue(undefined),
  };
}

describe("LotteryAccountingWorkspace", () => {
  it("shows the smart dashboard and opens the hierarchical seller ledger", async () => {
    render(<LotteryAccountingWorkspace api={createApi()} />);
    expect(await screen.findByText(ORGANIZATION_OVERVIEW)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Net Profit")).toBeInTheDocument();
    expect(screen.getByText("Receivable")).toBeInTheDocument();
    expect(screen.getByText("Payable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ledger" }));
    expect(await screen.findByText("Universal Ledger Hub")).toBeInTheDocument();
    expect(screen.getByLabelText("Ledger Book")).toHaveValue("seller");
    expect(screen.getByLabelText("Ledger Party")).toHaveValue("party-1");
    expect(screen.getByRole("button", { name: "Compact List" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Table View" })).toBeInTheDocument();
  });

  it("shows business commission reconciliation and profit or loss for the selected dates", async () => {
    const reconciliationWorkspace: LotteryWorkspace = {
      ...workspace,
      stockistEntries: [
        {
          id: "stockist-profit-1",
          partyId: STOCKIST_ID,
          partyName: STOCKIST_NAME,
          reference: "PUR-PROFIT-1",
          purchaseQuantity: "100",
          morningReturnQuantity: "0",
          dayReturnQuantity: "0",
          eveningReturnQuantity: "0",
          totalReturnQuantity: "0",
          netPurchaseQuantity: "100",
          unitRatePaise: "700",
          grossPurchasePaise: "70000",
          commissionPaise: "5000",
          tdsRateBps: 0,
          tdsPaise: "0",
          netPayablePaise: "65000",
          occurredAt: RECORDED_AT,
          source: "DAILY",
        },
      ],
      payments: [
        ...workspace.payments,
        {
          id: "expense-1",
          partyId: "party-1",
          partyName: "Seller A",
          periodId: null,
          periodLabel: null,
          direction: "EXPENSE",
          totalAmountPaise: "2000",
          methodSplit: { cashPaise: "2000" },
          reference: "EXP-1",
          settledPaise: "0",
          availablePaise: "2000",
          occurredAt: RECORDED_AT,
        },
      ],
    };
    const api = createApi();
    vi.mocked(api.loadWorkspace).mockResolvedValue(reconciliationWorkspace);

    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText(DASHBOARD_FROM_DATE_LABEL), {
      target: { value: ACCOUNTING_ENTRY_DATE },
    });
    fireEvent.change(screen.getByLabelText(DASHBOARD_TO_DATE_LABEL), {
      target: { value: ACCOUNTING_ENTRY_DATE },
    });

    expect(screen.getByText("Commission reconciliation")).toBeInTheDocument();
    expect(screen.getByText("Profit & Loss")).toBeInTheDocument();

    const profitCard = screen.getByText("Net Profit").parentElement;
    expect(profitCard).toHaveTextContent("₹90.00");
    expect(screen.getAllByText("₹10.00").length).toBeGreaterThan(0);
  });

  it("keeps one selected seller in Grid and every seller in Table view", async () => {
    const multiSellerWorkspace: LotteryWorkspace = {
      ...workspace,
      parties: [
        ...workspace.parties,
        {
          id: "party-2",
          organizationId: "org-1",
          partyType: "SELLER",
          name: "Seller B",
          phone: null,
          uniqueCode: SECOND_SELLER_CODE,
          ticketRatePaise: "1000",
          status: "ACTIVE",
        },
      ],
    };
    const api = createApi();
    vi.mocked(api.loadWorkspace).mockResolvedValue(multiSellerWorkspace);

    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: DAILY_ENTRY_BUTTON }));

    const sellerGrid = await screen.findByRole("region", { name: "Seller grid" });
    expect(within(sellerGrid).getByText("Seller A")).toBeInTheDocument();
    expect(within(sellerGrid).queryByText("Seller B")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    const sellerTable = screen.getByRole("table");
    expect(within(sellerTable).getByText("Seller A")).toBeInTheDocument();
    expect(within(sellerTable).getByText("Seller B")).toBeInTheDocument();
  });

  it("shows date-wise stockist outstanding and saves one split payment across methods", async () => {
    const paymentWorkspace: LotteryWorkspace = {
      ...workspace,
      stockistEntries: [
        {
          id: "stockist-entry-payment",
          partyId: STOCKIST_ID,
          partyName: STOCKIST_NAME,
          reference: "PUR-1",
          purchaseQuantity: "100",
          morningReturnQuantity: "0",
          dayReturnQuantity: "0",
          eveningReturnQuantity: "0",
          totalReturnQuantity: "0",
          netPurchaseQuantity: "100",
          unitRatePaise: "600",
          grossPurchasePaise: "60000",
          commissionPaise: "0",
          tdsRateBps: 0,
          tdsPaise: "0",
          netPayablePaise: "60000",
          occurredAt: RECORDED_AT,
          source: "DAILY",
        },
      ],
      payments: [
        {
          ...workspace.payments[0],
          methodSplit: {
            cashPaise: "20000",
            bankPaise: "20000",
            upiPaise: "0",
            chequePaise: "0",
            pwtPaise: "10000",
          },
        },
      ],
    };
    const api = createApi();
    vi.mocked(api.loadWorkspace).mockResolvedValue(paymentWorkspace);

    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    expect(screen.getByText("Current money")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Payment" }));
    fireEvent.change(screen.getByLabelText("Payment account type"), {
      target: { value: "STOCKIST" },
    });
    fireEvent.change(screen.getByLabelText("Payment party"), {
      target: { value: STOCKIST_ID },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: ACCOUNTING_ENTRY_DATE },
    });

    expect(await screen.findByText("Amount to pay")).toBeInTheDocument();
    expect(screen.getAllByText("₹600.00").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(PAYMENT_CASH_LABEL), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Payment Bank"), {
      target: { value: "150" },
    });
    fireEvent.change(screen.getByLabelText("Payment PWT"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pay ₹300.00" }));

    await waitFor(() => expect(api.recordPayment).toHaveBeenCalled());
    expect(api.recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        partyId: STOCKIST_ID,
        direction: "PAYMENT",
        totalAmountPaise: "30000",
        methodSplit: {
          cashPaise: "10000",
          bankPaise: "15000",
          upiPaise: "0",
          chequePaise: "0",
          pwtPaise: "5000",
        },
      }),
    );
  });

  it("uses one selected stockist entry with timed returns", async () => {
    const api = createApi();
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: DAILY_ENTRY_BUTTON }));
    fireEvent.click(screen.getByRole("button", { name: "Stockist Purchase" }));

    expect(await screen.findByText("Daily purchase and stockist return")).toBeInTheDocument();
    expect(screen.getByText("Stockist entry")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Stockist A purchase"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Stockist A morning return"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Stockist A day return"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_TABLE_BUTTON }));

    await waitFor(() => expect(api.saveDailyStockistEntry).toHaveBeenCalled());
    expect(api.saveDailyStockistEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        partyId: STOCKIST_ID,
        purchaseQuantity: "100",
        morningReturnQuantity: "10",
        dayReturnQuantity: "5",
        eveningReturnQuantity: "0",
        commissionPaise: "0",
      }),
    );
  });

  it("keeps the selected seller's backdated latest draft on screen", async () => {
    const api = createApi();
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: DAILY_ENTRY_BUTTON }));

    expect(await screen.findByText(DAILY_SELLER_ENTRY)).toBeInTheDocument();
    expect(screen.getByText(/Daily saved total/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Entry date for all sellers"), {
      target: { value: BACKDATED_ENTRY_DATE },
    });
    fireEvent.change(screen.getByLabelText(SELLER_DISPATCH_LABEL), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText(MORNING_RETURN_LABEL), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(DAY_RETURN_LABEL), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText(EVENING_RETURN_LABEL), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText(COMMISSION_LABEL), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_TABLE_BUTTON }));

    await waitFor(() => expect(api.saveDailySellerDraft).toHaveBeenCalled());
    expect(api.saveDailySellerDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        partyId: "party-1",
        periodId: null,
        dispatchQuantity: "100",
        morningReturnQuantity: "10",
        dayReturnQuantity: "20",
        eveningReturnQuantity: "5",
        commissionPaise: "10000",
      }),
    );
  });

  it("locks seller partial, exact, and over-receipt credit with non-blocking reconciliation", async () => {
    const cases = [
      {
        duePaise: "9500",
        enteredRupees: "90",
        enteredPaise: "9000",
        afterBeforeSave: "₹5.00",
        afterSaved: "₹5.00",
      },
      {
        duePaise: "9800",
        enteredRupees: "98",
        enteredPaise: "9800",
        afterBeforeSave: "₹0.00",
        afterSaved: "₹0.00",
      },
      {
        duePaise: "9800",
        enteredRupees: "100",
        enteredPaise: "10000",
        afterBeforeSave: "₹2.00 credit",
        afterSaved: "-₹2.00",
      },
    ];

    for (const [index, item] of cases.entries()) {
      const paymentWorkspace: LotteryWorkspace = {
        ...workspace,
        sales: [
          {
            ...workspace.sales[0],
            id: `receipt-case-${index}`,
            netPayablePaise: item.duePaise,
            outstandingPaise: item.duePaise,
          },
        ],
        payments: [],
      };
      const api = createApi();
      vi.mocked(api.loadWorkspace)
        .mockResolvedValueOnce(paymentWorkspace)
        .mockImplementation(() => new Promise<LotteryWorkspace>(() => {}));
      vi.mocked(api.recordPayment).mockResolvedValue({
        id: `payment-case-${index}`,
        partyId: "party-1",
        periodId: null,
        direction: "RECEIPT",
        totalAmountPaise: item.enteredPaise,
        methodSplit: {
          cashPaise: item.enteredPaise,
          bankPaise: "0",
          upiPaise: "0",
          chequePaise: "0",
          pwtPaise: "0",
        },
        reference: `PAY-CASE-${index}`,
        occurredAt: CURRENT_RECORDED_AT,
      });

      const view = render(<LotteryAccountingWorkspace api={api} />);
      await screen.findByText(ORGANIZATION_OVERVIEW);
      fireEvent.click(screen.getByRole("button", { name: "Payment" }));
      await screen.findByText(AMOUNT_TO_RECEIVE_LABEL);

      fireEvent.change(screen.getByLabelText(PAYMENT_CASH_LABEL), {
        target: { value: item.enteredRupees },
      });

      const afterCard = screen.getByText("After").parentElement;
      expect(afterCard).toHaveTextContent(item.afterBeforeSave);

      fireEvent.click(
        screen.getByRole("button", {
          name: `Receive ₹${Number(item.enteredRupees).toFixed(2)}`,
        }),
      );

      await waitFor(() => expect(api.recordPayment).toHaveBeenCalledOnce());
      expect(api.recordPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          partyId: "party-1",
          direction: "RECEIPT",
          totalAmountPaise: item.enteredPaise,
        }),
      );
      expect(await screen.findByText("Receipt saved.")).toBeInTheDocument();

      const outstandingCard = screen.getByText(AMOUNT_TO_RECEIVE_LABEL).parentElement;
      await waitFor(() =>
        expect(outstandingCard).toHaveTextContent(item.afterSaved),
      );
      expect(vi.mocked(api.loadWorkspace).mock.calls.length).toBeGreaterThanOrEqual(2);

      view.unmount();
    }
  });

  it("carries a prior seller credit into the next bill instead of losing or discounting it", async () => {
    const creditWorkspace: LotteryWorkspace = {
      ...workspace,
      sales: [
        {
          ...workspace.sales[0],
          id: "old-sale",
          netPayablePaise: "9800",
          outstandingPaise: "9800",
          occurredAt: RECORDED_AT,
        },
        {
          ...workspace.sales[0],
          id: "next-sale",
          reference: "SALE-NEXT",
          netPayablePaise: "10000",
          outstandingPaise: "10000",
          occurredAt: CURRENT_RECORDED_AT,
        },
      ],
      payments: [
        {
          ...workspace.payments[0],
          id: "credit-payment",
          totalAmountPaise: "10000",
          methodSplit: { cashPaise: "10000" },
          settledPaise: "0",
          availablePaise: "10000",
          occurredAt: RECORDED_AT,
        },
      ],
    };
    const api = createApi();
    vi.mocked(api.loadWorkspace).mockResolvedValue(creditWorkspace);

    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: "Payment" }));

    const receiveCard = (await screen.findByText(AMOUNT_TO_RECEIVE_LABEL)).parentElement;
    expect(receiveCard).toHaveTextContent("₹98.00");
  });

  it("keeps outgoing Stockist overpayment blocked", async () => {
    const outgoingWorkspace: LotteryWorkspace = {
      ...workspace,
      stockistEntries: [
        {
          id: "stockist-due-98",
          partyId: STOCKIST_ID,
          partyName: STOCKIST_NAME,
          reference: "PUR-98",
          purchaseQuantity: "98",
          morningReturnQuantity: "0",
          dayReturnQuantity: "0",
          eveningReturnQuantity: "0",
          totalReturnQuantity: "0",
          netPurchaseQuantity: "98",
          unitRatePaise: "100",
          grossPurchasePaise: "9800",
          commissionPaise: "0",
          tdsRateBps: 0,
          tdsPaise: "0",
          netPayablePaise: "9800",
          occurredAt: CURRENT_RECORDED_AT,
          source: "DAILY",
        },
      ],
      payments: [],
    };
    const api = createApi();
    vi.mocked(api.loadWorkspace).mockResolvedValue(outgoingWorkspace);

    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: "Payment" }));
    fireEvent.change(screen.getByLabelText("Payment account type"), {
      target: { value: "STOCKIST" },
    });
    fireEvent.change(screen.getByLabelText(PAYMENT_CASH_LABEL), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pay ₹100.00" }));

    expect(
      await screen.findByText(
        "Entered amount is greater than the current outstanding.",
      ),
    ).toBeInTheDocument();
    expect(api.recordPayment).not.toHaveBeenCalled();
  });

  it("shows All accounts only for multiple ledger accounts and combines their statement rows", async () => {
    const sellerB = {
      ...workspace.parties[0],
      id: "party-2",
      name: "Seller B",
      uniqueCode: SECOND_SELLER_CODE,
    };
    const multiSellerWorkspace: LotteryWorkspace = {
      ...workspace,
      parties: [...workspace.parties, sellerB],
      sales: [
        ...workspace.sales,
        {
          ...workspace.sales[0],
          id: "sale-2",
          partyId: "party-2",
          partyName: "Seller B",
          reference: "SALE-2",
          dispatchQuantity: 40,
          returnQuantity: 3,
          morningReturnQuantity: 1,
          dayReturnQuantity: 1,
          eveningReturnQuantity: 1,
          netTickets: 37,
          grossSalesPaise: "37000",
          commissionPaise: "0",
          tdsPaise: "0",
          netPayablePaise: "37000",
          settledPaise: "0",
          outstandingPaise: "37000",
        },
      ],
    };
    const api = createApi();
    vi.mocked(api.loadWorkspace).mockResolvedValue(multiSellerWorkspace);

    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: "Ledger" }));

    const partySelect = await screen.findByLabelText("Ledger Party");
    expect(
      within(partySelect).getByRole("option", { name: "All accounts (2)" }),
    ).toBeInTheDocument();

    fireEvent.change(partySelect, { target: { value: "__ALL__" } });
    expect(partySelect).toHaveValue("__ALL__");
    expect(await screen.findByText("All selected ledgers")).toBeInTheDocument();

    const sellerRow = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.textContent?.includes("Seller A") &&
          button.textContent?.includes("Seller Ledger"),
      );
    expect(sellerRow).toBeDefined();
    fireEvent.click(sellerRow!);

    expect(await screen.findByText("All accounts · 2")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Account" })).toBeInTheDocument();
    expect(screen.getAllByText("Seller A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Seller B").length).toBeGreaterThan(0);
  });

  it("keeps Dashboard dispatch and unsold details party-wise without Morning/Day/Evening split", async () => {
    const sellerB = {
      ...workspace.parties[0],
      id: "party-2",
      name: "Seller B",
      uniqueCode: SECOND_SELLER_CODE,
    };
    const drilldownWorkspace: LotteryWorkspace = {
      ...workspace,
      parties: [...workspace.parties, sellerB],
      sales: [
        ...workspace.sales,
        {
          ...workspace.sales[0],
          id: "sale-drilldown-2",
          partyId: "party-2",
          partyName: "Seller B",
          reference: "SALE-DRILLDOWN-2",
          dispatchQuantity: 37,
          morningReturnQuantity: 1,
          dayReturnQuantity: 1,
          eveningReturnQuantity: 1,
          returnQuantity: 3,
          netTickets: 34,
          grossSalesPaise: "34000",
          commissionPaise: "0",
          tdsPaise: "0",
          netPayablePaise: "34000",
          settledPaise: "0",
          outstandingPaise: "34000",
        },
      ],
    };
    const api = createApi();
    vi.mocked(api.loadWorkspace).mockResolvedValue(drilldownWorkspace);

    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText(DASHBOARD_FROM_DATE_LABEL), {
      target: { value: ACCOUNTING_ENTRY_DATE },
    });
    fireEvent.change(screen.getByLabelText(DASHBOARD_TO_DATE_LABEL), {
      target: { value: ACCOUNTING_ENTRY_DATE },
    });

    const dispatchButton = screen.getByText("Dispatch").closest("button");
    expect(dispatchButton).not.toBeNull();
    fireEvent.click(dispatchButton!);

    const dispatchSection = (await screen.findByText(/Dispatch details/)).closest(
      "section",
    );
    expect(dispatchSection).not.toBeNull();
    expect(within(dispatchSection!).getByText("Seller A")).toBeInTheDocument();
    expect(within(dispatchSection!).getByText("Seller B")).toBeInTheDocument();
    expect(within(dispatchSection!).getByText("100")).toBeInTheDocument();
    expect(within(dispatchSection!).getByText("37")).toBeInTheDocument();

    const returnButton = screen.getByText("Unsold / Return").closest("button");
    expect(returnButton).not.toBeNull();
    fireEvent.click(returnButton!);

    const returnSection = (
      await screen.findByText(/Unsold \/ Return totals/)
    ).closest("section");
    expect(returnSection).not.toBeNull();
    expect(within(returnSection!).getByText("Seller A")).toBeInTheDocument();
    expect(within(returnSection!).getByText("Seller B")).toBeInTheDocument();
    expect(within(returnSection!).getByText("20")).toBeInTheDocument();
    expect(within(returnSection!).getByText("3")).toBeInTheDocument();
    expect(within(returnSection!).queryByText(/Morning/i)).not.toBeInTheDocument();
    expect(within(returnSection!).queryByText(/Day/i)).not.toBeInTheDocument();
    expect(within(returnSection!).queryByText(/Evening/i)).not.toBeInTheDocument();
  });

  it("opens the Cash ledger shortcut with the Dashboard custom date bounds", async () => {
    const api = createApi();
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);

    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText(DASHBOARD_FROM_DATE_LABEL), {
      target: { value: ACCOUNTING_ENTRY_DATE },
    });
    fireEvent.change(screen.getByLabelText(DASHBOARD_TO_DATE_LABEL), {
      target: { value: ACCOUNTING_ENTRY_DATE },
    });

    const cashButton = screen.getByText("Cash").closest("button");
    expect(cashButton).not.toBeNull();
    fireEvent.click(cashButton!);

    expect(await screen.findByText("Universal Ledger Hub")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Ledger Book")).toHaveValue("money");
      expect(screen.getByLabelText("Ledger type")).toHaveValue("cashPaise");
      expect(screen.getByLabelText("Ledger from date")).toHaveValue(
        ACCOUNTING_ENTRY_DATE,
      );
      expect(screen.getByLabelText("Ledger to date")).toHaveValue(
        ACCOUNTING_ENTRY_DATE,
      );
    });
  });

});
