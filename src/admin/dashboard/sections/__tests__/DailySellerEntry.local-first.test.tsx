import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DailySellerEntry } from "../DailySellerEntry";
import type { LotteryAccountingLocalStore } from "../../../models/lotteryAccountingLocalStore";
import type { LotteryWorkspace } from "../../../models/lotteryAccountingTypes";

const RECORDED_AT = "2026-09-07T00:00:00.000Z";
const ENTRY_DATE = "2026-09-07";
const ADMIN_OWNER_ID = "admin-current";
const ADMIN_PARTITION_KEY = "ADMIN_REAL:admin-current:org-1";
const DRAFT_STATUS = "DRAFT" as const;
const MANUAL_SAVE_FAILED = "manual save failed";
const DEVICE_STORAGE_UNAVAILABLE_TEXT = "Device accounting storage is unavailable";
const CORRECTION_DRAFT_ID = "draft-correction";
const SELLER_MORNING_RETURN_LABEL = "Seller A morning return";
const SELLER_DISPATCH_LABEL = "Seller A dispatch";
const MORNING_RETURN_SUMMARY_LABEL = "Morning return";
const ENTRY_DATE_LABEL = "Entry date for all sellers";
const BACKDATED_ENTRY_DATE = "2026-09-06";
const SYNC_DRAFT_ID = "draft-sync";

function noopResolver<T>(value: T): void {
  void value;
}

function noopOptionalResolver(value?: unknown): void {
  void value;
}

const workspace: LotteryWorkspace = {
  organization: {
    id: "org-1",
    name: "Admin Real Accounting",
    tdsRateBps: 200,
    userLedgerStorage: "CLOUD",
    status: "ACTIVE",
    createdAt: RECORDED_AT,
  },
  parties: [
    {
      id: "party-1",
      organizationId: "org-1",
      partyType: "SELLER",
      name: "Seller A",
      email: null,
      phone: null,
      uniqueCode: "seller-a",
      ticketRatePaise: "1000",
      status: "ACTIVE",
    },
  ],
  periods: [],
  stockMovements: [],
  stockistEntries: [],
  sales: [
    {
      id: "sale-1",
      partyId: "party-1",
      partyName: "Seller A",
      periodId: null,
      periodLabel: null,
      reference: "SAL-1",
      dispatchQuantity: 1000,
      morningReturnQuantity: 560,
      dayReturnQuantity: 0,
      eveningReturnQuantity: 0,
      returnQuantity: 560,
      netTickets: 440,
      ticketRatePaise: "1000",
      grossSalesPaise: "440000",
      commissionRateBps: 0,
      commissionPaise: "0",
      tdsRateBps: 200,
      tdsPaise: "0",
      netPayablePaise: "440000",
      settledPaise: "0",
      outstandingPaise: "440000",
      status: "POSTED",
      occurredAt: RECORDED_AT,
    },
  ],
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
    salesCount: 1,
    paymentCount: 0,
    grossSalesPaise: "440000",
    commissionPaise: "0",
    tdsPaise: "0",
    netPayablePaise: "440000",
    collectedPaise: "0",
    outgoingPaise: "0",
    expensePaise: "0",
    outstandingPaise: "440000",
    operatingResultPaise: "440000",
    netCashFlowPaise: "0",
    stock: {
      received: "1000",
      dispatched: "1000",
      returned: "560",
      stockistReturned: "0",
      adjustment: "0",
      closing: "560",
    },
    anomalies: [],
  },
  insights: [],
};

function createLocalStore(overrides: Partial<LotteryAccountingLocalStore> = {}) {
  return {
    stageSellerRow: vi.fn().mockResolvedValue(undefined),
    markSellerRowSynced: vi.fn().mockResolvedValue(undefined),
    removeSellerRow: vi.fn().mockResolvedValue(undefined),
    loadSellerRows: vi.fn().mockResolvedValue([]),
    listSellerRows: vi.fn().mockResolvedValue([]),
    listPendingOutbox: vi.fn().mockResolvedValue([]),
    ...overrides,
  } satisfies LotteryAccountingLocalStore;
}

function renderEntry(localStore: LotteryAccountingLocalStore) {
  return render(
    <DailySellerEntry
      organizationId="org-1"
      workspace={workspace}
      localStore={localStore}
      onSaveDraft={vi.fn().mockResolvedValue({ id: "draft-1", reference: "SAL-2", status: DRAFT_STATUS })}
      onUpdateDraft={vi.fn().mockResolvedValue({ id: "draft-1", reference: "SAL-2", status: DRAFT_STATUS })}
      onDeleteDraft={vi.fn().mockResolvedValue(true)}
      onCorrectPosted={vi.fn().mockResolvedValue({ id: CORRECTION_DRAFT_ID, reference: "SAL-C", status: DRAFT_STATUS })}
      onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
    />,
  );
}

