import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FilePenLine,
  Grid2X2,
  List,
} from "lucide-react";
import {
  formatPaise,
  formatPercentFromBasisPoints,
  percentToBasisPoints,
  rupeesToPaise,
} from "../../models/lotteryAccountingMoney";
import {
  calculateLotterySeller,
  sumLotterySellerCalculations,
  type LotterySellerCalculation,
} from "../../models/lotteryAccountingSellerCalculation";
import {
  getLotteryAccountingLocalStore,
  type AccountingLocalScope,
  type AccountingLocalSyncState,
  type AccountingSellerWorkingRow,
  type LotteryAccountingLocalStore,
} from "../../models/lotteryAccountingLocalStore";
import type {
  LotteryDraftSale,
  LotteryDailySellerDraftIdentity,
  LotteryParty,
  LotterySale,
  LotteryWorkspace,
} from "../../models/lotteryAccountingTypes";

type DailyViewMode = "table" | "grid";

type DailySellerRow = AccountingSellerWorkingRow;

type SaleLike = LotterySale | LotteryDraftSale;

const CONTROL_CLASS =
  "w-full rounded-lg border border-emerald-100 bg-white px-2 py-2 text-[11px] text-slate-800 outline-none focus:border-emerald-500";

const DEVICE_STORAGE_UNAVAILABLE_MESSAGE =
  "Device accounting storage is unavailable. This entry has not been durably saved.";

const METHOD_LABELS = {
  cashPaise: "Cash",
  bankPaise: "Bank",
  upiPaise: "UPI",
  chequePaise: "Cheque",
  pwtPaise: "PWT",
} as const;

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function isSameEntryDate(value: string, day: string) {
  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day
  );
}

function selectAllInputText(event: React.FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}

function rowFromSale(sale: SaleLike): DailySellerRow {
  return {
    saleId: sale.id,
    partyId: sale.partyId,
    reference: sale.reference,
    status: sale.status,
    syncVersion: sale.syncVersion ?? 1,
    dispatchQuantity: String(sale.dispatchQuantity),
    morningReturnQuantity: String(sale.morningReturnQuantity),
    dayReturnQuantity: String(sale.dayReturnQuantity),
    eveningReturnQuantity: String(sale.eveningReturnQuantity),
    commissionRupees: paiseToRupeesInput(sale.commissionPaise),
  };
}

function blankRow(partyId: string): DailySellerRow {
  return {
    partyId,
    dispatchQuantity: "0",
    morningReturnQuantity: "0",
    dayReturnQuantity: "0",
    eveningReturnQuantity: "0",
    commissionRupees: "0",
  };
}

function sellerExpectedVersion(row: DailySellerRow) {
  return row.syncVersion ?? (row.saleId ? 1 : 0);
}

function fallbackSellerSyncOperationId() {
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `SELLER_ROW_SYNC:FALLBACK:${id}`;
}

function rowIsZero(row: DailySellerRow) {
  return [
    row.dispatchQuantity,
    row.morningReturnQuantity,
    row.dayReturnQuantity,
    row.eveningReturnQuantity,
    row.commissionRupees,
  ].every((value) => !value.trim() || /^0+(?:\.0+)?$/.test(value.trim()));
}

function pendingRowStorageKey(
  organizationId: string,
  partyId: string,
  occurredAt: string,
) {
  return `orbis.accounting.pending-seller-row.${organizationId}.${partyId}.${occurredAt}`;
}

function readPendingRow(
  organizationId: string,
  partyId: string,
  occurredAt: string,
): DailySellerRow | null {
  try {
    const value = window.localStorage.getItem(
      pendingRowStorageKey(organizationId, partyId, occurredAt),
    );
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !(
        "dispatchQuantity" in parsed &&
        "morningReturnQuantity" in parsed &&
        "dayReturnQuantity" in parsed &&
        "eveningReturnQuantity" in parsed &&
        "commissionRupees" in parsed
      )
    ) {
      return null;
    }
    return parsed as DailySellerRow;
  } catch {
    return null;
  }
}

function storePendingRow(
  organizationId: string,
  partyId: string,
  occurredAt: string,
  row: DailySellerRow,
) {
  try {
    window.localStorage.setItem(
      pendingRowStorageKey(organizationId, partyId, occurredAt),
      JSON.stringify(row),
    );
  } catch {
    // Browser storage can be unavailable in private mode; the network save still runs.
  }
}

function clearPendingRow(
  organizationId: string,
  partyId: string,
  occurredAt: string,
) {
  try {
    window.localStorage.removeItem(
      pendingRowStorageKey(organizationId, partyId, occurredAt),
    );
  } catch {
    // Nothing further is required when the browser has already discarded storage.
  }
}

function paiseToRupeesInput(value: string) {
  const paise = BigInt(value);
  return `${paise / 100n}.${(paise % 100n).toString().padStart(2, "0")}`;
}

function calculateRow(
  row: DailySellerRow,
  party: LotteryParty,
  tdsRateBps: number,
): LotterySellerCalculation {
  return calculateLotterySeller({
    dispatchQuantity: row.dispatchQuantity,
    morningReturnQuantity: row.morningReturnQuantity,
    dayReturnQuantity: row.dayReturnQuantity,
    eveningReturnQuantity: row.eveningReturnQuantity,
    ticketRatePaise: party.ticketRatePaise || "0",
    commissionPaise: rupeesToPaise(row.commissionRupees) || "0",
    tdsRateBps,
  });
}

