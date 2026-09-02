import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("shows the simple dashboard and opens a party-only ledger", async () => {
    render(<LotteryAccountingWorkspace api={createApi()} />);
    expect(await screen.findByText(ORGANIZATION_OVERVIEW)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Daily lottery check")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI analysis" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ledger" }));
    expect(await screen.findByText("Party ledger")).toBeInTheDocument();
    expect(screen.getByText("Day-wise ledger")).toBeInTheDocument();
    expect(screen.queryByText("Daily stock check")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-08-30" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-08-30" } });
    fireEvent.change(screen.getByLabelText("Party"), { target: { value: "party-1" } });
    expect(await screen.findByText("Seller sale")).toBeInTheDocument();
  });

  it("uses one selected stockist entry with timed returns", async () => {
    const api = createApi();
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: "Daily entry" }));
    fireEvent.click(screen.getByRole("button", { name: "Stockist purchase" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Daily entry" }));

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
});
