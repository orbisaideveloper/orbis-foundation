import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LotteryAccountingClient } from "../../../models/lotteryAccountingClient";
import type {
  AccountingLocalSyncState,
  AccountingSellerWorkingRow,
  LotteryAccountingLocalStore,
} from "../../../models/lotteryAccountingLocalStore";
import type { LotteryWorkspace } from "../../../models/lotteryAccountingTypes";

const ENTRY_DATE = "2026-09-08";
const WORKSPACE_DASHBOARD_TITLE = "Working State Test dashboard";
const LOCAL_SYNC_STATUS_LABEL = "Accounting local sync status";
const SELLER_NAME = "Seller One";
const DAILY_ENTRY_TAB_LABEL = "Daily entry";

type LocalStateCallback = (
  occurredAt: string,
  row: AccountingSellerWorkingRow,
  syncState: AccountingLocalSyncState,
) => void;

let latestOrganizationId: string | undefined;
let latestLocalStateCallback: LocalStateCallback | undefined;
let latestLocalRemoveCallback:
  | ((partyId: string, occurredAt: string) => void)
  | undefined;
let latestRegisterFlush:
  | ((flush: (() => Promise<boolean>) | null) => void)
  | undefined;
let latestCorrectPosted:
  | ((saleId: string) => Promise<unknown>)
  | undefined;
let latestUpdateTdsRate:
  | ((tdsRateBps: number) => Promise<boolean>)
  | undefined;

vi.mock("../DailySellerEntry", () => ({
  DailySellerEntry: ({
    organizationId,
    onLocalRowStateChange,
    onLocalRowRemoved,
    onRegisterFlush,
    onCorrectPosted,
    onUpdateTdsRate,
  }: {
    organizationId: string;
    onLocalRowStateChange?: LocalStateCallback;
    onLocalRowRemoved?: (partyId: string, occurredAt: string) => void;
    onRegisterFlush?: (flush: (() => Promise<boolean>) | null) => void;
    onCorrectPosted?: (saleId: string) => Promise<unknown>;
    onUpdateTdsRate?: (tdsRateBps: number) => Promise<boolean>;
  }) => {
    latestOrganizationId = organizationId;
    latestLocalStateCallback = onLocalRowStateChange;
    latestLocalRemoveCallback = onLocalRowRemoved;
    latestRegisterFlush = onRegisterFlush;
    latestCorrectPosted = onCorrectPosted;
    latestUpdateTdsRate = onUpdateTdsRate;

    return (
      <button
        type="button"
        onClick={() =>
          onLocalRowStateChange?.(
            ENTRY_DATE,
            {
              partyId: "seller-1",
              dispatchQuantity: "10",
              morningReturnQuantity: "2",
              dayReturnQuantity: "0",
              eveningReturnQuantity: "0",
              commissionRupees: "1",
            },
            "PENDING",
          )
        }
      >
        Simulate local seller edit
      </button>
    );
  },
}));

import { LotteryAccountingWorkspace } from "../LotteryAccountingWorkspace";

