import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LotteryAccountingClient } from "../../../models/lotteryAccountingClient";
import type { LotteryWorkspace } from "../../../models/lotteryAccountingTypes";

vi.mock("../DailySellerEntry", () => ({
  DailySellerEntry: ({ localScope }: { localScope?: { ownerKind?: string; ownerId?: string } }) => (
    <div data-testid="daily-seller-local-scope">
      {localScope?.ownerKind}:{localScope?.ownerId}
    </div>
  ),
}));

import { LotteryAccountingWorkspace } from "../LotteryAccountingWorkspace";

const workspace = {
  organization: {
    id: "org-1",
    name: "Scope Test",
    tdsRateBps: 200,
    userLedgerStorage: "CLOUD",
    status: "ACTIVE",
    createdAt: "2026-09-07T00:00:00.000Z",
  },
  parties: [],
  periods: [],
  stockMovements: [],
  stockistEntries: [],
  sales: [],
  draftSales: [],
  payments: [],
  settlements: [],
  ledgerEntries: [],
  auditEvents: [],
  expenseCategories: [],
  expenseProfiles: [],
  expenseBills: [],
  expensePayments: [],
  customerBills: [],
  summary: {
    verified: true,
    moneyUnit: "PAISE",
    salesCount: 0,
    paymentCount: 0,
    grossSalesPaise: "0",
    commissionPaise: "0",
    tdsPaise: "0",
    netPayablePaise: "0",
    collectedPaise: "0",
    outgoingPaise: "0",
    expensePaise: "0",
    outstandingPaise: "0",
    operatingResultPaise: "0",
    netCashFlowPaise: "0",
    stock: {
      received: "0",
      dispatched: "0",
      returned: "0",
      stockistReturned: "0",
      adjustment: "0",
      closing: "0",
    },
    anomalies: [],
  },
  insights: [],
} satisfies LotteryWorkspace;

const api = {
  listOrganizations: vi.fn().mockResolvedValue([workspace.organization]),
  loadWorkspace: vi.fn().mockResolvedValue(workspace),
} as unknown as LotteryAccountingClient;

describe("LotteryAccountingWorkspace local data scope", () => {
  it("uses Admin real by default and forwards an explicit scope to Daily Seller", async () => {
    const { unmount } = render(<LotteryAccountingWorkspace api={api} localStore={null} />);
    await screen.findByText("Scope Test dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Daily entry" }));
    expect(screen.getByTestId("daily-seller-local-scope")).toHaveTextContent(
      "ADMIN_REAL:admin-current",
    );
    unmount();

    render(
      <LotteryAccountingWorkspace
        api={api}
        localScope={{ ownerKind: "ADMIN_DEMO", ownerId: "accounting-demo" }}
        localStore={null}
      />,
    );
    await screen.findByText("Scope Test dashboard");
    fireEvent.click(screen.getByRole("button", { name: "Daily entry" }));
    expect(screen.getByTestId("daily-seller-local-scope")).toHaveTextContent(
      "ADMIN_DEMO:accounting-demo",
    );
  });
});