function sumValues(values: Iterable<bigint>) {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

function dateCaption(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function buildRows({
  parties,
  sales,
  drafts,
  selectedDate,
}: {
  parties: LotteryParty[];
  sales: Array<LotterySale | LotteryDraftSale>;
  drafts: LotteryDraftSale[];
  selectedDate: string;
}) {
  return Object.fromEntries(
    parties.map((party) => {
      const draft = drafts.find(
        (sale) =>
          sale.partyId === party.id &&
          isSameEntryDate(sale.occurredAt, selectedDate),
      );
      const posted = sales.find(
        (sale) =>
          sale.partyId === party.id &&
          isSameEntryDate(sale.occurredAt, selectedDate),
      );
      return [
        party.id,
        draft
          ? rowFromSale(draft)
          : posted
            ? rowFromSale(posted)
            : blankRow(party.id),
      ];
    }),
  ) as Record<string, DailySellerRow>;
}

function ActionButton({
  children,
  disabled,
  onClick,
  tone = "plain",
}: Readonly<{
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: "plain" | "save" | "danger";
}>) {
  const classes = {
    plain:
      "border border-slate-200 bg-white text-slate-700 hover:border-emerald-200",
    save: "border border-emerald-600 bg-emerald-600 text-white",
    danger: "border border-orange-200 bg-orange-50 text-orange-800",
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg px-2 text-[9px] font-bold disabled:cursor-not-allowed disabled:opacity-50 ${classes[tone]}`}
    >
      {children}
    </button>
  );
}

function DailyTotals({
  title,
  calculations,
  payments,
}: Readonly<{
  title: string;
  calculations: LotterySellerCalculation[];
  payments: LotteryWorkspace["payments"];
}>) {
  const totals = useMemo(() => {
    const sellerTotals = sumLotterySellerCalculations(calculations);
    const methodTotals = Object.fromEntries(
      Object.keys(METHOD_LABELS).map((key) => [key, 0n]),
    ) as Record<keyof typeof METHOD_LABELS, bigint>;
    for (const payment of payments) {
      if (payment.direction !== "RECEIPT") continue;
      for (const key of Object.keys(METHOD_LABELS) as Array<
        keyof typeof METHOD_LABELS
      >) {
        methodTotals[key] += BigInt(payment.methodSplit[key] || "0");
      }
    }
    return {
      ...sellerTotals,
      paymentTotal: sumValues(
        payments
          .filter((payment) => payment.direction === "RECEIPT")
          .map((payment) => BigInt(payment.totalAmountPaise)),
      ),
      methodTotals,
    };
  }, [calculations, payments]);
  const items = [
    ["Dispatch", totals.dispatch.toString()],
    ["Morning return", totals.morningReturn.toString()],
    ["Day return", totals.dayReturn.toString()],
    ["Evening return", totals.eveningReturn.toString()],
    ["Total return", totals.totalReturn.toString()],
    ["Net sale", totals.netSale.toString()],
    ["Net amount", formatPaise(totals.grossAmountPaise)],
    ["Party payable", formatPaise(totals.partyPayablePaise)],
    ["Payment received", formatPaise(totals.paymentTotal)],
    ...Object.entries(METHOD_LABELS).map(([key, label]) => [
      label,
      formatPaise(totals.methodTotals[key as keyof typeof METHOD_LABELS]),
    ]),
  ];
  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
      <h5 className="text-xs font-black text-slate-900">{title}</h5>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-emerald-100 bg-emerald-50/45 p-2"
          >
            <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-1 text-[11px] font-black text-slate-900">
              {value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export interface DailySellerEntryProps {
  organizationId: string;
  workspace: LotteryWorkspace;
  onSaveDraft: (
    payload: Record<string, unknown>,
  ) => Promise<LotteryDailySellerDraftIdentity | null>;
  onUpdateDraft: (
    saleId: string,
    payload: Record<string, unknown>,
  ) => Promise<LotteryDailySellerDraftIdentity | null>;
  onDeleteDraft: (saleId: string) => Promise<boolean>;
  onCorrectPosted: (
    saleId: string,
  ) => Promise<LotteryDailySellerDraftIdentity | null>;
  onUpdateTdsRate: (tdsRateBps: number) => Promise<boolean>;
  onRegisterFlush?: (
    flush: (() => Promise<boolean>) | null,
  ) => void;
  localScope?: Omit<AccountingLocalScope, "organizationId">;
  localStore?: LotteryAccountingLocalStore | null;
  onLocalRowStateChange?: (
    occurredAt: string,
    row: AccountingSellerWorkingRow,
    syncState: AccountingLocalSyncState,
  ) => void;
  onLocalRowRemoved?: (partyId: string, occurredAt: string) => void;
  editRequest?: { partyId: string; occurredAt: string; token: number } | null;
}

export function DailySellerEntry({
  organizationId,
  workspace,
  onSaveDraft,
  onUpdateDraft,
  onDeleteDraft,
  onCorrectPosted,
  onUpdateTdsRate,
  onRegisterFlush,
  localScope = { ownerKind: "ADMIN_REAL", ownerId: "admin-current" },
  localStore = getLotteryAccountingLocalStore(),
  onLocalRowStateChange,
  onLocalRowRemoved,
  editRequest,
}: Readonly<DailySellerEntryProps>) {
  const [viewMode, setViewMode] = useState<DailyViewMode>("grid");
  const [selectedDate, setSelectedDate] = useState(todayInputValue());
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const globalTdsRateBps = workspace.organization.tdsRateBps ?? 200;
  const [tdsPercent, setTdsPercent] = useState(
    (globalTdsRateBps / 100).toFixed(2),
  );
  const sellers = useMemo(
    () => workspace.parties.filter((party) => party.partyType === "SELLER"),
    [workspace.parties],
  );
  const [rows, setRows] = useState<Record<string, DailySellerRow>>({});
  const accountingScope = useMemo<AccountingLocalScope>(
    () => ({ ...localScope, organizationId }),
    [localScope.ownerId, localScope.ownerKind, organizationId],
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [savingPartyIds, setSavingPartyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [autosaveVersion, setAutosaveVersion] = useState(0);
  const rowsRef = useRef(rows);
  const workspaceRef = useRef(workspace);
  const sellersRef = useRef(sellers);
  const currentDateRef = useRef(selectedDate);
  const dirtyPartyIdsRef = useRef(new Set<string>());
  const rowVersionsRef = useRef(new Map<string, number>());
  const savingPartyIdsRef = useRef(new Set<string>());
  const actionsRef = useRef({
    onSaveDraft,
    onUpdateDraft,
    onDeleteDraft,
    onCorrectPosted,
  });
  const sellerKey = sellers
    .map((party) => `${party.id}:${party.name}:${party.ticketRatePaise}`)
    .join("|");

  rowsRef.current = rows;
  workspaceRef.current = workspace;
  sellersRef.current = sellers;
  currentDateRef.current = selectedDate;
  actionsRef.current = {
    onSaveDraft,
    onUpdateDraft,
    onDeleteDraft,
    onCorrectPosted,
  };

  useEffect(() => {
    setTdsPercent((globalTdsRateBps / 100).toFixed(2));
  }, [globalTdsRateBps]);

  useEffect(() => {
    let cancelled = false;
    const currentWorkspace = workspaceRef.current;
    const nextRows = buildRows({
      parties: sellersRef.current,
      sales: currentWorkspace.sales,
      drafts: currentWorkspace.draftSales,
      selectedDate,
    });
    const legacyRecoveredPartyIds = sellersRef.current.flatMap((party) => {
      const pending = readPendingRow(organizationId, party.id, selectedDate);
      if (!pending) return [];
      nextRows[party.id] = { ...nextRows[party.id], ...pending, partyId: party.id };
      return [party.id];
    });
    setRows(nextRows);
    dirtyPartyIdsRef.current = new Set(legacyRecoveredPartyIds);
    rowVersionsRef.current = new Map(
      legacyRecoveredPartyIds.map((partyId) => [partyId, 1]),
    );
    if (legacyRecoveredPartyIds.length) {
      setAutosaveVersion((current) => current + 1);
    }

    if (localStore) {
      void localStore
        .loadSellerRows(accountingScope, selectedDate)
        .then((records) => {
          if (cancelled || currentDateRef.current !== selectedDate) return;
          const recoveredRecords = records.filter(
            (record) =>
              record.syncState !== "SYNCED" &&
              (rowVersionsRef.current.get(record.partyId) || 0) <= 1,
          );
          if (recoveredRecords.length) {
            const shouldRetryCloud =
              currentWorkspace.organization.userLedgerStorage === "CLOUD";
            for (const record of recoveredRecords) {
              if (shouldRetryCloud && record.syncState !== "LOCAL_SAVED") {
                dirtyPartyIdsRef.current.add(record.partyId);
              }
              rowVersionsRef.current.set(
                record.partyId,
                Math.max(rowVersionsRef.current.get(record.partyId) || 0, 1),
              );
            }
            setRows((current) => {
              const recovered = { ...current };
              for (const record of recoveredRecords) {
                recovered[record.partyId] = {
                  ...(recovered[record.partyId] || blankRow(record.partyId)),
                  ...record.row,
                  partyId: record.partyId,
                };
              }
              return recovered;
            });
            if (shouldRetryCloud && dirtyPartyIdsRef.current.size) {
              setAutosaveVersion((current) => current + 1);
            }
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLocalError(
              "Device accounting storage could not be read; browser recovery fallback remains available.",
            );
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [accountingScope, localStore, organizationId, selectedDate, sellerKey]);

  useEffect(() => {
    if (!selectedPartyId && sellers[0]) setSelectedPartyId(sellers[0].id);
  }, [selectedPartyId, sellerKey, sellers]);

  useEffect(() => {
    if (!editRequest) return;
    setSelectedDate(editRequest.occurredAt.slice(0, 10));
    setSelectedPartyId(editRequest.partyId);
  }, [editRequest]);

  const liveSellerCalculations = useMemo(
    () =>
      sellers.map((party) =>
        calculateRow(
          rows[party.id] || blankRow(party.id),
          party,
          globalTdsRateBps,
        ),
      ),
    [globalTdsRateBps, rows, sellers],
  );
  const dailyPayments = useMemo(
    () =>
      workspace.payments.filter((payment) =>
        isSameEntryDate(payment.occurredAt, selectedDate),
      ),
    [selectedDate, workspace.payments],
  );

  const updateRow = (
    partyId: string,
    field: keyof DailySellerRow,
    value: string,
  ) => {
    const nextRow = {
      ...(rowsRef.current[partyId] || blankRow(partyId)),
      [field]: value,
    };
    storePendingRow(organizationId, partyId, selectedDate, nextRow);
    onLocalRowStateChange?.(selectedDate, nextRow, "PENDING");
    if (localStore) {
      const stage =
        workspace.organization.userLedgerStorage === "DEVICE"
          ? localStore.stageSellerRow(
              accountingScope,
              selectedDate,
              nextRow,
              "DEVICE",
            )
          : localStore.stageSellerRow(accountingScope, selectedDate, nextRow);
      void stage
        .then(() => {
          if (workspace.organization.userLedgerStorage === "DEVICE") {
            clearPendingRow(organizationId, partyId, selectedDate);
            onLocalRowStateChange?.(selectedDate, nextRow, "LOCAL_SAVED");
          }
        })
        .catch(() => {
          onLocalRowStateChange?.(selectedDate, nextRow, "ERROR");
          setLocalError(
            workspace.organization.userLedgerStorage === "DEVICE"
              ? DEVICE_STORAGE_UNAVAILABLE_MESSAGE
              : "Device accounting storage could not be written; browser recovery fallback remains available.",
          );
        });
    } else if (workspace.organization.userLedgerStorage === "DEVICE") {
      onLocalRowStateChange?.(selectedDate, nextRow, "ERROR");
      setLocalError(
        DEVICE_STORAGE_UNAVAILABLE_MESSAGE,
      );
    }
    setRows((current) => ({
      ...current,
      [partyId]: nextRow,
    }));
    dirtyPartyIdsRef.current.add(partyId);
    rowVersionsRef.current.set(
      partyId,
      (rowVersionsRef.current.get(partyId) || 0) + 1,
    );
    setAutosaveVersion((current) => current + 1);
  };

  const entryPayload = (party: LotteryParty, row: DailySellerRow) => {
    const calculation = calculateRow(
      row,
      party,
      globalTdsRateBps,
    );
    if (!/^\d+$/.test(row.dispatchQuantity) || calculation.dispatch === 0n) {
      throw new Error("Enter a dispatch quantity before saving this seller.");
    }
    if (
      !/^\d+$/.test(row.morningReturnQuantity) ||
      !/^\d+$/.test(row.dayReturnQuantity) ||
      !/^\d+$/.test(row.eveningReturnQuantity) ||
      calculation.hasInvalidReturn
    ) {
      throw new Error(
        "Morning, day and evening returns must be whole numbers within dispatch.",
      );
    }
    const commissionPaise = rupeesToPaise(row.commissionRupees);
    if (
      !commissionPaise ||
      row.commissionRupees.trim() === "" ||
      calculation.hasInvalidCommission
    ) {
      throw new Error(
        "Enter a commission amount that is not greater than the net amount.",
      );
    }
    if (BigInt(party.ticketRatePaise || "0") <= 0n) {
      throw new Error(`Set the fixed rate profile for ${party.name} first.`);
    }
    return {
      organizationId,
      partyId: party.id,
      periodId: null,
      occurredAt: selectedDate,
      dispatchQuantity: row.dispatchQuantity,
      morningReturnQuantity: row.morningReturnQuantity,
      dayReturnQuantity: row.dayReturnQuantity,
      eveningReturnQuantity: row.eveningReturnQuantity,
      commissionPaise,
    };
  };

  const setPartySaving = (partyId: string, saving: boolean) => {
    if (saving) {
      savingPartyIdsRef.current.add(partyId);
    } else {
      savingPartyIdsRef.current.delete(partyId);
    }
    setSavingPartyIds(new Set(savingPartyIdsRef.current));
  };

  const deleteZeroSellerRow = async (
    row: DailySellerRow,
    actions: typeof actionsRef.current,
  ) => {
    if (!row.saleId) return true;
    if (row.status !== "POSTED") {
      return actions.onDeleteDraft(row.saleId);
    }
    const replacement = await actions.onCorrectPosted(row.saleId);
    return Boolean(replacement && (await actions.onDeleteDraft(replacement.id)));
  };

  const saveSellerRow = async (
    party: LotteryParty,
    row: DailySellerRow,
    actions: typeof actionsRef.current,
    sync: { operationId: string; expectedVersion: number },
  ) => {
    const payload = {
      ...entryPayload(party, row),
      operationId: sync.operationId,
      expectedVersion: sync.expectedVersion,
    };
    if (!row.saleId) return actions.onSaveDraft(payload);
    if (row.status !== "POSTED") {
      return actions.onUpdateDraft(row.saleId, payload);
    }
    const replacement = await actions.onCorrectPosted(row.saleId);
    return replacement
      ? actions.onUpdateDraft(replacement.id, {
          ...payload,
          expectedVersion: replacement.syncVersion ?? 1,
        })
      : null;
  };

  const finishSavingRow = async (
    partyId: string,
    entryDate: string,
    versionAtStart: number,
    operationId: string,
    saved: LotteryDailySellerDraftIdentity | null,
  ) => {
    const isCurrentRow =
      currentDateRef.current === entryDate &&
      (rowVersionsRef.current.get(partyId) || 0) === versionAtStart;
    if (!saved) return;

    const currentRow = rowsRef.current[partyId] || blankRow(partyId);
    const acknowledgedVersion =
      saved.syncVersion ?? sellerExpectedVersion(currentRow) + 1;
    const acknowledgedRow: DailySellerRow = {
      ...currentRow,
      saleId: saved.id,
      reference: saved.reference,
      status: "DRAFT",
      syncVersion: acknowledgedVersion,
    };
    setRows((current) => ({
      ...current,
      [partyId]: {
        ...(current[partyId] || blankRow(partyId)),
        saleId: saved.id,
        reference: saved.reference,
        status: "DRAFT",
        syncVersion: acknowledgedVersion,
      },
    }));

    try {
      if (localStore?.acknowledgeSellerSync) {
        await localStore.acknowledgeSellerSync(
          accountingScope,
          entryDate,
          partyId,
          operationId,
          { ...saved, syncVersion: acknowledgedVersion },
        );
      } else if (isCurrentRow && localStore) {
        await localStore.markSellerRowSynced(
          accountingScope,
          entryDate,
          acknowledgedRow,
        );
      }
    } catch {
      dirtyPartyIdsRef.current.add(partyId);
      onLocalRowStateChange?.(entryDate, acknowledgedRow, "ERROR");
      setLocalError(
        "Server save was acknowledged, but the local sync acknowledgement could not be stored. It will retry safely.",
      );
      setAutosaveVersion((current) => current + 1);
      return;
    }

    if (!isCurrentRow) {
      setAutosaveVersion((current) => current + 1);
      return;
    }

    onLocalRowStateChange?.(entryDate, acknowledgedRow, "SYNCED");
    clearPendingRow(organizationId, partyId, entryDate);
    dirtyPartyIdsRef.current.delete(partyId);
  };

  const finishDeletingRow = (
    partyId: string,
    entryDate: string,
    versionAtStart: number,
    deleted: boolean,
  ) => {
    const isCurrentRow =
      currentDateRef.current === entryDate &&
      (rowVersionsRef.current.get(partyId) || 0) === versionAtStart;
    if (!deleted || !isCurrentRow) return;
    setRows((current) => ({
      ...current,
      [partyId]: blankRow(partyId),
    }));
    onLocalRowRemoved?.(partyId, entryDate);
    if (localStore) {
      void localStore
        .removeSellerRow(accountingScope, partyId, entryDate)
        .catch(() => undefined);
    }
    clearPendingRow(organizationId, partyId, entryDate);
    dirtyPartyIdsRef.current.delete(partyId);
  };

  const handlePersistRowError = (
    error: unknown,
    partyId: string,
    row: DailySellerRow,
    entryDate: string,
    versionAtStart: number,
    showValidation: boolean,
  ) => {
    const isCurrentRow =
      currentDateRef.current === entryDate &&
      (rowVersionsRef.current.get(partyId) || 0) === versionAtStart;
    if (isCurrentRow) {
      onLocalRowStateChange?.(entryDate, row, "ERROR");
      dirtyPartyIdsRef.current.delete(partyId);
      if (localStore?.markSellerRowSyncError) {
        const message =
          error instanceof Error ? error.message : "Entry could not be saved.";
        void localStore
          .markSellerRowSyncError(
            accountingScope,
            entryDate,
            row,
            message,
          )
          .catch(() => undefined);
      }
    }
    if (showValidation) {
      setLocalError(
        error instanceof Error ? error.message : "Entry could not be saved.",
      );
    }
  };

  const persistDeviceSellerRow = async (
    partyId: string,
    entryDate: string,
    row: DailySellerRow,
  ) => {
    if (!localStore) {
      dirtyPartyIdsRef.current.delete(partyId);
      onLocalRowStateChange?.(entryDate, row, "ERROR");
      setLocalError(DEVICE_STORAGE_UNAVAILABLE_MESSAGE);
      return;
    }
    setPartySaving(partyId, true);
    try {
      await localStore.stageSellerRow(
        accountingScope,
        entryDate,
        row,
        "DEVICE",
      );
      clearPendingRow(organizationId, partyId, entryDate);
      dirtyPartyIdsRef.current.delete(partyId);
      onLocalRowStateChange?.(entryDate, row, "LOCAL_SAVED");
    } catch {
      dirtyPartyIdsRef.current.delete(partyId);
      onLocalRowStateChange?.(entryDate, row, "ERROR");
      setLocalError(DEVICE_STORAGE_UNAVAILABLE_MESSAGE);
    } finally {
      setPartySaving(partyId, false);
    }
  };

  const persistCloudSellerRow = async (
    partyId: string,
    entryDate: string,
    versionAtStart: number,
    party: LotteryParty,
    row: DailySellerRow,
    showValidation: boolean,
  ) => {
    const actions = actionsRef.current;
    let durableOperation = null;
    if (localStore?.getSellerSyncOperation) {
      try {
        durableOperation = await localStore.getSellerSyncOperation(
          accountingScope,
          entryDate,
          partyId,
        );
      } catch {
        // Browser recovery remains available; a fresh operation still receives
        // optimistic version protection on the server.
      }
    }
    const sync = {
      operationId:
        durableOperation?.operationId ?? fallbackSellerSyncOperationId(),
      expectedVersion:
        durableOperation?.expectedVersion ?? sellerExpectedVersion(row),
    };
    onLocalRowStateChange?.(entryDate, row, "SYNCING");
    if (localStore?.markSellerRowSyncing) {
      void localStore
        .markSellerRowSyncing(accountingScope, entryDate, row)
        .catch(() => undefined);
    }
    setPartySaving(partyId, true);
    try {
      if (rowIsZero(row)) {
        const deleted = await deleteZeroSellerRow(row, actions);
        finishDeletingRow(partyId, entryDate, versionAtStart, deleted);
        return;
      }
      const saved = await saveSellerRow(party, row, actions, sync);
      if (!saved && showValidation) {
        setLocalError("The seller entry could not be saved. Please try again.");
        return;
      }
      await finishSavingRow(
        partyId,
        entryDate,
        versionAtStart,
        sync.operationId,
        saved,
      );
    } catch (error) {
      handlePersistRowError(
        error,
        partyId,
        row,
        entryDate,
        versionAtStart,
        showValidation,
      );
    } finally {
      setPartySaving(partyId, false);
      if (dirtyPartyIdsRef.current.has(partyId)) {
        setAutosaveVersion((current) => current + 1);
      }
    }
  };

  const persistRow = async (partyId: string, showValidation: boolean) => {
    if (savingPartyIdsRef.current.has(partyId)) return;
    const party = sellersRef.current.find((item) => item.id === partyId);
    const row = rowsRef.current[partyId];
    if (!party || !row) return;
    const entryDate = currentDateRef.current;
    const versionAtStart = rowVersionsRef.current.get(partyId) || 0;
    const storageMode = workspaceRef.current.organization.userLedgerStorage;

    if (storageMode === "DEVICE") {
      await persistDeviceSellerRow(partyId, entryDate, row);
      return;
    }
    await persistCloudSellerRow(
      partyId,
      entryDate,
      versionAtStart,
      party,
      row,
      showValidation,
    );
  };

  const persistRowRef = useRef(persistRow);
  persistRowRef.current = persistRow;

  useEffect(() => {
    if (!onRegisterFlush) return undefined;
    const flushDirtyRows = async () => {
      const dirtyPartyIds = [...dirtyPartyIdsRef.current];
      for (const partyId of dirtyPartyIds) {
        await persistRowRef.current(partyId, true);
      }
      return dirtyPartyIdsRef.current.size === 0;
    };
    onRegisterFlush(flushDirtyRows);
    return () => onRegisterFlush(null);
  }, [onRegisterFlush]);

  const saveRow = async (party: LotteryParty) => {
    setLocalError(null);
    await persistRowRef.current(party.id, true);
  };

  useEffect(() => {
    if (!autosaveVersion) return undefined;
    const timer = window.setTimeout(() => {
      for (const partyId of dirtyPartyIdsRef.current) {
        void persistRowRef.current(partyId, false);
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [autosaveVersion, selectedDate, sellerKey]);

  useEffect(() => {
    if (!localStore) return undefined;
    const retryCloudOutbox = () => {
      if (workspaceRef.current.organization.userLedgerStorage !== "CLOUD") {
        return;
      }
      void localStore
        .listPendingOutbox(accountingScope)
        .then((records) => {
          if (!records.length) return;
          for (const record of records) {
            dirtyPartyIdsRef.current.add(record.payload.partyId);
          }
          setAutosaveVersion((current) => current + 1);
        })
        .catch(() => {
          setLocalError(
            "Pending cloud accounting changes could not be read for retry.",
          );
        });
    };
    window.addEventListener("online", retryCloudOutbox);
    return () => window.removeEventListener("online", retryCloudOutbox);
  }, [accountingScope, localStore]);

  useEffect(() => {
    const flushPendingRows = () => {
      for (const partyId of dirtyPartyIdsRef.current) {
        void persistRowRef.current(partyId, false);
      }
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushPendingRows();
    };
    window.addEventListener("pagehide", flushPendingRows);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushPendingRows);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [selectedDate, sellerKey]);

  const saveGlobalTdsRate = async () => {
    const tdsRateBps = percentToBasisPoints(tdsPercent);
    if (tdsRateBps === null) {
      setLocalError("Enter a global TDS percentage from 0.00 to 100.00.");
      return;
    }
    setLocalError(null);
    await onUpdateTdsRate(Number(tdsRateBps));
  };
  const selectedSeller = useMemo(
    () => sellers.find((party) => party.id === selectedPartyId) || sellers[0],
    [selectedPartyId, sellers],
  );

  const sellerViewProps = {
    sellers:
      viewMode === "grid" && selectedSeller ? [selectedSeller] : sellers,
    rows,
    savingPartyIds,
    onChange: updateRow,
    onSave: saveRow,
    onSaveTable: async () => {
      const dirtyPartyIds = [...dirtyPartyIdsRef.current];
      for (const partyId of dirtyPartyIds) {
        await persistRowRef.current(partyId, true);
      }
    },
    tdsRateBps: globalTdsRateBps,
  };

  if (!sellers.length) {
    return (
      <section className="rounded-[22px] border border-emerald-100 bg-white p-4 shadow-sm">
        <h4 className="text-sm font-black text-slate-900">
          Daily seller entry
        </h4>
        <p className="mt-2 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-3 text-[10px] leading-relaxed text-slate-600">
          Add a <strong>Seller</strong> in Setup with its fixed ticket rate
          before entering the daily table.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="Daily seller entry">
      <header className="rounded-[22px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-orange-50/50 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
              Private daily entry
            </p>
            <h4 className="mt-1 text-lg font-black text-slate-900">
              Daily seller entry
            </h4>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              Rate comes from the seller profile. Enter commission in each sale
              row; one global TDS rate applies to every seller. Bill reference
              is created by the server when a draft is saved.
            </p>
          </div>
          <span className="rounded-xl bg-emerald-600 p-2.5 text-white">
            <FilePenLine className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Entry date for all sellers
            </span>
            <input
              aria-label="Entry date for all sellers"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className={CONTROL_CLASS}
            />
          </label>
          <label>
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Global TDS on commission (%)
            </span>
            <div className="flex gap-2">
              <input
                aria-label="Global TDS percentage"
                inputMode="decimal"
                value={tdsPercent}
                onChange={(event) => setTdsPercent(event.target.value)}
                className={CONTROL_CLASS}
              />
              <ActionButton
                disabled={savingPartyIds.size > 0}
                onClick={() => void saveGlobalTdsRate()}
              >
                Save TDS
              </ActionButton>
            </div>
          </label>
        </div>
        <p className="mt-2 text-[9px] text-slate-500">
          {dateCaption(selectedDate)} · Global TDS is currently{" "}
          <strong>{formatPercentFromBasisPoints(globalTdsRateBps)}</strong>.
          A number replaces the old value as soon as you type it. Autosave keeps
          the latest draft; a saved posted row is corrected safely before the
          replacement draft is stored.
        </p>
      </header>

      <div
        className="flex gap-2 overflow-x-auto pb-1"
        aria-label="Daily entry view"
      >
        <ActionButton
          onClick={() => setViewMode("grid")}
          tone={viewMode === "grid" ? "save" : "plain"}
        >
          <Grid2X2 className="h-3.5 w-3.5" /> Grid view
        </ActionButton>
        <ActionButton
          onClick={() => setViewMode("table")}
          tone={viewMode === "table" ? "save" : "plain"}
        >
          <List className="h-3.5 w-3.5" /> Table view
        </ActionButton>
      </div>

      <label className="block rounded-[22px] border border-emerald-100 bg-white p-3 shadow-sm">
        <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Seller</span>
        <select aria-label="Seller" value={selectedPartyId} onChange={(event) => setSelectedPartyId(event.target.value)} className={CONTROL_CLASS}>
          {sellers.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
        </select>
        <span className="mt-1 block text-[8px] text-slate-500">
          Grid shows only this seller. Table view can show every seller for the selected date.
        </span>
      </label>

      {localError && (
        <p
          role="alert"
          className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-[10px] text-orange-800"
        >
          {localError}
        </p>
      )}

      {viewMode === "grid" ? (
        <DailySellerGrid {...sellerViewProps} />
      ) : (
        <DailySellerTable {...sellerViewProps} />
      )}

      <DailyTotals
        title={`Daily saved total · ${dateCaption(selectedDate)}`}
        calculations={liveSellerCalculations}
        payments={dailyPayments}
      />
    </section>
  );
}

interface SellerRowsProps {
  sellers: LotteryParty[];
  rows: Record<string, DailySellerRow>;
  savingPartyIds: ReadonlySet<string>;
  tdsRateBps: number;
  onChange: (
    partyId: string,
    field: keyof DailySellerRow,
    value: string,
  ) => void;
  onSave: (party: LotteryParty) => Promise<void>;
  onSaveTable: () => Promise<void>;
}

type SellerQuantityProps = {
  party: LotteryParty;
  row: DailySellerRow;
  field: keyof Pick<
    DailySellerRow,
    | "dispatchQuantity"
    | "morningReturnQuantity"
    | "dayReturnQuantity"
    | "eveningReturnQuantity"
  >;
  label: string;
  onChange: SellerRowsProps["onChange"];
};

function SaveTableButton({
  busy,
  onSaveTable,
}: Readonly<{
  busy: boolean;
  onSaveTable: () => Promise<void>;
}>) {
  return (
    <ActionButton
      disabled={busy}
      onClick={() => void onSaveTable()}
      tone="save"
    >
      <FilePenLine className="h-3 w-3" /> Save table
    </ActionButton>
  );
}

function DailySellerTable({
  sellers,
  rows,
  savingPartyIds,
  tdsRateBps,
  onChange,
  onSaveTable,
}: Readonly<SellerRowsProps>) {
  const rowCalculations = sellers.map((party) => ({
    party,
    row: rows[party.id] || blankRow(party.id),
  }));
  const totals = {
    dispatch: sumValues(
      rowCalculations.map(
        ({ party, row }) => calculateRow(row, party, tdsRateBps).dispatch,
      ),
    ),
    morningReturn: sumValues(
      rowCalculations.map(
        ({ party, row }) => calculateRow(row, party, tdsRateBps).morningReturn,
      ),
    ),
    dayReturn: sumValues(
      rowCalculations.map(
        ({ party, row }) => calculateRow(row, party, tdsRateBps).dayReturn,
      ),
    ),
    eveningReturn: sumValues(
      rowCalculations.map(
        ({ party, row }) => calculateRow(row, party, tdsRateBps).eveningReturn,
      ),
    ),
    totalReturn: sumValues(
      rowCalculations.map(
        ({ party, row }) => calculateRow(row, party, tdsRateBps).totalReturn,
      ),
    ),
    netSale: sumValues(
      rowCalculations.map(({ party, row }) =>
        calculateRow(row, party, tdsRateBps).netSale,
      ),
    ),
    grossAmountPaise: sumValues(
      rowCalculations.map(
        ({ party, row }) => calculateRow(row, party, tdsRateBps).grossAmountPaise,
      ),
    ),
    commissionPaise: sumValues(
      rowCalculations.map(
        ({ party, row }) => calculateRow(row, party, tdsRateBps).commissionPaise,
      ),
    ),
    partyPayablePaise: sumValues(
      rowCalculations.map(
        ({ party, row }) => calculateRow(row, party, tdsRateBps).partyPayablePaise,
      ),
    ),
  };
  return (
    <section className="rounded-[22px] border border-emerald-100 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-xs font-black text-slate-900">Seller table</h5>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[9px] text-slate-500">
            Scroll sideways <ChevronDown className="h-3 w-3 rotate-[-90deg]" />
          </span>
<SaveTableButton busy={savingPartyIds.size > 0} onSaveTable={onSaveTable} />
        </div>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-100">
        <table className="min-w-[1370px] border-collapse text-left text-[10px]">
          <thead className="bg-emerald-50 text-[8px] uppercase tracking-wide text-slate-600">
            <tr>
              {[
                "Party",
                "Dispatch",
                "Morning return",
                "Day return",
                "Evening return",
                "Total return",
                "Net sale",
                "Net amount",
                "Commission",
                "Party payable",
                "Bill status",
              ].map((label) => (
                <th
                  key={label}
                  className="border-b border-emerald-100 px-2 py-2 font-black"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowCalculations.map(({ party, row }) => {
              const calculation = calculateRow(row, party, tdsRateBps);
              return (
                <tr
                  key={party.id}
                  className="border-b border-slate-100 align-top last:border-0"
                >
                  <td className="min-w-[150px] px-2 py-2">
                    <p className="font-black text-slate-900">{party.name}</p>
                    <p className="mt-1 text-[8px] text-slate-500">
                      Fixed rate {formatPaise(party.ticketRatePaise)} / ticket · Global TDS{" "}
                      {formatPercentFromBasisPoints(tdsRateBps)}
                    </p>
                  </td>
                  <QuantityCell
                    party={party}
                    row={row}
                    field="dispatchQuantity"
                    label="dispatch"
                    onChange={onChange}
                  />
                  <QuantityCell
                    party={party}
                    row={row}
                    field="morningReturnQuantity"
                    label="morning return"
                    onChange={onChange}
                  />
                  <QuantityCell
                    party={party}
                    row={row}
                    field="dayReturnQuantity"
                    label="day return"
                    onChange={onChange}
                  />
                  <QuantityCell
                    party={party}
                    row={row}
                    field="eveningReturnQuantity"
                    label="evening return"
                    onChange={onChange}
                  />
                  <AmountCell
                    value={calculation.totalReturn.toString()}
                    invalid={calculation.hasInvalidReturn}
                  />
                  <AmountCell value={calculation.netSale.toString()} />
                  <AmountCell value={formatPaise(calculation.grossAmountPaise)} />
                  <CommissionCell
                    party={party}
                    row={row}
                    onChange={onChange}
                    invalid={calculation.hasInvalidCommission}
                  />
                  <AmountCell value={formatPaise(calculation.partyPayablePaise)} />
                  <td className="min-w-[130px] px-2 py-2">
                    <p className="mb-1 text-[8px] font-bold text-slate-500">
                      {row.reference || "Auto bill on save"}
                    </p>
                    <p className="text-[8px] font-bold text-emerald-800">{row.status || "Draft"}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-emerald-50/70 font-black text-slate-800">
            <tr>
              <td className="px-2 py-2">Current table total</td>
              <td className="px-2 py-2">{totals.dispatch.toString()}</td>
              <td className="px-2 py-2">{totals.morningReturn.toString()}</td>
              <td className="px-2 py-2">{totals.dayReturn.toString()}</td>
              <td className="px-2 py-2">{totals.eveningReturn.toString()}</td>
              <td className="px-2 py-2">{totals.totalReturn.toString()}</td>
              <td className="px-2 py-2">{totals.netSale.toString()}</td>
              <td className="px-2 py-2">{formatPaise(totals.grossAmountPaise)}</td>
              <td className="px-2 py-2">{formatPaise(totals.commissionPaise)}</td>
              <td className="px-2 py-2">{formatPaise(totals.partyPayablePaise)}</td>
              <td className="px-2 py-2">Draft values</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function QuantityCell({
  party,
  row,
  field,
  label,
  onChange,
}: Readonly<SellerQuantityProps>) {
  return (
    <td className="min-w-[112px] px-2 py-2">
      <SellerQuantityInput
        party={party}
        row={row}
        field={field}
        label={label}
        onChange={onChange}
      />
    </td>
  );
}

function AmountCell({
  value,
  invalid = false,
}: Readonly<{ value: string; invalid?: boolean }>) {
  return (
    <td
      className={`min-w-[95px] px-2 py-2 font-bold ${invalid ? "text-orange-700" : "text-slate-700"}`}
    >
      {invalid ? "Return exceeds dispatch" : value}
    </td>
  );
}

function SellerCommissionInput({
  party,
  row,
  onChange,
}: Readonly<{
  party: LotteryParty;
  row: DailySellerRow;
  onChange: SellerRowsProps["onChange"];
}>) {
  return (
    <input
      aria-label={`${party.name} commission amount`}
      inputMode="decimal"
      value={row.commissionRupees}
      onChange={(event) =>
        onChange(
          party.id,
          "commissionRupees",
          event.target.value.replace(/[^\d.]/g, ""),
        )
      }
      onFocus={selectAllInputText}
      onBlur={(event) => {
        if (!event.target.value.trim()) {
          onChange(party.id, "commissionRupees", "0");
        }
      }}
      className={CONTROL_CLASS}
    />
  );
}

function CommissionCell({
  party,
  row,
  onChange,
  invalid,
}: Readonly<{
  party: LotteryParty;
  row: DailySellerRow;
  onChange: SellerRowsProps["onChange"];
  invalid: boolean;
}>) {
  return (
    <td className="min-w-[112px] px-2 py-2">
      <SellerCommissionInput party={party} row={row} onChange={onChange} />
      {invalid && (
        <p className="mt-1 text-[8px] font-bold text-orange-700">Too high</p>
      )}
    </td>
  );
}

function DailySellerGrid({
  sellers,
  rows,
  savingPartyIds,
  tdsRateBps,
  onChange,
  onSave,
  onSaveTable,
}: Readonly<SellerRowsProps>) {
  return (
    <section className="space-y-3" aria-label="Seller grid">
      <div className="flex items-center justify-between gap-2 px-1">
        <h5 className="text-xs font-black text-slate-900">Seller grid</h5>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-500">
            {sellers.length} seller{sellers.length === 1 ? "" : "s"}
          </span>
<SaveTableButton busy={savingPartyIds.size > 0} onSaveTable={onSaveTable} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {sellers.map((party) => {
          const row = rows[party.id] || blankRow(party.id);
          const calculation = calculateRow(row, party, tdsRateBps);
          return (
            <article
              key={party.id}
              className="rounded-[22px] border border-emerald-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h6 className="text-sm font-black text-slate-900">
                    {party.name}
                  </h6>
                  <p className="mt-1 text-[9px] leading-relaxed text-slate-500">
                    Fixed rate {formatPaise(party.ticketRatePaise)} · Global TDS{" "}
                    {formatPercentFromBasisPoints(tdsRateBps)} on commission
                  </p>
                </div>
                <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[8px] font-bold text-emerald-800">
                  {row.reference || "Auto bill"}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <GridQuantity
                  party={party}
                  row={row}
                  field="dispatchQuantity"
                  label="Dispatch"
                  onChange={onChange}
                />
                <GridCommission
                  party={party}
                  row={row}
                  onChange={onChange}
                  invalid={calculation.hasInvalidCommission}
                />
                <GridQuantity
                  party={party}
                  row={row}
                  field="morningReturnQuantity"
                  label="Morning return"
                  onChange={onChange}
                />
                <GridQuantity
                  party={party}
                  row={row}
                  field="dayReturnQuantity"
                  label="Day return"
                  onChange={onChange}
                />
                <GridQuantity
                  party={party}
                  row={row}
                  field="eveningReturnQuantity"
                  label="Evening return"
                  onChange={onChange}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <GridMetric
                  label="Total return"
                  value={calculation.totalReturn.toString()}
                  invalid={calculation.hasInvalidReturn}
                />
                <GridMetric
                  label="Net sale"
                  value={calculation.netSale.toString()}
                />
                <GridMetric
                  label="Net amount"
                  value={formatPaise(calculation.grossAmountPaise)}
                />
                <GridMetric
                  label="Commission"
                  value={formatPaise(calculation.commissionPaise)}
                />
                <GridMetric
                  label="TDS on commission"
                  value={formatPaise(calculation.tdsPaise)}
                />
                <GridMetric
                  label="Party payable"
                  value={formatPaise(calculation.partyPayablePaise)}
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[8px] font-bold text-emerald-800">
                  {savingPartyIds.has(party.id)
                    ? "Saving"
                    : row.status || "Draft"}
                </span>
                <ActionButton
                  disabled={savingPartyIds.has(party.id)}
                  onClick={() => void onSave(party)}
                  tone="save"
                >
                  <FilePenLine className="h-3 w-3" /> Save row
                </ActionButton>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function GridQuantity({
  party,
  row,
  field,
  label,
  onChange,
}: Readonly<SellerQuantityProps>) {
  return (
    <label>
      <span className="mb-1 block text-[8px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <SellerQuantityInput
        party={party}
        row={row}
        field={field}
        label={label.toLowerCase()}
        onChange={onChange}
      />
    </label>
  );
}

function GridCommission({
  party,
  row,
  onChange,
  invalid,
}: Readonly<{
  party: LotteryParty;
  row: DailySellerRow;
  onChange: SellerRowsProps["onChange"];
  invalid: boolean;
}>) {
  return (
    <label>
      <span className="mb-1 block text-[8px] font-bold uppercase tracking-wide text-slate-500">
        Commission (₹)
      </span>
      <SellerCommissionInput party={party} row={row} onChange={onChange} />
      {invalid && (
        <span className="mt-1 block text-[8px] font-bold text-orange-700">
          Cannot exceed net amount
        </span>
      )}
    </label>
  );
}

function GridMetric({
  label,
  value,
  invalid = false,
}: Readonly<{ label: string; value: string; invalid?: boolean }>) {
  return (
    <div
      className={`rounded-xl border p-2 ${invalid ? "border-orange-100 bg-orange-50" : "border-emerald-100 bg-emerald-50/45"}`}
    >
      <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-[11px] font-black ${invalid ? "text-orange-700" : "text-slate-900"}`}
      >
        {invalid ? "Check returns" : value}
      </p>
    </div>
  );
}

function SellerQuantityInput({
  party,
  row,
  field,
  label,
  onChange,
}: Readonly<SellerQuantityProps>) {
  return (
    <input
      aria-label={`${party.name} ${label}`}
      inputMode="numeric"
      value={row[field]}
      onChange={(event) =>
        onChange(party.id, field, event.target.value.replace(/\D/g, ""))
      }
      onFocus={selectAllInputText}
      onBlur={(event) => {
        if (!event.target.value.trim()) {
          onChange(party.id, field, "0");
        }
      }}
      className={CONTROL_CLASS}
    />
  );
}
