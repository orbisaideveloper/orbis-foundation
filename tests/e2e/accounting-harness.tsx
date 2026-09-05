import React from "react";
import ReactDOM from "react-dom/client";
import "../../src/index.css";
import { LotteryAccountingWorkspace } from "../../src/admin/dashboard/sections/LotteryAccountingWorkspace";
import type { LotteryAccountingClient } from "../../src/admin/models/lotteryAccountingClient";
import { organization, workspace } from "./fixtures/lotteryWorkspaceFixture";

const noop = async () => undefined;
const api: LotteryAccountingClient = {
  listOrganizations: async () => [organization],
  loadWorkspace: async () => workspace,
  createOrganization: async () => organization,
  createParty: noop,
  updatePartyProfile: noop,
  updateOrganizationTdsRate: noop,
  updateUserLedgerStorage: noop,
  createPeriod: noop,
  createFinancialYearPeriod: noop,
  recordStockMovement: noop,
  saveDailyStockistEntry: async () => ({
    partyId: "stockist-a",
    occurredAt: "2026-09-04T00:00:00.000Z",
  }),
  clearDailyEntries: noop,
  previewSale: async () => ({
    calculated: {
      netTickets: "0",
      grossSalesPaise: "0",
      commissionPaise: "0",
      tdsPaise: "0",
      netPayablePaise: "0",
    },
    ledger: [],
  }),
  recordSale: noop,
  saveDailySellerDraft: async () => ({
    id: "draft-1",
    reference: "SAL-DRAFT",
    status: "DRAFT",
  }),
  updateDailySellerDraft: async () => ({
    id: "draft-1",
    reference: "SAL-DRAFT",
    status: "DRAFT",
  }),
  deleteDailySellerDraft: noop,
  postDailySellerDraft: noop,
  correctPostedSale: async () => ({
    id: "draft-2",
    reference: "SAL-COR",
    status: "DRAFT",
  }),
  recordPayment: noop,
  createExpenseCategory: noop,
  updateExpenseCategory: noop,
  createExpenseProfile: noop,
  updateExpenseProfile: noop,
  recordExpenseBill: noop,
  recordExpensePayment: noop,
  recordCustomerBill: noop,
  recordSettlement: noop,
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main className="min-h-screen bg-[#F8FAFC] p-2">
      <LotteryAccountingWorkspace api={api} />
    </main>
  </React.StrictMode>,
);
