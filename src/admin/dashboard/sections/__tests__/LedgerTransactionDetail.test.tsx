import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LotteryAccountingClient } from "../../../models/lotteryAccountingClient";
import type { LotteryWorkspace } from "../../../models/lotteryAccountingTypes";
import {
  LedgerTransactionDetail,
  type LedgerTransactionContext,
} from "../LedgerTransactionDetail";

const TEST_DATE = "2026-09-05T00:00:00.000Z";
const CUSTOMER_BILL_ID = "customer-1";

const baseWorkspace = {
  sales: [
    {
      id: "sale-1",
      partyId: "seller-1",
      partyName: "Seller A",
      reference: "SAL-1",
      status: "POSTED",
      occurredAt: TEST_DATE,
      grossSalesPaise: "10000",
      commissionPaise: "500",
      tdsPaise: "10",
      netPayablePaise: "9510",
    },
  ],
  draftSales: [],
  stockistEntries: [],
  customerBills: [
    {
      id: CUSTOMER_BILL_ID,
      partyId: "customer-party",
      partyName: "Cash Customer",
      reference: "CUS-1",
      quantity: "10",
      unitRatePaise: "100",
      amountPaise: "1000",
      occurredAt: TEST_DATE,
      correctionVersion: 0,
    },
  ],
  expenseBills: [],
  expensePayments: [],
  payments: [],
} as unknown as LotteryWorkspace;

function api() {
  return {
    correctPostedSale: vi.fn().mockResolvedValue({
      id: "draft-2",
      reference: "SAL-2",
      status: "DRAFT",
    }),
    correctAccountingTransaction: vi.fn().mockResolvedValue({
      correctionId: "cor-1",
      entityType: "CUSTOMER_BILL",
      entityId: CUSTOMER_BILL_ID,
      version: 1,
      operationId: "operation-1",
    }),
  } as unknown as LotteryAccountingClient;
}

function context(id: string, category: string): LedgerTransactionContext {
  return {
    id,
    occurredAt: TEST_DATE,
    business: "₹100.00",
    money: "₹0.00",
    balance: "₹100.00",
    detail: "Test transaction",
    book: {
      id: "book-1",
      category,
      subtype: category === "customer" ? "customer" : "seller",
      name: "Test ledger",
      typeLabel: "Ledger",
    },
  };
}

describe("LedgerTransactionDetail", () => {
  it("routes a posted Seller row through the existing protected Seller correction flow", async () => {
    const client = api();
    const onRefresh = vi.fn().mockResolvedValue(true);
    const onSellerCorrection = vi.fn();

    render(
      <LedgerTransactionDetail
        workspace={baseWorkspace}
        organizationId="org-1"
        api={client}
        context={context("sale-sale-1", "seller")}
        onBack={vi.fn()}
        onRefresh={onRefresh}
        onSellerCorrection={onSellerCorrection}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Correct seller sale safely" }),
    );

    await waitFor(() =>
      expect(client.correctPostedSale).toHaveBeenCalledWith("sale-1", {
        organizationId: "org-1",
      }),
    );
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onSellerCorrection).toHaveBeenCalledWith(
      "seller-1",
      TEST_DATE,
    );
  });

  it("sends a Customer bill correction with expected version and replacement values", async () => {
    const client = api();

    render(
      <LedgerTransactionDetail
        workspace={baseWorkspace}
        organizationId="org-1"
        api={client}
        context={context("customer-customer-1", "customer")}
        onBack={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(true)}
        onSellerCorrection={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Correct safely" }));
    fireEvent.change(screen.getByLabelText("Correction Quantity"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText("Correction Unit rate"), {
      target: { value: "1.00" },
    });
    fireEvent.change(screen.getByLabelText("Correction reason"), {
      target: { value: "Wrong quantity" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() =>
      expect(client.correctAccountingTransaction).toHaveBeenCalledOnce(),
    );
    expect(client.correctAccountingTransaction).toHaveBeenCalledWith(
      "CUSTOMER_BILL",
      CUSTOMER_BILL_ID,
      expect.objectContaining({
        organizationId: "org-1",
        expectedVersion: 0,
        replacement: {
          quantity: "8",
          unitRatePaise: "100",
        },
        reason: "Wrong quantity",
      }),
    );
  });
});
