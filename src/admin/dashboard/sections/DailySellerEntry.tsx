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
import type {
  LotteryDraftSale,
  LotteryDailySellerDraftIdentity,
  LotteryParty,
  LotterySale,
  LotteryWorkspace,
} from "../../models/lotteryAccountingTypes";

type DailyViewMode = "table" | "grid";

type DailySellerRow = {
  saleId?: string;
  partyId: string;
  reference?: string;
  status?: "DRAFT" | "POSTED";
  dispatchQuantity: string;
  morningReturnQuantity: string;
  dayReturnQuantity: string;
  eveningReturnQuantity: string;
  commissionRupees: string;
};

type SaleLike = LotterySale | LotteryDraftSale;

const CONTROL_CLASS =
  "w-full rounded-lg border border-emerald-100 bg-white px-2 py-2 text-[11px] text-slate-800 outline-none focus:border-emerald-500";

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

function naturalNumber(value: string) {
  return /^\d+$/.test(value) ? BigInt(value) : 0n;
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

function roundedBasisPoints(amount: bigint, rateBps: number) {
  return (amount * BigInt(rateBps) + 5_000n) / 10_000n;
}

function calculateRow(
  row: DailySellerRow,
  party: LotteryParty,
  tdsRateBps: number,
) {
  const dispatch = naturalNumber(row.dispatchQuantity);
  const morningReturn = naturalNumber(row.morningReturnQuantity);
  const dayReturn = naturalNumber(row.dayReturnQuantity);
  const eveningReturn = naturalNumber(row.eveningReturnQuantity);
  const totalReturn = morningReturn + dayReturn + eveningReturn;
  const hasInvalidReturn = totalReturn > dispatch;
  const netSale = hasInvalidReturn ? 0n : dispatch - totalReturn;
  const rate = BigInt(party.ticketRatePaise || "0");
  const grossAmount = netSale * rate;
  const commission = BigInt(rupeesToPaise(row.commissionRupees) || "0");
  const hasInvalidCommission = commission > grossAmount;
  const tds = hasInvalidCommission
    ? 0n
    : roundedBasisPoints(commission, tdsRateBps);
  const partyPayable = hasInvalidCommission
    ? 0n
    : grossAmount - commission + tds;
  return {
    dispatch,
    morningReturn,
    dayReturn,
    eveningReturn,
    totalReturn,
    netSale,
    grossAmount,
    commission,
    tds,
    partyPayable,
    hasInvalidReturn,
    hasInvalidCommission,
  };
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
  sales,
  payments,
}: Readonly<{
  title: string;
  sales: Array<LotterySale | LotteryDraftSale>;
  payments: LotteryWorkspace["payments"];
}>) {
  const totals = useMemo(() => {
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
      dispatch: sumValues(sales.map((sale) => BigInt(sale.dispatchQuantity))),
      morningReturn: sumValues(
        sales.map((sale) => BigInt(sale.morningReturnQuantity)),
      ),
      dayReturn: sumValues(sales.map((sale) => BigInt(sale.dayReturnQuantity))),
      eveningReturn: sumValues(
        sales.map((sale) => BigInt(sale.eveningReturnQuantity)),
      ),
      totalReturn: sumValues(sales.map((sale) => BigInt(sale.returnQuantity))),
      netSale: sumValues(sales.map((sale) => BigInt(sale.netTickets))),
      grossAmount: sumValues(sales.map((sale) => BigInt(sale.grossSalesPaise))),
      partyPayable: sumValues(
        sales.map((sale) => BigInt(sale.netPayablePaise)),
      ),
      paymentTotal: sumValues(
        payments
          .filter((payment) => payment.direction === "RECEIPT")
          .map((payment) => BigInt(payment.totalAmountPaise)),
      ),
      methodTotals,
    };
  }, [payments, sales]);
  const items = [
    ["Dispatch", totals.dispatch.toString()],
    ["Morning return", totals.morningReturn.toString()],
    ["Day return", totals.dayReturn.toString()],
    ["Evening return", totals.eveningReturn.toString()],
    ["Total return", totals.totalReturn.toString()],
    ["Net sale", totals.netSale.toString()],
    ["Net amount", formatPaise(totals.grossAmount)],
    ["Party payable", formatPaise(totals.partyPayable)],
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
    const currentWorkspace = workspaceRef.current;
    const nextRows = buildRows({
      parties: sellersRef.current,
      sales: currentWorkspace.sales,
      drafts: currentWorkspace.draftSales,
      selectedDate,
    });
    const recoveredPartyIds = sellersRef.current.flatMap((party) => {
      const pending = readPendingRow(organizationId, party.id, selectedDate);
      if (!pending) return [];
      nextRows[party.id] = { ...nextRows[party.id], ...pending, partyId: party.id };
      return [party.id];
    });
    setRows(nextRows);
    dirtyPartyIdsRef.current = new Set(recoveredPartyIds);
    rowVersionsRef.current = new Map(
      recoveredPartyIds.map((partyId) => [partyId, 1]),
    );
    if (recoveredPartyIds.length) {
      setAutosaveVersion((current) => current + 1);
    }
  }, [organizationId, selectedDate, sellerKey]);

  useEffect(() => {
    if (!selectedPartyId && sellers[0]) setSelectedPartyId(sellers[0].id);
  }, [selectedPartyId, sellerKey, sellers]);

  useEffect(() => {
    if (!editRequest) return;
    setSelectedDate(editRequest.occurredAt.slice(0, 10));
    setSelectedPartyId(editRequest.partyId);
  }, [editRequest]);

  const postedSales = useMemo(
    () =>
      workspace.sales.filter((sale) =>
        isSameEntryDate(sale.occurredAt, selectedDate),
      ),
    [selectedDate, workspace.sales],
  );
  const savedSales = useMemo(
    () => [
      ...postedSales,
      ...workspace.draftSales.filter((sale) =>
        isSameEntryDate(sale.occurredAt, selectedDate),
      ),
    ],
    [postedSales, selectedDate, workspace.draftSales],
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
  ) => {
    const payload = entryPayload(party, row);
    if (!row.saleId) return actions.onSaveDraft(payload);
    if (row.status !== "POSTED") {
      return actions.onUpdateDraft(row.saleId, payload);
    }
    const replacement = await actions.onCorrectPosted(row.saleId);
    return replacement
      ? actions.onUpdateDraft(replacement.id, payload)
      : null;
  };

  const finishSavingRow = (
    partyId: string,
    entryDate: string,
    versionAtStart: number,
    saved: LotteryDailySellerDraftIdentity | null,
  ) => {
    if (
      currentDateRef.current !== selectedDate ||
      rowVersionsRef.current.get(partyId) !== versionAtStart
    ) {
      setAutosaveVersion((current) => current + 1);
      return;
    }
    if (saved) {
      setRows((current) => ({
        ...current,
        [partyId]: {
          ...(current[partyId] || blankRow(partyId)),
          saleId: saved.id,
          reference: saved.reference,
          status: "DRAFT",
        },
      }));
      clearPendingRow(organizationId, partyId, entryDate);
    }
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
      rowVersionsRef.current.get(partyId) === versionAtStart;
    if (!deleted || !isCurrentRow) return;
    setRows((current) => ({
      ...current,
      [partyId]: blankRow(partyId),
    }));
    clearPendingRow(organizationId, partyId, entryDate);
    dirtyPartyIdsRef.current.delete(partyId);
  };

  const persistRow = async (partyId: string, showValidation: boolean) => {
    if (savingPartyIdsRef.current.has(partyId)) return;
    const party = sellersRef.current.find((item) => item.id === partyId);
    const row = rowsRef.current[partyId];
    if (!party || !row) return;
    const entryDate = currentDateRef.current;
    const versionAtStart = rowVersionsRef.current.get(partyId) || 0;
    const actions = actionsRef.current;
    setPartySaving(partyId, true);
    try {
      if (rowIsZero(row)) {
        const deleted = await deleteZeroSellerRow(row, actions);
        finishDeletingRow(partyId, entryDate, versionAtStart, deleted);
        return;
      }

      const saved = await saveSellerRow(party, row, actions);
      if (!saved && showValidation) {
        setLocalError("The seller entry could not be saved. Please try again.");
        return;
      }
      finishSavingRow(partyId, entryDate, versionAtStart, saved);
    } catch (error) {
      if (showValidation) {
        setLocalError(
          error instanceof Error ? error.message : "Entry could not be saved.",
        );
      }
    } finally {
      setPartySaving(partyId, false);
      if (dirtyPartyIdsRef.current.has(partyId)) {
        setAutosaveVersion((current) => current + 1);
      }
    }
  };

  const persistRowRef = useRef(persistRow);
  persistRowRef.current = persistRow;

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
  const orderedSellers = useMemo(() => {
    if (!selectedPartyId) return sellers;
    const selected = sellers.find((party) => party.id === selectedPartyId);
    if (!selected) return sellers;
    return [selected, ...sellers.filter((party) => party.id !== selectedPartyId)];
  }, [selectedPartyId, sellers]);

  const sellerViewProps = {
    sellers: orderedSellers,
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
        <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Focus seller (optional)</span>
        <select aria-label="Seller" value={selectedPartyId} onChange={(event) => setSelectedPartyId(event.target.value)} className={CONTROL_CLASS}>
          {sellers.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
        </select>
        <span className="mt-1 block text-[8px] text-slate-500">
          All sellers remain visible. This only moves the selected seller to the first position.
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
        sales={savedSales}
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
    grossAmount: sumValues(
      rowCalculations.map(
        ({ party, row }) => calculateRow(row, party, tdsRateBps).grossAmount,
      ),
    ),
    commission: sumValues(
      rowCalculations.map(
        ({ party, row }) => calculateRow(row, party, tdsRateBps).commission,
      ),
    ),
    partyPayable: sumValues(
      rowCalculations.map(
        ({ party, row }) => calculateRow(row, party, tdsRateBps).partyPayable,
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
                  <AmountCell value={formatPaise(calculation.grossAmount)} />
                  <CommissionCell
                    party={party}
                    row={row}
                    onChange={onChange}
                    invalid={calculation.hasInvalidCommission}
                  />
                  <AmountCell value={formatPaise(calculation.partyPayable)} />
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
              <td className="px-2 py-2">{formatPaise(totals.grossAmount)}</td>
              <td className="px-2 py-2">{formatPaise(totals.commission)}</td>
              <td className="px-2 py-2">{formatPaise(totals.partyPayable)}</td>
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
                  value={formatPaise(calculation.grossAmount)}
                />
                <GridMetric
                  label="Commission"
                  value={formatPaise(calculation.commission)}
                />
                <GridMetric
                  label="TDS on commission"
                  value={formatPaise(calculation.tds)}
                />
                <GridMetric
                  label="Party payable"
                  value={formatPaise(calculation.partyPayable)}
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
