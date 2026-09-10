import { describe, expect, it } from "vitest";
import type { AccountingSellerWorkingRecord } from "../lotteryAccountingLocalStore";
import {
  projectSellerWorkingRecords,
  sellerWorkingRecordConfirmed,
} from "../lotteryAccountingLocalProjection";
import type { LotteryWorkspace } from "../lotteryAccountingTypes";

const workspace = {
  organization: {
    id: "org-1",
    name: "Projection Test",
    tdsRateBps: 200,
    userLedgerStorage: "CLOUD",
    status: "ACTIVE",
    createdAt: "2026-09-08T00:00:00.000Z",
  },
  parties: [
    {
      id: "seller-1",
      organizationId: "org-1",
      partyType: "SELLER",
      name: "Seller One",
      email: null,
      phone: null,
      uniqueCode: "SELLER-1",
      ticketRatePaise: "10000",
      status: "ACTIVE",
    },
  ],
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

function localRecord(
  overrides: Partial<AccountingSellerWorkingRecord> = {},
): AccountingSellerWorkingRecord {
  return {
    key: "working-1",
    partitionKey: "ADMIN_REAL:admin-current:org-1",
    entityType: "SELLER_DAILY",
    partyId: "seller-1",
    occurredAt: "2026-09-08",
    row: {
      partyId: "seller-1",
      dispatchQuantity: "10",
      morningReturnQuantity: "2",
      dayReturnQuantity: "0",
      eveningReturnQuantity: "0",
      commissionRupees: "1",
    },
    syncState: "PENDING",
    updatedAt: 1,
    ...overrides,
  };
}

describe("lotteryAccountingLocalProjection", () => {
  it("projects one local seller row through the shared seller calculation", () => {
    const projected = projectSellerWorkingRecords(workspace, [localRecord()]);

    expect(projected).not.toBe(workspace);
    expect(projected.draftSales).toEqual([
      expect.objectContaining({
        id: "local:seller-1:2026-09-08",
        dispatchQuantity: 10,
        returnQuantity: 2,
        netTickets: 8,
        grossSalesPaise: "80000",
        commissionPaise: "100",
        tdsPaise: "2",
        netPayablePaise: "79902",
        status: "DRAFT",
      }),
    ]);
  });

  it("replaces the matching server seller/day and lets the newest local row win", () => {
    const serverDraft = {
      ...projectSellerWorkingRecords(workspace, [localRecord()]).draftSales[0],
      id: "draft-1",
      reference: "SAL-1",
    };
    const serverWorkspace: LotteryWorkspace = {
      ...workspace,
      draftSales: [serverDraft],
    };

    const projected = projectSellerWorkingRecords(serverWorkspace, [
      localRecord({
        key: "older",
        row: {
          ...localRecord().row,
          saleId: "draft-1",
          reference: "SAL-1",
          morningReturnQuantity: "3",
        },
        updatedAt: 1,
      }),
      localRecord({
        key: "newer",
        row: {
          ...localRecord().row,
          saleId: "draft-1",
          reference: "SAL-1",
          morningReturnQuantity: "4",
        },
        updatedAt: 2,
      }),
    ]);

    expect(projected.draftSales).toHaveLength(1);
    expect(projected.draftSales[0]).toMatchObject({
      id: "draft-1",
      returnQuantity: 4,
      netTickets: 6,
    });
  });

  it("uses a zero local row as delete and projects a posted correction as draft", () => {
    const serverDraft = {
      ...projectSellerWorkingRecords(workspace, [localRecord()]).draftSales[0],
      id: "draft-1",
      reference: "SAL-1",
    };
    const deleted = projectSellerWorkingRecords(
      { ...workspace, draftSales: [serverDraft] },
      [
        localRecord({
          row: {
            partyId: "seller-1",
            saleId: "draft-1",
            reference: "SAL-1",
            status: "DRAFT",
            dispatchQuantity: "0",
            morningReturnQuantity: "0",
            dayReturnQuantity: "0",
            eveningReturnQuantity: "0",
            commissionRupees: "0",
          },
        }),
      ],
    );
    expect(deleted.draftSales).toEqual([]);

    const posted = {
      ...serverDraft,
      id: "posted-1",
      reference: "SAL-P",
      status: "POSTED" as const,
      settledPaise: "0",
      outstandingPaise: "79902",
    };
    const corrected = projectSellerWorkingRecords(
      { ...workspace, sales: [posted], draftSales: [] },
      [
        localRecord({
          row: {
            ...localRecord().row,
            saleId: "posted-1",
            reference: "SAL-P",
            status: "POSTED",
            morningReturnQuantity: "5",
          },
        }),
      ],
    );

    expect(corrected.sales).toEqual([]);
    expect(corrected.draftSales[0]).toMatchObject({
      id: "posted-1",
      correctionOfSaleId: "posted-1",
      netTickets: 5,
    });
  });

  it("clears only a synced local record confirmed by the server snapshot", () => {
    const serverDraft = {
      ...projectSellerWorkingRecords(workspace, [localRecord()]).draftSales[0],
      id: "draft-1",
    };
    const confirmedWorkspace: LotteryWorkspace = {
      ...workspace,
      draftSales: [serverDraft],
    };

    expect(
      sellerWorkingRecordConfirmed(
        confirmedWorkspace,
        localRecord({
          syncState: "SYNCED",
          row: { ...localRecord().row, saleId: "draft-1" },
        }),
      ),
    ).toBe(true);
    expect(
      sellerWorkingRecordConfirmed(
        confirmedWorkspace,
        localRecord({
          syncState: "PENDING",
          row: { ...localRecord().row, saleId: "draft-1" },
        }),
      ),
    ).toBe(false);
    expect(
      sellerWorkingRecordConfirmed(
        confirmedWorkspace,
        localRecord({ syncState: "SYNCED" }),
      ),
    ).toBe(false);

    expect(projectSellerWorkingRecords(workspace, [])).toBe(workspace);
    expect(
      projectSellerWorkingRecords(workspace, [
        localRecord({
          partyId: "missing",
          row: { ...localRecord().row, partyId: "missing" },
        }),
      ]).draftSales,
    ).toEqual([]);
  });

  it("keeps a malformed local date stable and falls back to zero commission paise", () => {
    const malformed = localRecord({
      occurredAt: "not-a-date",
      row: {
        ...localRecord().row,
        commissionRupees: ".",
      },
    });

    const projected = projectSellerWorkingRecords(workspace, [malformed]);

    expect(projected.draftSales[0]).toMatchObject({
      id: "local:seller-1:not-a-date",
      occurredAt: "not-a-date",
      commissionPaise: "0",
    });
  });

});