describe("DailySellerEntry local-first projection", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(RECORDED_AT));
    window.localStorage?.clear?.();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates the daily total from the current local row before the server autosave runs", async () => {
    const localStore = createLocalStore();
    renderEntry(localStore);

    const morningReturn = await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL);
    expect(morningReturn).toHaveValue("560");
    fireEvent.change(morningReturn, { target: { value: "910" } });

    const total = screen.getByRole("heading", {
      name: /Daily saved total/,
    }).closest("section");
    expect(total).not.toBeNull();
    const morningLabel = within(total as HTMLElement).getByText(MORNING_RETURN_SUMMARY_LABEL);
    expect(morningLabel.parentElement).toHaveTextContent("910");
    expect(localStore.stageSellerRow).toHaveBeenCalledWith(
      {
        ownerKind: "ADMIN_REAL",
        ownerId: ADMIN_OWNER_ID,
        organizationId: "org-1",
      },
      ENTRY_DATE,
      expect.objectContaining({
        partyId: "party-1",
        morningReturnQuantity: "910",
      }),
    );
  });

  it("keeps DEVICE seller edits local and does not call cloud draft mutations", async () => {
    const localStore = createLocalStore();
    const onLocalRowStateChange = vi.fn();
    const onSaveDraft = vi.fn();
    const onUpdateDraft = vi.fn();
    const onDeleteDraft = vi.fn();
    const onCorrectPosted = vi.fn();
    const deviceWorkspace: LotteryWorkspace = {
      ...workspace,
      organization: {
        ...workspace.organization,
        userLedgerStorage: "DEVICE",
      },
    };

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={deviceWorkspace}
        localStore={localStore}
        onLocalRowStateChange={onLocalRowStateChange}
        onSaveDraft={onSaveDraft}
        onUpdateDraft={onUpdateDraft}
        onDeleteDraft={onDeleteDraft}
        onCorrectPosted={onCorrectPosted}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.change(
      await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL),
      { target: { value: "910" } },
    );

    await waitFor(() => {
      expect(localStore.stageSellerRow).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /Save row/ }));
    await waitFor(() => {
      expect(localStore.stageSellerRow).toHaveBeenCalledTimes(2);
      expect(onLocalRowStateChange).toHaveBeenCalledWith(
        ENTRY_DATE,
        expect.objectContaining({ morningReturnQuantity: "910" }),
        "LOCAL_SAVED",
      );
    });

    expect(localStore.stageSellerRow).toHaveBeenCalledWith(
      {
        ownerKind: "ADMIN_REAL",
        ownerId: ADMIN_OWNER_ID,
        organizationId: "org-1",
      },
      ENTRY_DATE,
      expect.objectContaining({
        partyId: "party-1",
        morningReturnQuantity: "910",
      }),
      "DEVICE",
    );
    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(onUpdateDraft).not.toHaveBeenCalled();
    expect(onDeleteDraft).not.toHaveBeenCalled();
    expect(onCorrectPosted).not.toHaveBeenCalled();
  });


  it("fails closed when DEVICE mode has no durable local store", async () => {
    const onSaveDraft = vi.fn();
    const onUpdateDraft = vi.fn();
    const onDeleteDraft = vi.fn();
    const onCorrectPosted = vi.fn();
    const onLocalRowStateChange = vi.fn();
    const deviceWorkspace: LotteryWorkspace = {
      ...workspace,
      organization: {
        ...workspace.organization,
        userLedgerStorage: "DEVICE",
      },
    };

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={deviceWorkspace}
        localStore={null}
        onLocalRowStateChange={onLocalRowStateChange}
        onSaveDraft={onSaveDraft}
        onUpdateDraft={onUpdateDraft}
        onDeleteDraft={onDeleteDraft}
        onCorrectPosted={onCorrectPosted}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.change(
      await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL),
      { target: { value: "915" } },
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      DEVICE_STORAGE_UNAVAILABLE_TEXT,
    );

    fireEvent.click(screen.getByRole("button", { name: /Save row/ }));
    await waitFor(() => {
      expect(onLocalRowStateChange).toHaveBeenCalledWith(
        ENTRY_DATE,
        expect.objectContaining({ morningReturnQuantity: "915" }),
        "ERROR",
      );
    });

    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(onUpdateDraft).not.toHaveBeenCalled();
    expect(onDeleteDraft).not.toHaveBeenCalled();
    expect(onCorrectPosted).not.toHaveBeenCalled();
  });

  it("keeps a DEVICE row local when the explicit durable save fails", async () => {
    const stageSellerRow = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("device write failed"));
    const localStore = createLocalStore({ stageSellerRow });
    const onLocalRowStateChange = vi.fn();
    const deviceWorkspace: LotteryWorkspace = {
      ...workspace,
      organization: {
        ...workspace.organization,
        userLedgerStorage: "DEVICE",
      },
    };

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={deviceWorkspace}
        localStore={localStore}
        onLocalRowStateChange={onLocalRowStateChange}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn()}
        onCorrectPosted={vi.fn()}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.change(
      await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL),
      { target: { value: "916" } },
    );
    await waitFor(() => expect(stageSellerRow).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Save row/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      DEVICE_STORAGE_UNAVAILABLE_TEXT,
    );
    expect(onLocalRowStateChange).toHaveBeenCalledWith(
      ENTRY_DATE,
      expect.objectContaining({ morningReturnQuantity: "916" }),
      "ERROR",
    );
  });


  it("hydrates DEVICE local-saved recovery without scheduling a cloud retry", async () => {
    const deviceWorkspace: LotteryWorkspace = {
      ...workspace,
      organization: {
        ...workspace.organization,
        userLedgerStorage: "DEVICE",
      },
    };
    const localStore = createLocalStore({
      loadSellerRows: vi.fn().mockResolvedValue([
        {
          key: "device-local-saved",
          partitionKey: ADMIN_PARTITION_KEY,
          entityType: "SELLER_DAILY",
          partyId: "party-1",
          occurredAt: ENTRY_DATE,
          row: {
            partyId: "party-1",
            dispatchQuantity: "1000",
            morningReturnQuantity: "913",
            dayReturnQuantity: "0",
            eveningReturnQuantity: "0",
            commissionRupees: "0",
          },
          syncState: "LOCAL_SAVED",
          updatedAt: 10,
          schemaVersion: 1,
        },
      ]),
    });
    const onSaveDraft = vi.fn();
    const onUpdateDraft = vi.fn();
    const onCorrectPosted = vi.fn();

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={deviceWorkspace}
        localStore={localStore}
        onSaveDraft={onSaveDraft}
        onUpdateDraft={onUpdateDraft}
        onDeleteDraft={vi.fn()}
        onCorrectPosted={onCorrectPosted}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL)).toHaveValue("913");
    });

    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(onUpdateDraft).not.toHaveBeenCalled();
    expect(onCorrectPosted).not.toHaveBeenCalled();
  });

  it("uses the DEVICE-specific message when edit staging itself cannot be saved durably", async () => {
    const stageSellerRow = vi.fn().mockRejectedValue(new Error("device stage failed"));
    const onLocalRowStateChange = vi.fn();
    const deviceWorkspace: LotteryWorkspace = {
      ...workspace,
      organization: {
        ...workspace.organization,
        userLedgerStorage: "DEVICE",
      },
    };

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={deviceWorkspace}
        localStore={createLocalStore({ stageSellerRow })}
        onLocalRowStateChange={onLocalRowStateChange}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn()}
        onCorrectPosted={vi.fn()}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.change(
      await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL),
      { target: { value: "917" } },
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      DEVICE_STORAGE_UNAVAILABLE_TEXT,
    );
    expect(onLocalRowStateChange).toHaveBeenCalledWith(
      ENTRY_DATE,
      expect.objectContaining({ morningReturnQuantity: "917" }),
      "ERROR",
    );
  });

  it("hydrates a pending IndexedDB row instead of the stale server snapshot", async () => {
    const localStore = createLocalStore({
      loadSellerRows: vi.fn().mockResolvedValue([
        {
          key: "pending-1",
          partitionKey: ADMIN_PARTITION_KEY,
          entityType: "SELLER_DAILY",
          partyId: "party-1",
          occurredAt: ENTRY_DATE,
          row: {
            partyId: "party-1",
            dispatchQuantity: "1000",
            morningReturnQuantity: "910",
            dayReturnQuantity: "0",
            eveningReturnQuantity: "0",
            commissionRupees: "0",
          },
          syncState: "PENDING",
          updatedAt: 1,
        },
      ]),
    });
    renderEntry(localStore);

    await waitFor(() => {
      expect(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL)).toHaveValue("910");
    });
    const total = screen.getByRole("heading", {
      name: /Daily saved total/,
    }).closest("section");
    const morningLabel = within(total as HTMLElement).getByText(MORNING_RETURN_SUMMARY_LABEL);
    expect(morningLabel.parentElement).toHaveTextContent("910");
  });

  it("surfaces durable local read and write failures without blocking the browser fallback", async () => {
    const readFailureStore = createLocalStore({
      loadSellerRows: vi.fn().mockRejectedValue(new Error("read failed")),
    });
    const first = renderEntry(readFailureStore);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Device accounting storage could not be read",
    );
    first.unmount();

    const writeFailureStore = createLocalStore({
      stageSellerRow: vi.fn().mockRejectedValue(new Error("write failed")),
    });
    renderEntry(writeFailureStore);
    const morningReturn = await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL);
    fireEvent.change(morningReturn, { target: { value: "911" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Device accounting storage could not be written",
    );
  });

  it("ignores synced and superseded local rows while recovering another pending local row", async () => {
    let resolveRows: (value: Awaited<ReturnType<LotteryAccountingLocalStore["loadSellerRows"]>>) => void =
      noopResolver;
    const localStore = createLocalStore({
      loadSellerRows: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRows = resolve;
          }),
      ),
    });
    renderEntry(localStore);
    const morningReturn = await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL);
    fireEvent.change(morningReturn, { target: { value: "911" } });
    fireEvent.change(morningReturn, { target: { value: "912" } });

    await act(async () => {
      resolveRows([
        {
          key: "synced",
          partitionKey: ADMIN_PARTITION_KEY,
          entityType: "SELLER_DAILY",
          partyId: "party-1",
          occurredAt: ENTRY_DATE,
          row: {
            partyId: "party-1",
            dispatchQuantity: "1000",
            morningReturnQuantity: "800",
            dayReturnQuantity: "0",
            eveningReturnQuantity: "0",
            commissionRupees: "0",
          },
          syncState: "SYNCED",
          updatedAt: 1,
        },
        {
          key: "superseded",
          partitionKey: ADMIN_PARTITION_KEY,
          entityType: "SELLER_DAILY",
          partyId: "party-1",
          occurredAt: ENTRY_DATE,
          row: {
            partyId: "party-1",
            dispatchQuantity: "1000",
            morningReturnQuantity: "801",
            dayReturnQuantity: "0",
            eveningReturnQuantity: "0",
            commissionRupees: "0",
          },
          syncState: "PENDING",
          updatedAt: 2,
        },
        {
          key: "ghost",
          partitionKey: ADMIN_PARTITION_KEY,
          entityType: "SELLER_DAILY",
          partyId: "party-ghost",
          occurredAt: ENTRY_DATE,
          row: {
            partyId: "party-ghost",
            dispatchQuantity: "2",
            morningReturnQuantity: "1",
            dayReturnQuantity: "0",
            eveningReturnQuantity: "0",
            commissionRupees: "0",
          },
          syncState: "PENDING",
          updatedAt: 3,
        },
      ]);
    });

    expect(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL)).toHaveValue("912");
  });

  it("does not surface a late local read failure after the entry unmounts", async () => {
    let rejectRows: (reason?: unknown) => void = noopOptionalResolver;
    const localStore = createLocalStore({
      loadSellerRows: vi.fn().mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectRows = reject;
          }),
      ),
    });
    const rendered = renderEntry(localStore);
    rendered.unmount();
    await act(async () => {
      rejectRows(new Error("late read failure"));
    });
  });

  it("marks the durable row synced after the existing server save acknowledges it", async () => {
    const localStore = createLocalStore();
    renderEntry(localStore);
    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));
    await waitFor(() => {
      expect(localStore.markSellerRowSynced).toHaveBeenCalledWith(
        {
          ownerKind: "ADMIN_REAL",
          ownerId: ADMIN_OWNER_ID,
          organizationId: "org-1",
        },
        ENTRY_DATE,
        expect.objectContaining({
          partyId: "party-1",
          saleId: "draft-1",
          reference: "SAL-2",
          status: DRAFT_STATUS,
        }),
      );
    });
  });

  it("sends the durable operation id and expected version, then stores the server acknowledgement", async () => {
    const draftWorkspace: LotteryWorkspace = {
      ...workspace,
      sales: [],
      draftSales: [
        {
          id: SYNC_DRAFT_ID,
          partyId: "party-1",
          partyName: "Seller A",
          periodId: null,
          periodLabel: null,
          reference: "SAL-SYNC",
          syncVersion: 3,
          dispatchQuantity: 1000,
          morningReturnQuantity: 560,
          dayReturnQuantity: 0,
          eveningReturnQuantity: 0,
          returnQuantity: 560,
          netTickets: 440,
          ticketRatePaise: "1000",
          grossSalesPaise: "440000",
          commissionRateBps: 0,
          commissionPaise: "0",
          tdsRateBps: 200,
          tdsPaise: "0",
          netPayablePaise: "440000",
          status: DRAFT_STATUS,
          correctionOfSaleId: null,
          occurredAt: RECORDED_AT,
        },
      ],
    };
    const operationId = "SELLER_ROW_SYNC:test-op";
    const acknowledgeSellerSync = vi.fn().mockResolvedValue(undefined);
    const localStore = createLocalStore({
      getSellerSyncOperation: vi.fn().mockResolvedValue({
        operationId,
        partitionKey: ADMIN_PARTITION_KEY,
        entityKey: `${ADMIN_PARTITION_KEY}:SELLER_DAILY:party-1:${ENTRY_DATE}`,
        operation: "UPSERT_SELLER_ROW",
        status: "PENDING",
        attempts: 0,
        expectedVersion: 3,
        payload: {
          partyId: "party-1",
          saleId: SYNC_DRAFT_ID,
          reference: "SAL-SYNC",
          status: DRAFT_STATUS,
          syncVersion: 3,
          dispatchQuantity: "1000",
          morningReturnQuantity: "560",
          dayReturnQuantity: "0",
          eveningReturnQuantity: "0",
          commissionRupees: "0",
        },
        updatedAt: 1,
        schemaVersion: 1,
      }),
      acknowledgeSellerSync,
      markSellerRowSyncing: vi.fn().mockResolvedValue(undefined),
    });
    const onUpdateDraft = vi.fn().mockResolvedValue({
      id: SYNC_DRAFT_ID,
      reference: "SAL-SYNC",
      status: DRAFT_STATUS,
      syncVersion: 4,
    });

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={draftWorkspace}
        localStore={localStore}
        onSaveDraft={vi.fn()}
        onUpdateDraft={onUpdateDraft}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn()}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));

    await waitFor(() => {
      expect(onUpdateDraft).toHaveBeenCalledWith(
        SYNC_DRAFT_ID,
        expect.objectContaining({ operationId, expectedVersion: 3 }),
      );
    });
    expect(acknowledgeSellerSync).toHaveBeenCalledWith(
      {
        ownerKind: "ADMIN_REAL",
        ownerId: ADMIN_OWNER_ID,
        organizationId: "org-1",
      },
      ENTRY_DATE,
      "party-1",
      operationId,
      expect.objectContaining({ id: SYNC_DRAFT_ID, syncVersion: 4 }),
    );
  });

  it("contains a failed durable sync acknowledgement and a failed durable row removal", async () => {
    const localStore = createLocalStore({
      markSellerRowSynced: vi.fn().mockRejectedValue(new Error("ack failed")),
      removeSellerRow: vi.fn().mockRejectedValue(new Error("remove failed")),
    });
    renderEntry(localStore);
    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));
    await waitFor(() => expect(localStore.markSellerRowSynced).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(SELLER_DISPATCH_LABEL), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save row/ }));
    await waitFor(() => expect(localStore.removeSellerRow).toHaveBeenCalledWith(
      {
        ownerKind: "ADMIN_REAL",
        ownerId: ADMIN_OWNER_ID,
        organizationId: "org-1",
      },
      "party-1",
      ENTRY_DATE,
    ));
  });

  it("keeps local-first editing functional when no IndexedDB store is available", async () => {
    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={null}
        onSaveDraft={vi.fn().mockResolvedValue({ id: "draft-1", reference: "SAL-2", status: DRAFT_STATUS })}
        onUpdateDraft={vi.fn().mockResolvedValue({ id: "draft-1", reference: "SAL-2", status: DRAFT_STATUS })}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockResolvedValue({ id: CORRECTION_DRAFT_ID, reference: "SAL-C", status: DRAFT_STATUS })}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );
    const morningReturn = await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL);
    fireEvent.change(morningReturn, { target: { value: "911" } });
    const total = screen.getByRole("heading", { name: /Daily saved total/ }).closest("section");
    expect(within(total as HTMLElement).getByText(MORNING_RETURN_SUMMARY_LABEL).parentElement).toHaveTextContent(
      "911",
    );
    fireEvent.click(screen.getByRole("button", { name: /Save row/ }));
    await waitFor(() => expect(screen.getByText("SAL-2")).toBeInTheDocument());
  });


  it("recovers the legacy browser pending row and schedules it as dirty", async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    const key = "orbis.accounting.pending-seller-row.org-1.party-1.2026-09-07";
    const values = new Map<string, string>([
      [
        key,
        JSON.stringify({
          partyId: "party-1",
          dispatchQuantity: "1000",
          morningReturnQuantity: "913",
          dayReturnQuantity: "0",
          eveningReturnQuantity: "0",
          commissionRupees: "0",
        }),
      ],
    ]);
    const fakeStorage = {
      getItem: vi.fn((name: string) => values.get(name) ?? null),
      setItem: vi.fn((name: string, value: string) => values.set(name, value)),
      removeItem: vi.fn((name: string) => values.delete(name)),
      clear: vi.fn(() => values.clear()),
      key: vi.fn(() => null),
      get length() {
        return values.size;
      },
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: fakeStorage,
    });

    try {
      render(
        <DailySellerEntry
          organizationId="org-1"
          workspace={workspace}
          localStore={null}
          onSaveDraft={vi.fn().mockResolvedValue({ id: "draft-1", reference: "SAL-2", status: DRAFT_STATUS })}
          onUpdateDraft={vi.fn().mockResolvedValue({ id: "draft-1", reference: "SAL-2", status: DRAFT_STATUS })}
          onDeleteDraft={vi.fn().mockResolvedValue(true)}
          onCorrectPosted={vi.fn().mockResolvedValue({ id: CORRECTION_DRAFT_ID, reference: "SAL-C", status: DRAFT_STATUS })}
          onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
        />,
      );
      expect(await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL)).toHaveValue("913");
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, "localStorage", originalDescriptor);
      } else {
        Reflect.deleteProperty(window, "localStorage");
      }
    }
  });

  it("ignores a durable local load that resolves after unmount", async () => {
    let resolveRows: (value: Awaited<ReturnType<LotteryAccountingLocalStore["loadSellerRows"]>>) => void =
      noopResolver;
    const localStore = createLocalStore({
      loadSellerRows: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRows = resolve;
          }),
      ),
    });
    const rendered = renderEntry(localStore);
    rendered.unmount();

    await act(async () => {
      resolveRows([
        {
          key: "late-pending",
          partitionKey: ADMIN_PARTITION_KEY,
          entityType: "SELLER_DAILY",
          partyId: "party-1",
          occurredAt: ENTRY_DATE,
          row: {
            partyId: "party-1",
            dispatchQuantity: "1000",
            morningReturnQuantity: "999",
            dayReturnQuantity: "0",
            eveningReturnQuantity: "0",
            commissionRupees: "0",
          },
          syncState: "PENDING",
          updatedAt: 9,
        },
      ]);
    });
    expect(localStore.markSellerRowSynced).not.toHaveBeenCalled();
  });

  it("does not acknowledge a save response after the row changes while saving", async () => {
    let resolveCorrection: (value: { id: string; reference: string; status: typeof DRAFT_STATUS }) => void =
      noopResolver;
    const onCorrectPosted = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCorrection = resolve;
        }),
    );
    const localStore = createLocalStore();
    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={localStore}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn().mockResolvedValue({ id: "draft-after-correction", reference: "SAL-3", status: DRAFT_STATUS })}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={onCorrectPosted}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));
    fireEvent.change(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL), {
      target: { value: "914" },
    });
    await act(async () => {
      resolveCorrection({ id: CORRECTION_DRAFT_ID, reference: "SAL-C", status: DRAFT_STATUS });
    });
    await waitFor(() => expect(onCorrectPosted).toHaveBeenCalled());
    expect(localStore.markSellerRowSynced).not.toHaveBeenCalled();
    expect(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL)).toHaveValue("914");
  });

  it("does not acknowledge an old-date save response after the entry date changes", async () => {
    let resolveCorrection: (value: { id: string; reference: string; status: typeof DRAFT_STATUS }) => void =
      noopResolver;
    const localStore = createLocalStore();
    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={localStore}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn().mockResolvedValue({ id: "draft-after-correction", reference: "SAL-3", status: DRAFT_STATUS })}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveCorrection = resolve;
            }),
        )}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));
    fireEvent.change(screen.getByLabelText(ENTRY_DATE_LABEL), {
      target: { value: BACKDATED_ENTRY_DATE },
    });
    await act(async () => {
      resolveCorrection({ id: CORRECTION_DRAFT_ID, reference: "SAL-C", status: DRAFT_STATUS });
    });
    await waitFor(() => {
      expect(screen.getByLabelText(ENTRY_DATE_LABEL)).toHaveValue(BACKDATED_ENTRY_DATE);
    });
    expect(localStore.markSellerRowSynced).not.toHaveBeenCalled();
  });

  it("falls back to a blank working row if the seller disappears during an accepted save", async () => {
    let resolveCorrection: (value: { id: string; reference: string; status: typeof DRAFT_STATUS }) => void =
      noopResolver;
    const onUpdateDraft = vi.fn().mockResolvedValue({
      id: "draft-after-refresh",
      reference: "SAL-4",
      status: DRAFT_STATUS,
    });
    const localStore = createLocalStore();
    const props = {
      organizationId: "org-1",
      localStore,
      onSaveDraft: vi.fn(),
      onUpdateDraft,
      onDeleteDraft: vi.fn().mockResolvedValue(true),
      onCorrectPosted: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCorrection = resolve;
          }),
      ),
      onUpdateTdsRate: vi.fn().mockResolvedValue(true),
    };
    const rendered = render(<DailySellerEntry {...props} workspace={workspace} />);
    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));

    const emptyWorkspace: LotteryWorkspace = {
      ...workspace,
      parties: [],
      sales: [],
      draftSales: [],
    };
    rendered.rerender(<DailySellerEntry {...props} workspace={emptyWorkspace} />);
    await act(async () => {
      resolveCorrection({ id: CORRECTION_DRAFT_ID, reference: "SAL-C", status: DRAFT_STATUS });
    });

    await waitFor(() => {
      expect(localStore.markSellerRowSynced).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" }),
        ENTRY_DATE,
        expect.objectContaining({
          partyId: "party-1",
          saleId: "draft-after-refresh",
          reference: "SAL-4",
          status: DRAFT_STATUS,
        }),
      );
    });
  });

  it("contains rejected and stale delete completions without clearing a newer row", async () => {
    const rejectedDeleteStore = createLocalStore();
    const first = render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={rejectedDeleteStore}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn().mockResolvedValue(false)}
        onCorrectPosted={vi.fn().mockResolvedValue({ id: CORRECTION_DRAFT_ID, reference: "SAL-C", status: DRAFT_STATUS })}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );
    fireEvent.change(await screen.findByLabelText(SELLER_DISPATCH_LABEL), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save row/ }));
    await waitFor(() => expect(rejectedDeleteStore.removeSellerRow).not.toHaveBeenCalled());
    first.unmount();

    let resolveCorrection: (value: { id: string; reference: string; status: typeof DRAFT_STATUS }) => void =
      noopResolver;
    const staleDeleteStore = createLocalStore();
    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={staleDeleteStore}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveCorrection = resolve;
            }),
        )}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );
    fireEvent.change(await screen.findByLabelText(SELLER_DISPATCH_LABEL), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save row/ }));
    fireEvent.change(screen.getByLabelText(SELLER_DISPATCH_LABEL), {
      target: { value: "1" },
    });
    await act(async () => {
      resolveCorrection({ id: CORRECTION_DRAFT_ID, reference: "SAL-C", status: DRAFT_STATUS });
    });
    await waitFor(() => {
      expect(screen.getByLabelText(SELLER_DISPATCH_LABEL)).toHaveValue("1");
    });
    expect(staleDeleteStore.removeSellerRow).not.toHaveBeenCalled();
  });

  it("keeps an unacknowledged row local when correction cannot create a replacement draft", async () => {
    const localStore = createLocalStore();
    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={localStore}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockResolvedValue(null)}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));
    await waitFor(() => expect(localStore.markSellerRowSynced).not.toHaveBeenCalled());
  });

  it("clears a zero row without durable removal when IndexedDB is unavailable", async () => {
    const onDeleteDraft = vi.fn().mockResolvedValue(true);
    const onCorrectPosted = vi
      .fn()
      .mockResolvedValue({
        id: CORRECTION_DRAFT_ID,
        reference: "SAL-C",
        status: DRAFT_STATUS,
      });

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={null}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={onDeleteDraft}
        onCorrectPosted={onCorrectPosted}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );
    fireEvent.change(await screen.findByLabelText(SELLER_DISPATCH_LABEL), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save row/ }));

    await waitFor(() => {
      expect(onCorrectPosted).toHaveBeenCalledWith("sale-1");
      expect(onDeleteDraft).toHaveBeenCalledWith(CORRECTION_DRAFT_ID);
      expect(screen.getByLabelText(SELLER_DISPATCH_LABEL)).toHaveValue("0");
      expect(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL)).toHaveValue("0");
    });
  });


  it("covers empty seller rate and invalid commission fallbacks in the shared calculation adapter", async () => {
    const fallbackWorkspace: LotteryWorkspace = {
      ...workspace,
      parties: workspace.parties.map((party) => ({
        ...party,
        ticketRatePaise: "",
      })),
    };

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={fallbackWorkspace}
        localStore={null}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockResolvedValue(null)}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    const commission = await screen.findByLabelText("Seller A commission amount");
    fireEvent.change(commission, { target: { value: "." } });

    expect(commission).toHaveValue(".");
    const total = screen
      .getByRole("heading", { name: /Daily saved total/ })
      .closest("section");
    expect(total).not.toBeNull();
    expect(
      within(total as HTMLElement).getByText("Net amount").parentElement,
    ).toHaveTextContent("₹0.00");
  });

  it("merges a durable pending row over a legacy recovered row for the same seller", async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    const key = "orbis.accounting.pending-seller-row.org-1.party-1.2026-09-07";
    const values = new Map<string, string>([
      [
        key,
        JSON.stringify({
          partyId: "party-1",
          dispatchQuantity: "1000",
          morningReturnQuantity: "913",
          dayReturnQuantity: "0",
          eveningReturnQuantity: "0",
          commissionRupees: "0",
        }),
      ],
    ]);
    const fakeStorage = {
      getItem: vi.fn((name: string) => values.get(name) ?? null),
      setItem: vi.fn((name: string, value: string) => values.set(name, value)),
      removeItem: vi.fn((name: string) => values.delete(name)),
      clear: vi.fn(() => values.clear()),
      key: vi.fn(() => null),
      get length() {
        return values.size;
      },
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: fakeStorage,
    });

    const localStore = createLocalStore({
      loadSellerRows: vi.fn().mockResolvedValue([
        {
          key: "durable-after-legacy",
          partitionKey: ADMIN_PARTITION_KEY,
          entityType: "SELLER_DAILY",
          partyId: "party-1",
          occurredAt: ENTRY_DATE,
          row: {
            partyId: "party-1",
            dispatchQuantity: "1000",
            morningReturnQuantity: "914",
            dayReturnQuantity: "0",
            eveningReturnQuantity: "0",
            commissionRupees: "0",
          },
          syncState: "PENDING",
          updatedAt: 2,
        },
      ]),
    });

    try {
      renderEntry(localStore);
      await waitFor(() => {
        expect(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL)).toHaveValue("914");
      });
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, "localStorage", originalDescriptor);
      } else {
        Reflect.deleteProperty(window, "localStorage");
      }
    }
  });

  it("uses the default browser local-store factory when no store prop is supplied", async () => {
    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockResolvedValue(null)}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(await screen.findByLabelText(SELLER_DISPATCH_LABEL)).toHaveValue("1000");
  });


  it("deletes an untouched blank row using the zero-version fallback", async () => {
    const blankWorkspace: LotteryWorkspace = {
      ...workspace,
      sales: [],
      draftSales: [],
    };
    const localStore = createLocalStore();

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={blankWorkspace}
        localStore={localStore}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockResolvedValue(null)}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));

    await waitFor(() => {
      expect(localStore.removeSellerRow).toHaveBeenCalledWith(
        {
          ownerKind: "ADMIN_REAL",
          ownerId: ADMIN_OWNER_ID,
          organizationId: "org-1",
        },
        "party-1",
        ENTRY_DATE,
      );
    });
  });


  it("publishes a current manual persistence error and shows the original Error message", async () => {
    const onLocalRowStateChange = vi.fn();

    const localStore = createLocalStore({
      markSellerRowSyncing: vi.fn().mockRejectedValue(new Error("sync marker failed")),
      markSellerRowSyncError: vi.fn().mockRejectedValue(new Error("error marker failed")),
    });

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={localStore}
        onLocalRowStateChange={onLocalRowStateChange}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockRejectedValue(new Error(MANUAL_SAVE_FAILED))}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));

    await waitFor(() => {
      expect(onLocalRowStateChange).toHaveBeenCalledWith(
        ENTRY_DATE,
        expect.objectContaining({ partyId: "party-1" }),
        "ERROR",
      );
      expect(screen.getByText(MANUAL_SAVE_FAILED)).toBeVisible();
      expect(localStore.markSellerRowSyncing).toHaveBeenCalled();
      expect(localStore.markSellerRowSyncError).toHaveBeenCalledWith(
        expect.any(Object),
        ENTRY_DATE,
        expect.objectContaining({ partyId: "party-1" }),
        MANUAL_SAVE_FAILED,
      );
    });
  });

  it("keeps autosave errors non-blocking while covering changed-row version and non-Error rejection", async () => {
    const onLocalRowStateChange = vi.fn();

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={createLocalStore({
          markSellerRowSyncing: vi.fn().mockResolvedValue(undefined),
          markSellerRowSyncError: vi.fn().mockResolvedValue(undefined),
        })}
        onLocalRowStateChange={onLocalRowStateChange}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockRejectedValue("autosave failed")}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    const morningReturn = await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL);
    fireEvent.change(morningReturn, { target: { value: "911" } });

    await waitFor(
      () => {
        expect(onLocalRowStateChange).toHaveBeenCalledWith(
          ENTRY_DATE,
          expect.objectContaining({ morningReturnQuantity: "911" }),
          "ERROR",
        );
      },
      { timeout: 2000 },
    );

    expect(screen.queryByText("Entry could not be saved.")).not.toBeInTheDocument();
  });

  it("does not mark an older row errored when its version changes before rejection", async () => {
    let rejectCorrection: (reason?: unknown) => void = noopOptionalResolver;
    const onLocalRowStateChange = vi.fn();

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={createLocalStore()}
        onLocalRowStateChange={onLocalRowStateChange}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockImplementation(
          () =>
            new Promise((_resolve, reject) => {
              rejectCorrection = reject;
            }),
        )}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));
    fireEvent.change(screen.getByLabelText(SELLER_MORNING_RETURN_LABEL), {
      target: { value: "912" },
    });

    await act(async () => {
      rejectCorrection(new Error("stale row failure"));
    });

    await waitFor(() => expect(screen.getByText("stale row failure")).toBeVisible());
    expect(
      onLocalRowStateChange.mock.calls.some((call) => call[2] === "ERROR"),
    ).toBe(false);
  });

  it("does not mark an old-date row errored after the selected entry date changes", async () => {
    let rejectCorrection: (reason?: unknown) => void = noopOptionalResolver;
    const onLocalRowStateChange = vi.fn();

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={createLocalStore()}
        onLocalRowStateChange={onLocalRowStateChange}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockImplementation(
          () =>
            new Promise((_resolve, reject) => {
              rejectCorrection = reject;
            }),
        )}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));
    fireEvent.change(screen.getByLabelText(ENTRY_DATE_LABEL), {
      target: { value: BACKDATED_ENTRY_DATE },
    });

    await act(async () => {
      rejectCorrection(new Error("old-date failure"));
    });

    await waitFor(() => expect(screen.getByText("old-date failure")).toBeVisible());
    expect(
      onLocalRowStateChange.mock.calls.some((call) => call[2] === "ERROR"),
    ).toBe(false);
  });


  it("shows the fallback validation message for a non-Error manual persistence rejection", async () => {
    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={createLocalStore()}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={vi.fn().mockRejectedValue("manual non-error failure")}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Save row/ }));

    expect(await screen.findByText("Entry could not be saved.")).toBeVisible();
  });


  it("replays only CLOUD outbox rows on online events and surfaces outbox read failures", async () => {
    const pendingOutbox = {
      operationId: "retry-op",
      partitionKey: ADMIN_PARTITION_KEY,
      entityKey: `${ADMIN_PARTITION_KEY}:SELLER_DAILY:party-1:${ENTRY_DATE}`,
      operation: "UPSERT_SELLER_ROW" as const,
      status: "ERROR" as const,
      attempts: 1,
      payload: {
        partyId: "party-1",
        dispatchQuantity: "1000",
        morningReturnQuantity: "910",
        dayReturnQuantity: "0",
        eveningReturnQuantity: "0",
        commissionRupees: "0",
      },
      updatedAt: 1,
      lastError: "offline",
      schemaVersion: 1 as const,
    };
    const listPendingOutbox = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([pendingOutbox])
      .mockRejectedValueOnce(new Error("outbox read failed"));
    const localStore = createLocalStore({
      listPendingOutbox,
      markSellerRowSyncing: vi.fn().mockResolvedValue(undefined),
    });
    const onCorrectPosted = vi
      .fn()
      .mockResolvedValue({ id: CORRECTION_DRAFT_ID, reference: "SAL-C", status: DRAFT_STATUS });

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={workspace}
        localStore={localStore}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn().mockResolvedValue({
          id: "draft-after-retry",
          reference: "SAL-R",
          status: DRAFT_STATUS,
        })}
        onDeleteDraft={vi.fn().mockResolvedValue(true)}
        onCorrectPosted={onCorrectPosted}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(listPendingOutbox).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(listPendingOutbox).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onCorrectPosted).toHaveBeenCalled(), {
      timeout: 2000,
    });

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(
      await screen.findByText(
        "Pending cloud accounting changes could not be read for retry.",
      ),
    ).toBeVisible();
  });

  it("does not read a cloud outbox on online events while DEVICE is primary", async () => {
    const listPendingOutbox = vi.fn().mockResolvedValue([]);
    const deviceWorkspace: LotteryWorkspace = {
      ...workspace,
      organization: {
        ...workspace.organization,
        userLedgerStorage: "DEVICE",
      },
    };

    render(
      <DailySellerEntry
        organizationId="org-1"
        workspace={deviceWorkspace}
        localStore={createLocalStore({ listPendingOutbox })}
        onSaveDraft={vi.fn()}
        onUpdateDraft={vi.fn()}
        onDeleteDraft={vi.fn()}
        onCorrectPosted={vi.fn()}
        onUpdateTdsRate={vi.fn().mockResolvedValue(true)}
      />,
    );

    await screen.findByLabelText(SELLER_MORNING_RETURN_LABEL);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(listPendingOutbox).not.toHaveBeenCalled();
  });

});
