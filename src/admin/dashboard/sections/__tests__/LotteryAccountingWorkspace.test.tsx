import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LotteryAccountingWorkspace } from "../LotteryAccountingWorkspace";
import type { LotteryAccountingClient } from "../../../models/lotteryAccountingClient";
import type { LotteryWorkspace } from "../../../models/lotteryAccountingTypes";

const ORGANIZATION_NAME = "Demo Lottery";
const ORGANIZATION_OVERVIEW = `${ORGANIZATION_NAME} overview`;
const SELLER_DISPATCH_LABEL = "Seller A dispatch";
const AUGUST_2026 = "August 2026";
const RECORDED_AT = "2026-08-30T00:00:00.000Z";

const organization = {
  id: "org-1",
  name: ORGANIZATION_NAME,
  tdsRateBps: 200,
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
      ticketRatePaise: "1000",
      commissionRateBps: 500,
      tdsRateBps: 1000,
      status: "ACTIVE",
    },
  ],
  periods: [
    {
      id: "period-1",
      organizationId: "org-1",
      label: AUGUST_2026,
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-08-31T00:00:00.000Z",
      status: "OPEN",
    },
  ],
  stockMovements: [
    {
      id: "stock-1",
      movementType: "RECEIPT",
      quantity: "120",
      reference: "STK-1",
      occurredAt: RECORDED_AT,
    },
  ],
  sales: [
    {
      id: "sale-1",
      partyId: "party-1",
      partyName: "Seller A",
      periodId: "period-1",
      periodLabel: AUGUST_2026,
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
      periodLabel: AUGUST_2026,
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
    createPeriod: vi.fn().mockResolvedValue(undefined),
    createFinancialYearPeriod: vi.fn().mockResolvedValue(undefined),
    recordStockMovement: vi.fn().mockResolvedValue(undefined),
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
    saveDailySellerDraft: vi.fn().mockResolvedValue(undefined),
    updateDailySellerDraft: vi.fn().mockResolvedValue(undefined),
    deleteDailySellerDraft: vi.fn().mockResolvedValue(undefined),
    postDailySellerDraft: vi.fn().mockResolvedValue(undefined),
    correctPostedSale: vi.fn().mockResolvedValue(undefined),
    recordPayment: vi.fn().mockResolvedValue(undefined),
    recordSettlement: vi.fn().mockResolvedValue(undefined),
  };
}

describe("LotteryAccountingWorkspace", () => {
  it("shows real private dashboard, records and read-only AI insights", async () => {
    render(<LotteryAccountingWorkspace api={createApi()} />);
    expect(await screen.findByText(ORGANIZATION_OVERVIEW)).toBeInTheDocument();
    expect(screen.getByText("₹800.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Records" }));
    expect(
      await screen.findByText("Posted records are immutable"),
    ).toBeInTheDocument();
    expect(screen.getByText(/SALE-1 · Seller A/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI analysis" }));
    expect(
      await screen.findByText("Verified accounting AI"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This AI cannot write records/i),
    ).toBeInTheDocument();
  });

  it("shows the mobile seller table with shared date, three returns and daily totals", async () => {
    const api = createApi();
    render(<LotteryAccountingWorkspace api={api} />);
    await screen.findByText(ORGANIZATION_OVERVIEW);
    fireEvent.click(screen.getByRole("button", { name: "Daily sellers" }));

    expect(await screen.findByText("Daily seller entry")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Table view" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Daily posted total/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(SELLER_DISPATCH_LABEL), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Seller A morning return"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Seller A day return"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Seller A evening return"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Seller A commission amount"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Daily sellers" }));
    await screen.findByText("Daily seller entry");
    fireEvent.change(screen.getByLabelText(SELLER_DISPATCH_LABEL), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "PARTY_PROFILE_REQUIRED",
    );
    expect(screen.getByLabelText(SELLER_DISPATCH_LABEL)).toHaveValue("10");
  });
});
