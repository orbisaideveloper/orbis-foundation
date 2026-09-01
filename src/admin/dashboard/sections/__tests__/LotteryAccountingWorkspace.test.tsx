import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LotteryAccountingWorkspace } from "../LotteryAccountingWorkspace";
import type { LotteryAccountingClient } from "../../../models/lotteryAccountingClient";
import type { LotteryWorkspace } from "../../../models/lotteryAccountingTypes";

const ORGANIZATION_NAME = "Demo Lottery";
const ORGANIZATION_OVERVIEW = `${ORGANIZATION_NAME} dashboard`;
const SELLER_DISPATCH_LABEL = "Seller A dispatch";
const DAILY_SELLERS_TAB = "Daily entry";
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
      name: "Stockist A",
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
    recordPayment: vi.fn().mockResolvedValue(undefined),
    recordSettlement: vi.fn().mockResolvedValue(undefined),
  };
}

describe("LotteryAccountingWorkspace", () => {
  it("shows a simple dashboard, party ledger and read-only AI insights", async () => {
    render(<LotteryAccountingWorkspace api={createApi()} />);
    expect(await screen.findByText(ORGANIZATION_OVERVIEW)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Return waiting")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Records" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI analysis" }));
    expect(
      await screen.findByText("Verified accounting AI"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This AI cannot write records/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ledger" }));
    expect(await screen.findByText("Party ledger")).toBeInTheDocument();
    expect(screen.getByText("Day-wise ledger")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("From date"), {
      target: { value: "2026-08-29" },
    });
    fireEvent.change(screen.getByLabelText("To date"), {
      target: { value: "2026-08-30" },
    });
    expect(screen.getByText("Daily stock check")).toBeInTheDocument();
    expect(screen.getByText("40 in hand")).toBeInTheDocument();
    expect(screen.getByText("No purchase")).toBeInTheDocument();
  });

  it("uses one seller-style stockist grid for purchase and timed returns", async () => {
    const api = createApi();
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: DAILY_SELLERS_TAB }));
    fireEvent.click(screen.getByRole("button", { name: "Stockist purchase" }));

    expect(await screen.findByText("Daily purchase and stockist return")).toBeInTheDocument();
    expect(screen.getByText("Stockist grid")).toBeInTheDocument();
    expect(screen.queryByLabelText("Original purchase receipt")).not.toBeInTheDocument();
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

  it("shows the mobile seller table with shared date, three returns and daily totals", async () => {
    const api = createApi();
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: DAILY_SELLERS_TAB }));

    expect(await screen.findByText(DAILY_SELLER_ENTRY)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Table view" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Daily saved total/)).toBeInTheDocument();
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
        periodId: "period-1",
        dispatchQuantity: "100",
        morningReturnQuantity: "10",
        dayReturnQuantity: "20",
        eveningReturnQuantity: "5",
        commissionPaise: "10000",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
    expect(await screen.findByText(/Fixed rate ₹10\.00/)).toBeInTheDocument();
  });

  it("keeps a seller row on screen when the Admin server rejects its draft", async () => {
    const api = createApi();
    vi.mocked(api.saveDailySellerDraft).mockRejectedValueOnce(
      new Error("PARTY_PROFILE_REQUIRED"),
    );
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: DAILY_SELLERS_TAB }));
    await screen.findByText(DAILY_SELLER_ENTRY);
    fireEvent.change(screen.getByLabelText(SELLER_DISPATCH_LABEL), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE_TABLE_BUTTON }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "PARTY_PROFILE_REQUIRED",
    );
    expect(screen.getByLabelText(SELLER_DISPATCH_LABEL)).toHaveValue("10");
  });

  it("replaces a backdated seller value and keeps the latest draft on screen", async () => {
    const api = createApi();
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: DAILY_SELLERS_TAB }));
    await screen.findByText(DAILY_SELLER_ENTRY);

    fireEvent.change(screen.getByLabelText("Entry date for all sellers"), {
      target: { value: BACKDATED_ENTRY_DATE },
    });
    const dispatch = screen.getByLabelText(SELLER_DISPATCH_LABEL);
    fireEvent.focus(dispatch);
    fireEvent.change(dispatch, { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(MORNING_RETURN_LABEL), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(DAY_RETURN_LABEL), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText(EVENING_RETURN_LABEL), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText(COMMISSION_LABEL), {
      target: { value: "10" },
    });

    await waitFor(() =>
      expect(api.saveDailySellerDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          occurredAt: BACKDATED_ENTRY_DATE,
          dispatchQuantity: "100",
        }),
      ),
      { timeout: 2_000 },
    );
    fireEvent.focus(dispatch);
    fireEvent.change(dispatch, { target: { value: "125" } });

    await waitFor(() =>
      expect(api.updateDailySellerDraft).toHaveBeenLastCalledWith(
        "draft-1",
        expect.objectContaining({
          occurredAt: BACKDATED_ENTRY_DATE,
          dispatchQuantity: "125",
        }),
      ),
      { timeout: 2_000 },
    );
    expect(dispatch).toHaveValue("125");
  });

  it("removes an existing daily draft when every value is reset to zero", async () => {
    const api = createApi();
    const savedDraft: LotteryWorkspace = {
      ...workspace,
      sales: [],
      draftSales: [
        {
          ...workspace.sales[0],
          status: "DRAFT",
          correctionOfSaleId: null,
        },
      ],
    };
    vi.mocked(api.loadWorkspace).mockResolvedValue(savedDraft);
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: DAILY_SELLERS_TAB }));
    await screen.findByText(DAILY_SELLER_ENTRY);
    fireEvent.change(screen.getByLabelText("Entry date for all sellers"), {
      target: { value: "2026-08-30" },
    });

    for (const label of [
      SELLER_DISPATCH_LABEL,
      MORNING_RETURN_LABEL,
      DAY_RETURN_LABEL,
      EVENING_RETURN_LABEL,
      COMMISSION_LABEL,
    ]) {
      const input = screen.getByLabelText(label);
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: "0" } });
    }

    await waitFor(
      () =>
        expect(api.deleteDailySellerDraft).toHaveBeenCalledWith("sale-1", {
          organizationId: "org-1",
        }),
      { timeout: 2_000 },
    );
    expect(screen.getByLabelText(SELLER_DISPATCH_LABEL)).toHaveValue("0");
  });
});
