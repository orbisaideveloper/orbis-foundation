import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FilePenLine } from "lucide-react";
import {
  formatPaise,
  formatPercentFromBasisPoints,
  rupeesToPaise,
} from "../../models/lotteryAccountingMoney";
import type {
  LotteryDailyStockistEntryIdentity,
  LotteryParty,
  LotteryWorkspace,
} from "../../models/lotteryAccountingTypes";

type StockistRow = {
  partyId: string;
  purchaseQuantity: string;
  morningReturnQuantity: string;
  dayReturnQuantity: string;
  eveningReturnQuantity: string;
  commissionRupees: string;
  saved?: boolean;
};

const CONTROL_CLASS =
  "w-full rounded-lg border border-emerald-100 bg-white px-2 py-2 text-[11px] text-slate-800 outline-none focus:border-emerald-500";

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function dateKey(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function naturalNumber(value: string) {
  return /^\d+$/.test(value) ? BigInt(value) : 0n;
}

function paiseToRupeesInput(value: bigint) {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

function blankRow(partyId: string): StockistRow {
  return {
    partyId,
    purchaseQuantity: "0",
    morningReturnQuantity: "0",
    dayReturnQuantity: "0",
    eveningReturnQuantity: "0",
    commissionRupees: "0",
  };
}

function rowIsZero(row: StockistRow) {
  return [
    row.purchaseQuantity,
    row.morningReturnQuantity,
    row.dayReturnQuantity,
    row.eveningReturnQuantity,
    row.commissionRupees,
  ].every((value) => !value.trim() || /^0+(?:\.0+)?$/.test(value.trim()));
}

function calculateRow(row: StockistRow, party: LotteryParty, tdsRateBps: number) {
  const purchase = naturalNumber(row.purchaseQuantity);
  const morningReturn = naturalNumber(row.morningReturnQuantity);
  const dayReturn = naturalNumber(row.dayReturnQuantity);
  const eveningReturn = naturalNumber(row.eveningReturnQuantity);
  const totalReturn = morningReturn + dayReturn + eveningReturn;
  const netPurchase = purchase - totalReturn;
  const rate = BigInt(party.ticketRatePaise || "0");
  const grossAmount = netPurchase * rate;
  const commission = BigInt(rupeesToPaise(row.commissionRupees) || "0");
  const commissionLimit = grossAmount > 0n ? grossAmount : 0n;
  const invalidCommission = commission > commissionLimit;
  const tds = invalidCommission
    ? 0n
    : (commission * BigInt(tdsRateBps) + 5_000n) / 10_000n;
  const payable = invalidCommission ? 0n : grossAmount - commission + tds;
  return {
    purchase,
    morningReturn,
    dayReturn,
    eveningReturn,
    totalReturn,
    netPurchase,
    grossAmount,
    commission,
    tds,
    payable,
    invalidCommission,
  };
}

function buildRows(
  workspace: LotteryWorkspace,
  stockists: LotteryParty[],
  selectedDate: string,
) {
  return Object.fromEntries(
    stockists.map((party) => {
      const entry = workspace.stockistEntries.find(
        (item) =>
          item.partyId === party.id && dateKey(item.occurredAt) === selectedDate,
      );
      return [
        party.id,
        entry
          ? {
              partyId: party.id,
              purchaseQuantity: entry.purchaseQuantity,
              morningReturnQuantity: entry.morningReturnQuantity,
              dayReturnQuantity: entry.dayReturnQuantity,
              eveningReturnQuantity: entry.eveningReturnQuantity,
              commissionRupees: paiseToRupeesInput(BigInt(entry.commissionPaise)),
              saved: true,
            }
          : blankRow(party.id),
      ];
    }),
  ) as Record<string, StockistRow>;
}

function pendingKey(organizationId: string, partyId: string, day: string) {
  return `orbis.accounting.pending-stockist-row.${organizationId}.${partyId}.${day}`;
}

function readPending(organizationId: string, partyId: string, day: string) {
  try {
    const value = window.localStorage.getItem(pendingKey(organizationId, partyId, day));
    return value ? (JSON.parse(value) as StockistRow) : null;
  } catch {
    return null;
  }
}

function storePending(
  organizationId: string,
  partyId: string,
  day: string,
  row: StockistRow,
) {
  try {
    window.localStorage.setItem(
      pendingKey(organizationId, partyId, day),
      JSON.stringify(row),
    );
  } catch {
    // Autosave remains available when browser storage is blocked.
  }
}

function clearPending(organizationId: string, partyId: string, day: string) {
  try {
    window.localStorage.removeItem(pendingKey(organizationId, partyId, day));
  } catch {
    // The saved database row is already authoritative.
  }
}

function currentReturnBalance(workspace: LotteryWorkspace) {
  const sellerReturns = [...workspace.sales, ...workspace.draftSales].reduce(
    (total, sale) => total + BigInt(sale.returnQuantity),
    0n,
  );
  return workspace.stockistEntries.reduce(
    (total, entry) => total - BigInt(entry.totalReturnQuantity),
    sellerReturns,
  );
}

function selectedSessionBalance(
  workspace: LotteryWorkspace,
  selectedDate: string,
  session: "MORNING" | "DAY" | "EVENING",
) {
  const saleField = {
    MORNING: "morningReturnQuantity",
    DAY: "dayReturnQuantity",
    EVENING: "eveningReturnQuantity",
  }[session] as
    | "morningReturnQuantity"
    | "dayReturnQuantity"
    | "eveningReturnQuantity";
  const sellerReturn = [...workspace.sales, ...workspace.draftSales]
    .filter((sale) => dateKey(sale.occurredAt) === selectedDate)
    .reduce((total, sale) => total + BigInt(sale[saleField]), 0n);
  const field = {
    MORNING: "morningReturnQuantity",
    DAY: "dayReturnQuantity",
    EVENING: "eveningReturnQuantity",
  }[session] as
    | "morningReturnQuantity"
    | "dayReturnQuantity"
    | "eveningReturnQuantity";
  const stockistReturn = workspace.stockistEntries
    .filter((entry) => dateKey(entry.occurredAt) === selectedDate)
    .reduce((total, entry) => total + BigInt(entry[field]), 0n);
  return { sellerReturn, stockistReturn, waiting: sellerReturn - stockistReturn };
}

function sumValues(values: Iterable<bigint>) {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

type Props = {
  organizationId: string;
  workspace: LotteryWorkspace;
  onSave: (
    payload: Record<string, unknown>,
  ) => Promise<LotteryDailyStockistEntryIdentity | null>;
};

function stockistEntryPayload({
  organizationId,
  party,
  row,
  occurredAt,
  tdsRateBps,
}: {
  organizationId: string;
  party: LotteryParty;
  row: StockistRow;
  occurredAt: string;
  tdsRateBps: number;
}) {
  const integerFields = [
    row.purchaseQuantity,
    row.morningReturnQuantity,
    row.dayReturnQuantity,
    row.eveningReturnQuantity,
  ];
  if (integerFields.some((value) => !/^\d+$/.test(value))) {
    throw new Error("Purchase and return must be whole numbers.");
  }
  const calculation = calculateRow(row, party, tdsRateBps);
  const commissionPaise = rupeesToPaise(row.commissionRupees);
  if (!commissionPaise || calculation.invalidCommission) {
    throw new Error("Commission cannot be greater than the net purchase amount.");
  }
  if (BigInt(party.ticketRatePaise || "0") <= 0n) {
    throw new Error(`Set the fixed rate for ${party.name} first.`);
  }
  return {
    organizationId,
    partyId: party.id,
    occurredAt,
    purchaseQuantity: row.purchaseQuantity,
    morningReturnQuantity: row.morningReturnQuantity,
    dayReturnQuantity: row.dayReturnQuantity,
    eveningReturnQuantity: row.eveningReturnQuantity,
    commissionPaise,
  };
}

function savableStockistRow(
  partyId: string,
  savingPartyIds: ReadonlySet<string>,
  stockists: LotteryParty[],
  rows: Record<string, StockistRow>,
) {
  if (savingPartyIds.has(partyId)) return null;
  const party = stockists.find((item) => item.id === partyId);
  const row = rows[partyId];
  if (!party || !row || (rowIsZero(row) && !row.saved)) return null;
  return { party, row };
}

export function DailyStockistEntry({
  organizationId,
  workspace,
  onSave,
}: Readonly<Props>) {
  const [selectedDate, setSelectedDate] = useState(todayInputValue());
  const stockists = useMemo(
    () =>
      workspace.parties.filter(
        (party) =>
          party.partyType === "STOCKIST" || party.partyType === "SERVICE_STOCKIST",
      ),
    [workspace.parties],
  );
  const [rows, setRows] = useState<Record<string, StockistRow>>({});
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const [localError, setLocalError] = useState<string | null>(null);
  const [autosaveVersion, setAutosaveVersion] = useState(0);
  const rowsRef = useRef(rows);
  const stockistsRef = useRef(stockists);
  const workspaceRef = useRef(workspace);
  const dateRef = useRef(selectedDate);
  const dirtyRef = useRef(new Set<string>());
  const savingRef = useRef(new Set<string>());
  const versionsRef = useRef(new Map<string, number>());
  const savedRowsRef = useRef(new Map<string, Record<string, StockistRow>>());
  const onSaveRef = useRef(onSave);
  const stockistKey = stockists
    .map((party) => `${party.id}:${party.name}:${party.ticketRatePaise}`)
    .join("|");

  rowsRef.current = rows;
  stockistsRef.current = stockists;
  workspaceRef.current = workspace;
  dateRef.current = selectedDate;
  onSaveRef.current = onSave;

  useEffect(() => {
    const next = {
      ...buildRows(workspaceRef.current, stockistsRef.current, selectedDate),
      ...(savedRowsRef.current.get(selectedDate) || {}),
    };
    const recovered = stockistsRef.current.flatMap((party) => {
      const pending = readPending(organizationId, party.id, selectedDate);
      if (!pending) return [];
      next[party.id] = { ...next[party.id], ...pending, partyId: party.id };
      return [party.id];
    });
    setRows(next);
    dirtyRef.current = new Set(recovered);
    versionsRef.current = new Map(recovered.map((partyId) => [partyId, 1]));
    if (recovered.length) setAutosaveVersion((version) => version + 1);
  }, [organizationId, selectedDate, stockistKey]);

  if (!stockists.length) {
    return (
      <section className="rounded-[22px] border border-emerald-100 bg-white p-4 shadow-sm">
        <h4 className="text-sm font-black text-slate-900">Daily purchase and return</h4>
        <p className="mt-2 text-[10px] text-slate-600">
          Add a Stockist in Setup with its fixed ticket rate first.
        </p>
      </section>
    );
  }

  const updateRow = (partyId: string, field: keyof StockistRow, value: string) => {
    const next = { ...(rowsRef.current[partyId] || blankRow(partyId)), [field]: value };
    storePending(organizationId, partyId, selectedDate, next);
    setRows((current) => ({ ...current, [partyId]: next }));
    dirtyRef.current.add(partyId);
    versionsRef.current.set(partyId, (versionsRef.current.get(partyId) || 0) + 1);
    setAutosaveVersion((version) => version + 1);
  };

  const setPartySaving = (partyId: string, active: boolean) => {
    if (active) savingRef.current.add(partyId);
    else savingRef.current.delete(partyId);
    setSaving(new Set(savingRef.current));
  };

  const showPersistError = (show: boolean, error: unknown) => {
    if (!show) return;
    setLocalError(error instanceof Error ? error.message : "Entry could not be saved.");
  };

  const finishSavedRow = (
    partyId: string,
    row: StockistRow,
    day: string,
    version: number,
  ) => {
    if (dateRef.current !== day || versionsRef.current.get(partyId) !== version) {
      setAutosaveVersion((current) => current + 1);
      return;
    }
    const latest = { ...row, saved: !rowIsZero(row) };
    const dayRows = savedRowsRef.current.get(day) || {};
    savedRowsRef.current.set(day, { ...dayRows, [partyId]: latest });
    setRows((current) => ({ ...current, [partyId]: latest }));
    clearPending(organizationId, partyId, day);
    dirtyRef.current.delete(partyId);
  };

  const persistRow = async (partyId: string, showValidation: boolean) => {
    const candidate = savableStockistRow(
      partyId,
      savingRef.current,
      stockistsRef.current,
      rowsRef.current,
    );
    if (!candidate) return;
    const { party, row } = candidate;
    const day = dateRef.current;
    const version = versionsRef.current.get(partyId) || 0;
    let payload: Record<string, unknown>;
    try {
      payload = stockistEntryPayload({
        organizationId,
        party,
        row,
        occurredAt: day,
        tdsRateBps: workspaceRef.current.organization.tdsRateBps ?? 200,
      });
    } catch (error) {
      showPersistError(showValidation, error);
      return;
    }
    setPartySaving(partyId, true);
    try {
      const saved = await onSaveRef.current(payload);
      if (!saved) {
        showPersistError(showValidation, new Error("The stockist row could not be saved."));
        return;
      }
      finishSavedRow(partyId, row, day, version);
    } catch (error) {
      showPersistError(showValidation, error);
    } finally {
      setPartySaving(partyId, false);
      if (dirtyRef.current.has(partyId)) setAutosaveVersion((current) => current + 1);
    }
  };
  const persistRef = useRef(persistRow);
  persistRef.current = persistRow;

  useEffect(() => {
    if (!autosaveVersion) return undefined;
    const timer = window.setTimeout(() => {
      for (const partyId of dirtyRef.current) void persistRef.current(partyId, false);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [autosaveVersion, selectedDate, stockistKey]);

  useEffect(() => {
    const flush = () => {
      for (const partyId of dirtyRef.current) void persistRef.current(partyId, false);
    };
    const flushHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushHidden);
    };
  }, [selectedDate, stockistKey]);

  const calculations = stockists.map((party) => ({
    party,
    row: rows[party.id] || blankRow(party.id),
    calculation: calculateRow(
      rows[party.id] || blankRow(party.id),
      party,
      workspace.organization.tdsRateBps ?? 200,
    ),
  }));
  const totals = {
    purchase: sumValues(calculations.map(({ calculation }) => calculation.purchase)),
    morning: sumValues(calculations.map(({ calculation }) => calculation.morningReturn)),
    day: sumValues(calculations.map(({ calculation }) => calculation.dayReturn)),
    evening: sumValues(calculations.map(({ calculation }) => calculation.eveningReturn)),
    returned: sumValues(calculations.map(({ calculation }) => calculation.totalReturn)),
    net: sumValues(calculations.map(({ calculation }) => calculation.netPurchase)),
    payable: sumValues(calculations.map(({ calculation }) => calculation.payable)),
  };
  const availableReturns = currentReturnBalance(workspace);
  const sessions = (["MORNING", "DAY", "EVENING"] as const).map((session) => ({
    session,
    ...selectedSessionBalance(workspace, selectedDate, session),
  }));

  const saveTable = async () => {
    setLocalError(null);
    for (const party of stockistsRef.current) {
      const row = rowsRef.current[party.id];
      if (row && (!rowIsZero(row) || row.saved)) {
        await persistRef.current(party.id, true);
      }
    }
  };

  return (
    <section className="space-y-3" aria-label="Daily stockist entry">
      <header className="rounded-[22px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-orange-50/50 p-4 shadow-sm">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
          Simple purchase entry
        </p>
        <h4 className="mt-1 text-lg font-black text-slate-900">Daily purchase and stockist return</h4>
        <p className="mt-1 text-[10px] text-slate-600">
          Purchase adds stock. Morning, day and evening return sends seller-returned tickets back to the stockist. The latest saved row replaces the old row for the same date.
        </p>
        <label className="mt-3 block max-w-xs">
          <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500">Entry date for all stockists</span>
          <input
            aria-label="Entry date for all stockists"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className={CONTROL_CLASS}
          />
        </label>
        <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
          <p className="text-[9px] font-bold uppercase text-orange-700">Return waiting now</p>
          <p className="mt-1 text-lg font-black text-orange-900">{availableReturns.toString()} tickets</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {sessions.map(({ session, sellerReturn, stockistReturn, waiting }) => (
              <div key={session} className="rounded-lg bg-white/70 p-2 text-[8px] text-orange-900">
                <p className="font-black">{session === "MORNING" ? "Morning" : session === "DAY" ? "Day" : "Evening"}</p>
                <p>Seller {sellerReturn.toString()}</p>
                <p>Sent {stockistReturn.toString()}</p>
                <p className="font-black">Left {waiting.toString()}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      {localError && (
        <p role="alert" className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-[10px] text-orange-800">
          {localError}
        </p>
      )}

      <section className="rounded-[22px] border border-emerald-100 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h5 className="text-xs font-black text-slate-900">Stockist grid</h5>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[9px] text-slate-500">Scroll sideways <ChevronDown className="h-3 w-3 rotate-[-90deg]" /></span>
            <button
              type="button"
              disabled={saving.size > 0}
              onClick={() => void saveTable()}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[9px] font-bold text-white disabled:opacity-50"
            >
              <FilePenLine className="h-3 w-3" /> Save table
            </button>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-100">
          <table className="min-w-[1260px] border-collapse text-left text-[10px]">
            <thead className="bg-emerald-50 text-[8px] uppercase tracking-wide text-slate-600">
              <tr>
                {["Stockist", "Purchase", "Morning return", "Day return", "Evening return", "Total return", "Net purchase", "Amount", "Commission", "Payable change", "Status"].map((label) => (
                  <th key={label} className="border-b border-emerald-100 px-2 py-2 font-black">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calculations.map(({ party, row, calculation }) => (
                <tr key={party.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="min-w-[150px] px-2 py-2">
                    <p className="font-black text-slate-900">{party.name}</p>
                    <p className="mt-1 text-[8px] text-slate-500">Rate {formatPaise(party.ticketRatePaise)} · TDS {formatPercentFromBasisPoints(workspace.organization.tdsRateBps ?? 200)}</p>
                  </td>
                  {([
                    ["purchaseQuantity", "purchase"],
                    ["morningReturnQuantity", "morning return"],
                    ["dayReturnQuantity", "day return"],
                    ["eveningReturnQuantity", "evening return"],
                  ] as const).map(([field, label]) => (
                    <td key={field} className="min-w-[120px] px-2 py-2">
                      <input
                        aria-label={`${party.name} ${label}`}
                        inputMode="numeric"
                        value={row[field]}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => updateRow(party.id, field, event.target.value)}
                        className={CONTROL_CLASS}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-3 font-black">{calculation.totalReturn.toString()}</td>
                  <td className="px-2 py-3 font-black">{calculation.netPurchase.toString()}</td>
                  <td className="px-2 py-3">{formatPaise(calculation.grossAmount)}</td>
                  <td className="min-w-[130px] px-2 py-2">
                    <input
                      aria-label={`${party.name} commission amount`}
                      inputMode="decimal"
                      value={row.commissionRupees}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) => updateRow(party.id, "commissionRupees", event.target.value)}
                      className={CONTROL_CLASS}
                    />
                  </td>
                  <td className="px-2 py-3 font-black">{formatPaise(calculation.payable)}</td>
                  <td className="px-2 py-3 text-[8px] font-bold text-emerald-700">{saving.has(party.id) ? "Saving" : row.saved ? "Saved" : "Not entered"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-black text-slate-900">
              <tr>
                <td className="px-2 py-2">Total</td>
                <td className="px-2 py-2">{totals.purchase.toString()}</td>
                <td className="px-2 py-2">{totals.morning.toString()}</td>
                <td className="px-2 py-2">{totals.day.toString()}</td>
                <td className="px-2 py-2">{totals.evening.toString()}</td>
                <td className="px-2 py-2">{totals.returned.toString()}</td>
                <td className="px-2 py-2">{totals.net.toString()}</td>
                <td colSpan={2} />
                <td className="px-2 py-2">{formatPaise(totals.payable)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </section>
  );
}