const workspace = {
  organization: {
    id: "org-1",
    name: "Working State Test",
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
      name: SELLER_NAME,
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

const pendingRecord = {
  key: "working-1",
  partitionKey: "ADMIN_REAL:admin-current:org-1",
  entityType: "SELLER_DAILY" as const,
  partyId: "seller-1",
  occurredAt: ENTRY_DATE,
  row: {
    partyId: "seller-1",
    dispatchQuantity: "10",
    morningReturnQuantity: "2",
    dayReturnQuantity: "0",
    eveningReturnQuantity: "0",
    commissionRupees: "1",
  },
  syncState: "PENDING" as const,
  updatedAt: 1,
};

function createApi(nextWorkspace = workspace) {
  return {
    listOrganizations: vi.fn().mockResolvedValue([workspace.organization]),
    loadWorkspace: vi.fn().mockResolvedValue(nextWorkspace),
    correctPostedSale: vi.fn().mockResolvedValue({
      id: "draft-1",
      reference: "SAL-1",
      status: "DRAFT",
    }),
    updateOrganizationTdsRate: vi.fn().mockResolvedValue(workspace.organization),
  } as unknown as LotteryAccountingClient;
}

function createLocalStore(
  records: Awaited<ReturnType<LotteryAccountingLocalStore["listSellerRows"]>> = [],
): LotteryAccountingLocalStore {
  return {
    stageSellerRow: vi.fn().mockResolvedValue(undefined),
    markSellerRowSynced: vi.fn().mockResolvedValue(undefined),
    removeSellerRow: vi.fn().mockResolvedValue(undefined),
    loadSellerRows: vi.fn().mockResolvedValue([]),
    listSellerRows: vi.fn().mockResolvedValue(records),
    listPendingOutbox: vi.fn().mockResolvedValue([]),
  };
}

describe("LotteryAccountingWorkspace local working state", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-08T06:30:00.000Z"));
    latestOrganizationId = undefined;
    latestLocalStateCallback = undefined;
    latestLocalRemoveCallback = undefined;
    latestRegisterFlush = undefined;
    latestCorrectPosted = undefined;
    latestUpdateTdsRate = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates a pending seller record into Dashboard and exposes its sync state", async () => {
    render(
      <LotteryAccountingWorkspace
        api={createApi()}
        localStore={createLocalStore([pendingRecord])}
      />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
      "Pending sync (1)",
    );
    expect(screen.getAllByText("₹800.00").length).toBeGreaterThan(0);
  }, 15_000);

  it("shows a current Daily edit on Dashboard before server reconciliation finishes", async () => {
    const api = createApi();
    render(
      <LotteryAccountingWorkspace
        api={api}
        localStore={createLocalStore()}
      />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    fireEvent.click(screen.getByRole("button", { name: DAILY_ENTRY_TAB_LABEL }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate local seller edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));

    expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
      "Pending sync (1)",
    );
    expect(screen.getAllByText("₹800.00").length).toBeGreaterThan(0);
    expect(api.loadWorkspace).toHaveBeenCalledTimes(1);
  });

  it("removes a synced recovery row after the server confirms the saved sale id", async () => {
    const serverDraft = {
      id: "draft-1",
      partyId: "seller-1",
      partyName: SELLER_NAME,
      periodId: null,
      periodLabel: null,
      reference: "SAL-1",
      dispatchQuantity: 10,
      morningReturnQuantity: 2,
      dayReturnQuantity: 0,
      eveningReturnQuantity: 0,
      returnQuantity: 2,
      netTickets: 8,
      ticketRatePaise: "10000",
      grossSalesPaise: "80000",
      commissionRateBps: 0,
      commissionPaise: "100",
      tdsRateBps: 200,
      tdsPaise: "2",
      netPayablePaise: "79902",
      occurredAt: ENTRY_DATE,
      status: "DRAFT" as const,
      correctionOfSaleId: null,
    };
    const localStore = createLocalStore([
      {
        ...pendingRecord,
        row: {
          ...pendingRecord.row,
          saleId: "draft-1",
          reference: "SAL-1",
          status: "DRAFT",
        },
        syncState: "SYNCED",
      },
    ]);

    render(
      <LotteryAccountingWorkspace
        api={createApi({ ...workspace, draftSales: [serverDraft] })}
        localStore={localStore}
      />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
      "Synced",
    );
    expect(localStore.removeSellerRow).toHaveBeenCalledWith(
      {
        ownerKind: "ADMIN_REAL",
        ownerId: "admin-current",
        organizationId: "org-1",
      },
      "seller-1",
      ENTRY_DATE,
    );
  });

  it("keeps a DEVICE local seller record primary instead of clearing it after a matching cloud snapshot", async () => {
    const serverDraft = {
      id: "draft-1",
      partyId: "seller-1",
      partyName: SELLER_NAME,
      periodId: null,
      periodLabel: null,
      reference: "SAL-1",
      dispatchQuantity: 10,
      morningReturnQuantity: 2,
      dayReturnQuantity: 0,
      eveningReturnQuantity: 0,
      returnQuantity: 2,
      netTickets: 8,
      ticketRatePaise: "10000",
      grossSalesPaise: "80000",
      commissionRateBps: 0,
      commissionPaise: "100",
      tdsRateBps: 200,
      tdsPaise: "2",
      netPayablePaise: "79902",
      occurredAt: ENTRY_DATE,
      status: "DRAFT" as const,
      correctionOfSaleId: null,
    };
    const deviceWorkspace: LotteryWorkspace = {
      ...workspace,
      organization: {
        ...workspace.organization,
        userLedgerStorage: "DEVICE",
      },
      draftSales: [serverDraft],
    };
    const localStore = createLocalStore([
      {
        ...pendingRecord,
        row: {
          ...pendingRecord.row,
          saleId: "draft-1",
          reference: "SAL-1",
          status: "DRAFT",
        },
        syncState: "LOCAL_SAVED",
      },
    ]);

    render(
      <LotteryAccountingWorkspace
        api={createApi(deviceWorkspace)}
        localStore={localStore}
      />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
      "Saved on device",
    );
    expect(localStore.removeSellerRow).not.toHaveBeenCalled();
  });


  it("distinguishes empty DEVICE storage from a DEVICE storage error", async () => {
    const deviceWorkspace: LotteryWorkspace = {
      ...workspace,
      organization: {
        ...workspace.organization,
        userLedgerStorage: "DEVICE",
      },
    };

    render(
      <LotteryAccountingWorkspace
        api={createApi(deviceWorkspace)}
        localStore={createLocalStore()}
      />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
      "Device storage",
    );

    fireEvent.click(screen.getByRole("button", { name: DAILY_ENTRY_TAB_LABEL }));
    act(() => {
      latestLocalStateCallback?.(ENTRY_DATE, pendingRecord.row, "ERROR");
    });

    expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
      "Device storage error",
    );
  });

  it("shows a storage warning when durable seller hydration fails", async () => {
    const localStore = createLocalStore();
    localStore.listSellerRows = vi.fn().mockRejectedValue(new Error("read failed"));

    render(
      <LotteryAccountingWorkspace api={createApi()} localStore={localStore} />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
      "Storage warning",
    );
  });

  it("surfaces a current confirmed-row cleanup failure as a storage warning", async () => {
    const serverDraft = {
      id: "draft-1",
      partyId: "seller-1",
      partyName: SELLER_NAME,
      periodId: null,
      periodLabel: null,
      reference: "SAL-1",
      dispatchQuantity: 10,
      morningReturnQuantity: 2,
      dayReturnQuantity: 0,
      eveningReturnQuantity: 0,
      returnQuantity: 2,
      netTickets: 8,
      ticketRatePaise: "10000",
      grossSalesPaise: "80000",
      commissionRateBps: 0,
      commissionPaise: "100",
      tdsRateBps: 200,
      tdsPaise: "2",
      netPayablePaise: "79902",
      occurredAt: ENTRY_DATE,
      status: "DRAFT" as const,
      correctionOfSaleId: null,
    };
    const localStore = createLocalStore([
      {
        ...pendingRecord,
        row: {
          ...pendingRecord.row,
          saleId: "draft-1",
          reference: "SAL-1",
          status: "DRAFT",
        },
        syncState: "SYNCED",
      },
    ]);
    localStore.removeSellerRow = vi.fn().mockRejectedValue(new Error("cleanup failed"));

    render(
      <LotteryAccountingWorkspace
        api={createApi({ ...workspace, draftSales: [serverDraft] })}
        localStore={localStore}
      />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    await waitFor(() => {
      expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
        "Storage warning",
      );
    });
  });

  it("ignores a late confirmed-row cleanup failure after a newer refresh wins", async () => {
    let rejectFirstRemoval: (reason?: unknown) => void = (reason) => {
      void reason;
    };
    const serverDraft = {
      id: "draft-1",
      partyId: "seller-1",
      partyName: SELLER_NAME,
      periodId: null,
      periodLabel: null,
      reference: "SAL-1",
      dispatchQuantity: 10,
      morningReturnQuantity: 2,
      dayReturnQuantity: 0,
      eveningReturnQuantity: 0,
      returnQuantity: 2,
      netTickets: "8",
      ticketRatePaise: "10000",
      grossSalesPaise: "80000",
      commissionRateBps: 0,
      commissionPaise: "100",
      tdsRateBps: 200,
      tdsPaise: "2",
      netPayablePaise: "79902",
      occurredAt: ENTRY_DATE,
      status: "DRAFT" as const,
      correctionOfSaleId: null,
    } as unknown as LotteryWorkspace["draftSales"][number];
    const api = createApi({ ...workspace, draftSales: [serverDraft] });
    const localStore = createLocalStore([
      {
        ...pendingRecord,
        row: {
          ...pendingRecord.row,
          saleId: "draft-1",
          reference: "SAL-1",
          status: "DRAFT",
        },
        syncState: "SYNCED",
      },
    ]);
    localStore.removeSellerRow = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirstRemoval = reject;
          }),
      )
      .mockResolvedValue(undefined);

    render(
      <LotteryAccountingWorkspace api={api} localStore={localStore} />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh accounting workspace" }),
    );
    await waitFor(() => expect(api.loadWorkspace).toHaveBeenCalledTimes(2));

    await act(async () => {
      rejectFirstRemoval(new Error("late cleanup failure"));
    });

    expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
      "Synced",
    );
  });


  it("ignores an older workspace response after a newer organization refresh wins", async () => {
    let resolveOlderRefresh: (value: LotteryWorkspace) => void = (value) => {
      void value;
    };
    const secondOrganization = {
      ...workspace.organization,
      id: "org-2",
      name: "Second Working State Test",
    };
    const secondWorkspace: LotteryWorkspace = {
      ...workspace,
      organization: secondOrganization,
    };
    const api = {
      ...createApi(),
      listOrganizations: vi
        .fn()
        .mockResolvedValue([workspace.organization, secondOrganization]),
      loadWorkspace: vi
        .fn()
        .mockResolvedValueOnce(workspace)
        .mockImplementationOnce(
          () =>
            new Promise<LotteryWorkspace>((resolve) => {
              resolveOlderRefresh = resolve;
            }),
        )
        .mockResolvedValueOnce(secondWorkspace),
    } as unknown as LotteryAccountingClient;

    render(
      <LotteryAccountingWorkspace
        api={api}
        localStore={createLocalStore()}
      />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);

    fireEvent.click(
      screen.getByRole("button", { name: "Refresh accounting workspace" }),
    );
    await waitFor(() => expect(api.loadWorkspace).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText("Accounting organization"), {
      target: { value: "org-2" },
    });

    await waitFor(() => expect(api.loadWorkspace).toHaveBeenCalledTimes(3));
    expect(
      await screen.findByText("Second Working State Test dashboard"),
    ).toBeVisible();

    await act(async () => {
      resolveOlderRefresh(workspace);
    });

    expect(screen.getByText("Second Working State Test dashboard")).toBeVisible();
  });

  it("shows ERROR and SYNCING local states and removes the current local record", async () => {
    render(
      <LotteryAccountingWorkspace
        api={createApi()}
        localStore={createLocalStore()}
      />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    fireEvent.click(screen.getByRole("button", { name: DAILY_ENTRY_TAB_LABEL }));

    act(() => {
      latestLocalStateCallback?.(ENTRY_DATE, pendingRecord.row, "ERROR");
    });
    expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
      "Sync error",
    );

    act(() => {
      latestLocalStateCallback?.(ENTRY_DATE, pendingRecord.row, "SYNCING");
    });
    expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
      "Syncing",
    );

    act(() => {
      latestLocalRemoveCallback?.("seller-1", ENTRY_DATE);
    });
    expect(screen.getByLabelText(LOCAL_SYNC_STATUS_LABEL)).toHaveTextContent(
      "Synced",
    );
  });

  it("keeps blank-organization callbacks inert and clears local state through the no-id refresh path", async () => {
    const api = createApi();

    render(
      <LotteryAccountingWorkspace
        api={api}
        localStore={createLocalStore([pendingRecord])}
      />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    fireEvent.click(screen.getByRole("button", { name: DAILY_ENTRY_TAB_LABEL }));
    fireEvent.change(screen.getByLabelText("Accounting organization"), {
      target: { value: "" },
    });

    await waitFor(() => expect(latestOrganizationId).toBe(""));

    act(() => {
      latestLocalStateCallback?.(ENTRY_DATE, pendingRecord.row, "ERROR");
      latestLocalRemoveCallback?.("seller-1", ENTRY_DATE);
    });

    await act(async () => {
      await latestUpdateTdsRate?.(200);
    });

    expect(api.updateOrganizationTdsRate).toHaveBeenCalledWith({
      organizationId: "",
      tdsRateBps: 200,
    });
  });

  it("uses a registered Daily flush and refreshes a stale seller workspace in the background", async () => {
    const api = createApi();

    render(
      <LotteryAccountingWorkspace
        api={api}
        localStore={createLocalStore()}
      />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    fireEvent.click(screen.getByRole("button", { name: DAILY_ENTRY_TAB_LABEL }));

    act(() => {
      latestRegisterFlush?.(async () => true);
    });
    await act(async () => {
      await latestCorrectPosted?.("sale-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));

    await waitFor(() => expect(api.loadWorkspace).toHaveBeenCalledTimes(2));
  });

  it("keeps the local projection when background stale-workspace refresh fails", async () => {
    const api = createApi();
    api.loadWorkspace = vi
      .fn()
      .mockResolvedValueOnce(workspace)
      .mockRejectedValueOnce(new Error("background refresh failed"));

    render(
      <LotteryAccountingWorkspace
        api={api}
        localStore={createLocalStore()}
      />,
    );

    await screen.findByText(WORKSPACE_DASHBOARD_TITLE);
    fireEvent.click(screen.getByRole("button", { name: DAILY_ENTRY_TAB_LABEL }));

    act(() => {
      latestRegisterFlush?.(async () => true);
    });
    await act(async () => {
      await latestCorrectPosted?.("sale-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));

    await waitFor(() => expect(api.loadWorkspace).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("background refresh failed")).toBeVisible();
  });

});
