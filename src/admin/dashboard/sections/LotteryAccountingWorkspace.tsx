import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { DailySellerEntry } from "./DailySellerEntry";
import { DailyStockistEntry } from "./DailyStockistEntry";
import { WorkspaceSectionTabs } from "./WorkspaceSectionTabs";
import {
  lotteryAccountingClient,
  type LotteryAccountingClient,
} from "../../models/lotteryAccountingClient";
import {
  formatPaise,
  rupeesToPaise,
  sumPaise,
} from "../../models/lotteryAccountingMoney";
import {
  pickMobileContact,
  supportsMobileContactPicker,
} from "../../models/mobileContactPicker";
import type {
  LotteryOrganization,
  LotteryPartyType,
  LotteryWorkspace,
} from "../../models/lotteryAccountingTypes";

type WorkspaceTab =
  | "dashboard"
  | "setup"
  | "seller"
  | "entry"
  | "statements"
  | "analysis";
type EntryKind = "payment" | "settlement";
type DailyOperation = "SALE" | "PURCHASE";

const WORKSPACE_TABS: Array<[WorkspaceTab, string]> = [
  ["dashboard", "Dashboard"],
  ["setup", "Setup"],
  ["seller", "Daily entry"],
  ["entry", "Payment"],
  ["statements", "Ledger"],
  ["analysis", "AI analysis"],
];

const ENTRY_KINDS: Array<[EntryKind, string]> = [
  ["payment", "Payment"],
  ["settlement", "Settlement"],
];

const PARTY_TYPES: Array<[LotteryPartyType, string]> = [
  ["SELLER", "Seller"],
  ["STOCKIST", "Stockist"],
  ["SERVICE_STOCKIST", "Service stockist"],
  ["CUSTOMER", "Customer"],
];

const PAYMENT_METHODS = [
  ["cashPaise", "Cash"],
  ["bankPaise", "Bank"],
  ["upiPaise", "UPI"],
  ["chequePaise", "Cheque"],
  ["pwtPaise", "PWT"],
] as const;

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function currentFinancialYearStart() {
  const today = new Date();
  return today.getUTCMonth() >= 3
    ? today.getUTCFullYear()
    : today.getUTCFullYear() - 1;
}

function financialYearLabel(startYear: string) {
  const start = Number(startYear);
  return Number.isInteger(start)
    ? `FY${String(start).slice(-2)}-${String(start + 1).slice(-2)}`
    : "Financial year";
}

function isFinancialYearPeriod(
  period: LotteryWorkspace["periods"][number],
) {
  return /^FY\d{2}-\d{2}$/.test(period.label);
}

function paiseToRupeesInput(value: string) {
  const paise = BigInt(value);
  return `${paise / 100n}.${(paise % 100n).toString().padStart(2, "0")}`;
}

function friendlyError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The Accounting workspace could not be updated.";
}

function friendlyEvent(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function WorkspaceCard({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-[22px] border border-emerald-100 bg-white/90 p-4 shadow-sm">
      <h4 className="text-sm font-black text-slate-900">{title}</h4>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyState({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-3 text-[10px] leading-relaxed text-slate-600">
      {children}
    </p>
  );
}

function Metric({
  label,
  value,
  tone = "emerald",
}: Readonly<{ label: string; value: string; tone?: "emerald" | "orange" }>) {
  return (
    <div
      className={`rounded-xl border p-3 ${tone === "emerald" ? "border-emerald-100 bg-emerald-50/45" : "border-orange-100 bg-orange-50/50"}`}
    >
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function Label({
  htmlFor,
  children,
}: Readonly<{ htmlFor: string; children: React.ReactNode }>) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-slate-500"
    >
      {children}
    </label>
  );
}

const CONTROL_CLASS =
  "w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none placeholder:text-slate-300 focus:border-emerald-500";

function InlineError({ message }: Readonly<{ message: string | null }>) {
  if (!message) return null;
  return (
    <p className="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-2.5 text-[9px] text-orange-800">
      {message}
    </p>
  );
}

function SubmitButton({
  children,
  busy,
  className = "",
}: Readonly<{
  children: React.ReactNode;
  busy?: boolean;
  className?: string;
}>) {
  return (
    <button
      type="submit"
      disabled={busy}
      className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

interface LotteryAccountingWorkspaceProps {
  api?: LotteryAccountingClient;
}

export function LotteryAccountingWorkspace({
  api = lotteryAccountingClient,
}: Readonly<LotteryAccountingWorkspaceProps>) {
  const [organizations, setOrganizations] = useState<LotteryOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [workspace, setWorkspace] = useState<LotteryWorkspace | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("dashboard");
  const [entryKind, setEntryKind] = useState<EntryKind>("payment");
  const [dailyOperation, setDailyOperation] = useState<DailyOperation>("SALE");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dailyRefreshTimerRef = useRef<number | null>(null);

  const refreshWorkspace = useCallback(
    async (nextOrganizationId = organizationId) => {
      if (!nextOrganizationId) {
        setWorkspace(null);
        return;
      }
      setIsRefreshing(true);
      try {
        setWorkspace(await api.loadWorkspace(nextOrganizationId));
      } catch (loadError) {
        setError(friendlyError(loadError));
      } finally {
        setIsRefreshing(false);
      }
    },
    [api, organizationId],
  );

  const refreshOrganizations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextOrganizations = await api.listOrganizations();
      setOrganizations(nextOrganizations);
      setOrganizationId((current) => {
        if (
          nextOrganizations.some((organization) => organization.id === current)
        ) {
          return current;
        }
        return nextOrganizations[0]?.id || "";
      });
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const scheduleDailyWorkspaceRefresh = useCallback(() => {
    if (dailyRefreshTimerRef.current !== null) {
      window.clearTimeout(dailyRefreshTimerRef.current);
    }
    dailyRefreshTimerRef.current = window.setTimeout(() => {
      dailyRefreshTimerRef.current = null;
      void refreshWorkspace();
    }, 1_200);
  }, [refreshWorkspace]);

  useEffect(
    () => () => {
      if (dailyRefreshTimerRef.current !== null) {
        window.clearTimeout(dailyRefreshTimerRef.current);
      }
    },
    [],
  );

  const runDailyDraftAction = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | null> => {
      setError(null);
      try {
        const result = await action();
        scheduleDailyWorkspaceRefresh();
        return result;
      } catch (actionError) {
        setError(friendlyError(actionError));
        return null;
      }
    },
    [scheduleDailyWorkspaceRefresh],
  );

  useEffect(() => {
    void refreshOrganizations();
  }, [refreshOrganizations]);

  useEffect(() => {
    if (!organizationId) {
      setWorkspace(null);
      if (!isLoading) {
        setTab("setup");
      }
      return;
    }
    void refreshWorkspace(organizationId);
  }, [isLoading, organizationId, refreshWorkspace]);

  const runAction = async (
    key: string,
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    setWorkingAction(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successMessage);
      await refreshWorkspace();
      return true;
    } catch (actionError) {
      setError(friendlyError(actionError));
      return false;
    } finally {
      setWorkingAction(null);
    }
  };

  const createOrganization = async (name: string) => {
    setWorkingAction("organization");
    setError(null);
    setNotice(null);
    try {
      const created = await api.createOrganization({ name });
      const nextOrganizations = await api.listOrganizations();
      setOrganizations(nextOrganizations);
      setOrganizationId(created.id);
      setNotice("Accounting workspace created. Add a party and period next.");
      setTab("setup");
      return true;
    } catch (actionError) {
      setError(friendlyError(actionError));
      return false;
    } finally {
      setWorkingAction(null);
    }
  };

  const selectedOrganization = useMemo(
    () =>
      organizations.find((organization) => organization.id === organizationId),
    [organizations, organizationId],
  );

  if (isLoading) {
    return (
      <WorkspaceCard title="Lottery Accounting">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading private
          accounting workspace…
        </p>
      </WorkspaceCard>
    );
  }

  return (
    <section
      className="space-y-3"
      aria-label="Lottery Accounting data workspace"
    >
      <header className="rounded-[22px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-orange-50/50 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
              Private Admin workspace
            </p>
            <h4 className="mt-1 text-lg font-black text-slate-900">
              Lottery Accounting
            </h4>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              Record what you bought, what you gave, what came back and what
              you paid or received.
            </p>
          </div>
          <span className="rounded-xl bg-emerald-600 p-2.5 text-white">
            <WalletCards className="h-5 w-5" />
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <select
            aria-label="Accounting organization"
            value={organizationId}
            onChange={(event) => {
              setError(null);
              setNotice(null);
              setOrganizationId(event.target.value);
            }}
            className={`${CONTROL_CLASS} flex-1 py-2 text-[10px]`}
          >
            <option value="">Create an organization first</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Refresh accounting workspace"
            onClick={() => void refreshWorkspace()}
            disabled={!organizationId || isRefreshing}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-white text-emerald-700 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </header>

      {notice && (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[10px] text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-[10px] text-orange-800"
        >
          {error}
        </p>
      )}

      <WorkspaceSectionTabs
        ariaLabel="Accounting workspace sections"
        tabs={WORKSPACE_TABS}
        activeTab={tab}
        onSelect={setTab}
      />

      {!selectedOrganization || !workspace ? (
        <SetupPanel
          workspace={null}
          onCreateOrganization={createOrganization}
          onCreateParty={() => Promise.resolve(false)}
          onUpdatePartyProfile={() => Promise.resolve(false)}
          onUpdateUserLedgerStorage={() => Promise.resolve(false)}
          onCreateFinancialYearPeriod={() => Promise.resolve(false)}
          workingAction={workingAction}
          organizationId=""
        />
      ) : (
        <>
          {tab === "dashboard" && <DashboardPanel workspace={workspace} />}
          {tab === "setup" && (
            <SetupPanel
              workspace={workspace}
              organizationId={organizationId}
              onCreateOrganization={createOrganization}
              onCreateParty={(payload) =>
                runAction(
                  "party",
                  () => api.createParty(payload),
                  "Party saved in the private accounting workspace.",
                )
              }
              onUpdatePartyProfile={(payload) =>
                runAction(
                  "party-profile",
                  () => api.updatePartyProfile(payload),
                  "Seller fixed rate updated.",
                )
              }
              onUpdateUserLedgerStorage={(userLedgerStorage) =>
                runAction(
                  "user-ledger-storage",
                  () =>
                    api.updateUserLedgerStorage({
                      organizationId,
                      userLedgerStorage,
                    }),
                  "Future user ledger storage policy saved. Party directory remains private in the database.",
                )
              }
              onCreateFinancialYearPeriod={(payload) =>
                runAction(
                  "financial-year",
                  () => api.createFinancialYearPeriod(payload),
                  "Financial year created or selected.",
                )
              }
              workingAction={workingAction}
            />
          )}
          {tab === "seller" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-emerald-100 bg-white p-2">
                {(["SALE", "PURCHASE"] as const).map((operation) => <button key={operation} type="button" onClick={() => setDailyOperation(operation)} className={`rounded-lg px-3 py-2 text-[10px] font-bold ${dailyOperation === operation ? "bg-emerald-600 text-white" : "text-slate-600"}`}>{operation === "SALE" ? "Seller sale" : "Stockist purchase"}</button>)}
              </div>
              {dailyOperation === "SALE" ? <DailySellerEntry
              organizationId={organizationId}
              workspace={workspace}
              onSaveDraft={(payload) =>
                runDailyDraftAction(() => api.saveDailySellerDraft(payload))
              }
              onUpdateDraft={(saleId, payload) =>
                runDailyDraftAction(() =>
                  api.updateDailySellerDraft(saleId, payload),
                )
              }
              onDeleteDraft={(saleId) =>
                runDailyDraftAction(async () => {
                  await api.deleteDailySellerDraft(saleId, { organizationId });
                  return true;
                }).then(Boolean)
              }
              onCorrectPosted={(saleId) =>
                runDailyDraftAction(() =>
                  api.correctPostedSale(saleId, { organizationId }),
                )
              }
              onUpdateTdsRate={(tdsRateBps) =>
                runAction(
                  "global-tds-rate",
                  () =>
                    api.updateOrganizationTdsRate({
                      organizationId,
                      tdsRateBps,
                    }),
                  "Global TDS rate updated for new and draft seller entries.",
                )
              }
              /> : <DailyStockistEntry
                organizationId={organizationId}
                workspace={workspace}
                onSave={(payload) =>
                  runDailyDraftAction(() => api.saveDailyStockistEntry(payload))
                }
              />}
            </div>
          )}
          {tab === "entry" && (
            <EntryPanel
              workspace={workspace}
              organizationId={organizationId}
              entryKind={entryKind}
              setEntryKind={setEntryKind}
              workingAction={workingAction}
              onPayment={(payload) =>
                runAction(
                  "payment",
                  () => api.recordPayment(payload),
                  "Payment posted with its method split.",
                )
              }
              onSettlement={(payload) =>
                runAction(
                  "settlement",
                  () => api.recordSettlement(payload),
                  "Receipt settled against the selected sale.",
                )
              }
            />
          )}
          {tab === "statements" && <StatementPanel workspace={workspace} />}
          {tab === "analysis" && <AnalysisPanel workspace={workspace} />}
        </>
      )}
    </section>
  );
}

function DashboardPanel({
  workspace,
}: Readonly<{ workspace: LotteryWorkspace }>) {
  const [range, setRange] = useState<"today" | "yesterday" | "week" | "custom">("today");
  const [partyFilter, setPartyFilter] = useState<"ALL" | LotteryPartyType>("ALL");
  const [customFrom, setCustomFrom] = useState(todayInputValue());
  const [customTo, setCustomTo] = useState(todayInputValue());
  const bounds = useMemo(() => {
    const today = new Date(`${todayInputValue()}T00:00:00Z`);
    if (range === "today") return { from: today, to: new Date(today.getTime() + 86_400_000) };
    if (range === "yesterday") return { from: new Date(today.getTime() - 86_400_000), to: today };
    if (range === "week") return { from: new Date(today.getTime() - 6 * 86_400_000), to: new Date(today.getTime() + 86_400_000) };
    return {
      from: new Date(`${customFrom || todayInputValue()}T00:00:00Z`),
      to: new Date(`${customTo || customFrom || todayInputValue()}T00:00:00Z`).getTime() >= new Date(`${customFrom || todayInputValue()}T00:00:00Z`).getTime()
        ? new Date(new Date(`${customTo || customFrom || todayInputValue()}T00:00:00Z`).getTime() + 86_400_000)
        : new Date(`${customFrom || todayInputValue()}T00:00:00Z`),
    };
  }, [customFrom, customTo, range]);
  const allowedPartyIds = useMemo(
    () => new Set(workspace.parties.filter((party) => partyFilter === "ALL" || party.partyType === partyFilter).map((party) => party.id)),
    [partyFilter, workspace.parties],
  );
  const inRange = (occurredAt: string) => {
    const date = new Date(occurredAt);
    return date >= bounds.from && date < bounds.to;
  };
  const visibleSales = workspace.sales.filter((sale) => inRange(sale.occurredAt) && allowedPartyIds.has(sale.partyId));
  const visibleDraftSales = workspace.draftSales.filter((sale) => inRange(sale.occurredAt) && allowedPartyIds.has(sale.partyId));
  const visiblePayments = workspace.payments.filter((payment) => inRange(payment.occurredAt) && allowedPartyIds.has(payment.partyId));
  const visibleStock = workspace.stockMovements.filter((movement) => inRange(movement.occurredAt) && (!movement.partyId || allowedPartyIds.has(movement.partyId)));
  const visibleStockistEntries = workspace.stockistEntries.filter(
    (entry) => inRange(entry.occurredAt) && allowedPartyIds.has(entry.partyId),
  );
  const sum = (values: Iterable<string | number | bigint>) => {
    let total = 0n;
    for (const value of values) total += BigInt(value);
    return total;
  };
  const grossSales = sum([...visibleSales, ...visibleDraftSales].map((sale) => sale.grossSalesPaise));
  const dispatch = sum([...visibleSales, ...visibleDraftSales].map((sale) => sale.dispatchQuantity));
  const returns = sum([...visibleSales, ...visibleDraftSales].map((sale) => sale.returnQuantity));
  const received = sum(visiblePayments.filter((payment) => payment.direction === "RECEIPT").map((payment) => payment.totalAmountPaise));
  const outgoing = sum(visiblePayments.filter((payment) => payment.direction === "PAYMENT").map((payment) => payment.totalAmountPaise));
  const expenses = sum(visiblePayments.filter((payment) => payment.direction === "EXPENSE").map((payment) => payment.totalAmountPaise));
  const purchase = sum(
    [
      ...visibleStockistEntries.map((entry) => entry.purchaseQuantity),
      ...visibleStock
        .filter(
          (movement) =>
            movement.movementType === "RECEIPT" && !movement.partyId,
        )
        .map((movement) => movement.quantity),
    ],
  );
  const returnedToStockist = sum(
    visibleStockistEntries.map((entry) => entry.totalReturnQuantity),
  );
  const netSold = dispatch - returns;
  const salesAtRangeEnd = [...workspace.sales, ...workspace.draftSales].filter(
    (sale) => new Date(sale.occurredAt) < bounds.to,
  );
  const stockAtRangeEnd = workspace.stockMovements.filter(
    (movement) => new Date(movement.occurredAt) < bounds.to,
  );
  const stockistEntriesAtRangeEnd = workspace.stockistEntries.filter(
    (entry) => new Date(entry.occurredAt) < bounds.to,
  );
  const purchasedAtRangeEnd = sum(
    [
      ...stockistEntriesAtRangeEnd.map((entry) => entry.purchaseQuantity),
      ...stockAtRangeEnd
        .filter(
          (movement) =>
            movement.movementType === "RECEIPT" && !movement.partyId,
        )
        .map((movement) => movement.quantity),
    ],
  );
  const dispatchedAtRangeEnd = sum(
    salesAtRangeEnd.map((sale) => sale.dispatchQuantity),
  );
  const sellerReturnsAtRangeEnd = sum(
    salesAtRangeEnd.map((sale) => sale.returnQuantity),
  );
  const stockistReturnsAtRangeEnd = sum(
    stockistEntriesAtRangeEnd.map((entry) => entry.totalReturnQuantity),
  );
  const adjustmentAtRangeEnd = sum(
    stockAtRangeEnd
      .filter((movement) => movement.movementType === "ADJUSTMENT")
      .map((movement) => movement.quantity),
  );
  const newStockInHand =
    purchasedAtRangeEnd - dispatchedAtRangeEnd + adjustmentAtRangeEnd;
  const returnWaiting = sellerReturnsAtRangeEnd - stockistReturnsAtRangeEnd;
  const totalStockInHand = newStockInHand + returnWaiting;
  return (
    <div className="space-y-3">
      <WorkspaceCard title={`${workspace.organization.name} dashboard`}>
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Dashboard date filter">
          {(["today", "yesterday", "week", "custom"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setRange(value)} className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-bold ${range === value ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-100 text-slate-600"}`}>
              {{ today: "Today", yesterday: "Yesterday", week: "Last 7 days", custom: "Custom" }[value]}
            </button>
          ))}
        </div>
        {range === "custom" && <div className="mt-2 grid grid-cols-2 gap-2"><input aria-label="Dashboard from date" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className={CONTROL_CLASS} /><input aria-label="Dashboard to date" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className={CONTROL_CLASS} /></div>}
        <select aria-label="Dashboard party filter" value={partyFilter} onChange={(event) => setPartyFilter(event.target.value as "ALL" | LotteryPartyType)} className={`${CONTROL_CLASS} mt-2`}>
          <option value="ALL">All parties</option>
          {PARTY_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Bought" value={purchase.toString()} />
          <Metric label="Given to sellers" value={dispatch.toString()} />
          <Metric label="Seller return" value={returns.toString()} />
          <Metric label="Returned to stockist" value={returnedToStockist.toString()} />
          <Metric label="Net sold" value={netSold.toString()} />
          <Metric label="Sale amount" value={formatPaise(grossSales)} />
          <Metric label="Money received" value={formatPaise(received)} />
          <Metric label="Paid / expense" value={formatPaise(outgoing + expenses)} tone="orange" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Metric label="New stock in hand" value={newStockInHand.toString()} tone={newStockInHand === 0n ? "emerald" : "orange"} />
          <Metric label="Return waiting" value={returnWaiting.toString()} tone={returnWaiting === 0n ? "emerald" : "orange"} />
          <Metric label="Total stock in hand" value={totalStockInHand.toString()} tone={totalStockInHand === 0n ? "emerald" : "orange"} />
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-slate-500">
          These three stock balances are carried forward up to the end of the selected date, so they include earlier dates even when Today has no new entry.
        </p>
        {newStockInHand < 0n && (
          <p className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-[10px] font-bold text-orange-800">
            Purchase mismatch: {(-newStockInHand).toString()} ticket(s) were given to sellers without a matching purchase/opening entry.
          </p>
        )}
        <p className={`mt-3 rounded-xl border p-3 text-[10px] font-bold ${returnWaiting === 0n ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-orange-200 bg-orange-50 text-orange-800"}`}>
          {returnWaiting === 0n
            ? "Seller return is clear: nothing is waiting to go back to a stockist."
            : `${returnWaiting.toString()} returned ticket(s) are still waiting to be sent back to a stockist.`}
        </p>
      </WorkspaceCard>
    </div>
  );
}

function SetupPanel({
  workspace,
  organizationId,
  onCreateOrganization,
  onCreateParty,
  onUpdatePartyProfile,
  onUpdateUserLedgerStorage,
  onCreateFinancialYearPeriod,
  workingAction,
}: Readonly<{
  workspace: LotteryWorkspace | null;
  organizationId: string;
  onCreateOrganization: (name: string) => Promise<boolean>;
  onCreateParty: (payload: Record<string, unknown>) => Promise<boolean>;
  onUpdatePartyProfile: (payload: Record<string, unknown>) => Promise<boolean>;
  onUpdateUserLedgerStorage: (
    storage: "CLOUD" | "DEVICE",
  ) => Promise<boolean>;
  onCreateFinancialYearPeriod: (
    payload: Record<string, unknown>,
  ) => Promise<boolean>;
  workingAction: string | null;
}>) {
  const [organizationName, setOrganizationName] = useState("");
  const [partyName, setPartyName] = useState("");
  const [partyType, setPartyType] = useState<LotteryPartyType>("SELLER");
  const [phone, setPhone] = useState("");
  const [ticketRate, setTicketRate] = useState("");
  const [profilePartyId, setProfilePartyId] = useState("");
  const [financialYearStart, setFinancialYearStart] = useState(
    String(currentFinancialYearStart()),
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const fixedFinancialYear = workspace?.periods.find(isFinancialYearPeriod);

  const submitOrganization = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!organizationName.trim()) {
      setLocalError("Enter the business name first.");
      return;
    }
    setLocalError(null);
    if (await onCreateOrganization(organizationName.trim())) {
      setOrganizationName("");
    }
  };

  const submitParty = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!partyName.trim()) {
      setLocalError("Enter the party name.");
      return;
    }
    const ticketRatePaise = rupeesToPaise(ticketRate);
    setLocalError(null);
    if (
      await onCreateParty({
        organizationId,
        name: partyName.trim(),
        partyType,
        phone: phone.trim() || undefined,
        ...(ticketRatePaise ? { ticketRatePaise } : {}),
      })
    ) {
      setPartyName("");
      setPhone("");
      setTicketRate("");
    }
  };

  const submitPeriod = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(financialYearStart)) {
      setLocalError("Choose a valid financial year.");
      return;
    }
    setLocalError(null);
    await onCreateFinancialYearPeriod({
      organizationId,
      financialYearStart,
    });
  };

  const submitPartyProfile = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const ticketRatePaise = rupeesToPaise(ticketRate);
    if (!profilePartyId || !ticketRatePaise) {
      setLocalError(
        "Select a party and enter its rate.",
      );
      return;
    }
    setLocalError(null);
    await onUpdatePartyProfile({
      organizationId,
      partyId: profilePartyId,
      ticketRatePaise,
    });
  };

  const selectPhoneContact = async () => {
    try {
      const contact = await pickMobileContact();
      if (!contact) return;
      if (contact.name) setPartyName(contact.name);
      if (contact.phone) setPhone(contact.phone);
    } catch {
      setLocalError("Phone contact could not be read. You can enter it manually.");
    }
  };

  return (
    <div className="space-y-3">
      <WorkspaceCard
        title={
          workspace ? "Setup and master data" : "Create your first workspace"
        }
      >
        <form onSubmit={(event) => void submitOrganization(event)}>
          <Label htmlFor="lottery-organization-name">
            Business / organization name
          </Label>
          <div className="flex gap-2">
            <input
              id="lottery-organization-name"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="Example: ORBiS Lottery Kolkata"
              className={CONTROL_CLASS}
            />
            <SubmitButton
              busy={workingAction === "organization"}
              className="shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Create
            </SubmitButton>
          </div>
        </form>
        {workspace && (
          <p className="mt-3 text-[9px] text-slate-500">
            Current workspace: <strong>{workspace.organization.name}</strong>
          </p>
        )}
        <InlineError message={localError} />
      </WorkspaceCard>

      {workspace && (
        <>
          <WorkspaceCard title="Party profile">
            <form
              className="space-y-3"
              onSubmit={(event) => void submitParty(event)}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="lottery-party-name">Party name</Label>
                  <input
                    id="lottery-party-name"
                    value={partyName}
                    onChange={(event) => setPartyName(event.target.value)}
                    className={CONTROL_CLASS}
                  />
                </div>
                <div>
                  <Label htmlFor="lottery-party-type">Party role</Label>
                  <select
                    id="lottery-party-type"
                    value={partyType}
                    onChange={(event) =>
                      setPartyType(event.target.value as LotteryPartyType)
                    }
                    className={CONTROL_CLASS}
                  >
                    {PARTY_TYPES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="lottery-party-phone">Phone (optional)</Label>
                  <div className="flex gap-2">
                    <input
                      id="lottery-party-phone"
                      inputMode="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className={CONTROL_CLASS}
                    />
                    {supportsMobileContactPicker() && (
                      <button
                        type="button"
                        onClick={() => void selectPhoneContact()}
                        className="rounded-xl border border-emerald-100 px-3 text-[10px] font-bold text-emerald-700"
                      >
                        Contact
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="lottery-party-ticket-rate">
                    Fixed rate (₹, optional)
                  </Label>
                  <input
                    id="lottery-party-ticket-rate"
                    inputMode="decimal"
                    value={ticketRate}
                    onChange={(event) => setTicketRate(event.target.value)}
                    placeholder="10.00"
                    className={CONTROL_CLASS}
                  />
                </div>
              </div>
              <SubmitButton busy={workingAction === "party"}>
                Save party
              </SubmitButton>
            </form>
            <p className="mt-3 text-[10px] text-slate-500">Saved parties remain in this profile. Select one below only when you need to review or change its rate.</p>
            <form
              className="space-y-3"
              onSubmit={(event) => void submitPartyProfile(event)}
            >
              <div>
                <Label htmlFor="lottery-party-profile">Party</Label>
                <select
                  id="lottery-party-profile"
                  value={profilePartyId}
                  onChange={(event) => {
                    const party = workspace.parties.find(
                      (item) => item.id === event.target.value,
                    );
                    setProfilePartyId(event.target.value);
                    if (party) {
                      setTicketRate(paiseToRupeesInput(party.ticketRatePaise));
                    }
                  }}
                  className={CONTROL_CLASS}
                >
                  <option value="">Select party</option>
                  {workspace.parties.map((party) => (
                      <option key={party.id} value={party.id}>
                        {party.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <Label htmlFor="lottery-profile-ticket-rate">Rate (₹)</Label>
                  <input
                    id="lottery-profile-ticket-rate"
                    inputMode="decimal"
                    value={ticketRate}
                    onChange={(event) => setTicketRate(event.target.value)}
                    className={CONTROL_CLASS}
                  />
                </div>
              </div>
              <p className="text-[9px] leading-relaxed text-slate-500">
                Commission is entered on a sale or stock receipt. Global TDS is
                controlled once for every party in this workspace.
              </p>
              <SubmitButton busy={workingAction === "party-profile"}>
                Save party rate
              </SubmitButton>
            </form>
          </WorkspaceCard>

          <WorkspaceCard title="Future user ledger storage">
            <p className="text-[10px] leading-relaxed text-slate-500">
              Admin accounting stays in the private database. This policy only
              decides the default for a future user app; party name, phone and
              unique code always remain in the private directory.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["CLOUD", "DEVICE"] as const).map((storage) => (
                <button
                  key={storage}
                  type="button"
                  disabled={workingAction === "user-ledger-storage"}
                  onClick={() => void onUpdateUserLedgerStorage(storage)}
                  className={`rounded-xl border p-3 text-left text-[10px] font-bold ${workspace.organization.userLedgerStorage === storage ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-emerald-100 bg-white text-slate-600"}`}
                >
                  {storage === "CLOUD" ? "Database" : "Phone storage"}
                </button>
              ))}
            </div>
          </WorkspaceCard>

          <WorkspaceCard title="Financial year periods">
            {fixedFinancialYear ? (
              <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[10px] leading-relaxed text-emerald-900">
                <strong>Fixed financial year: {fixedFinancialYear.label}</strong>
                <br />
                {displayDate(fixedFinancialYear.startsAt)} – {displayDate(fixedFinancialYear.endsAt)}.
                This workspace keeps the year selected during setup; it will not
                reset or change while you enter current or backdated data.
              </p>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(event) => void submitPeriod(event)}
              >
                <div>
                  <Label htmlFor="lottery-financial-year">Financial year</Label>
                  <select
                    id="lottery-financial-year"
                    value={financialYearStart}
                    onChange={(event) =>
                      setFinancialYearStart(event.target.value)
                    }
                    className={CONTROL_CLASS}
                  >
                    {[
                      currentFinancialYearStart() - 1,
                      currentFinancialYearStart(),
                      currentFinancialYearStart() + 1,
                    ].map((year) => (
                      <option key={year} value={String(year)}>
                        {financialYearLabel(String(year))} · 01 Apr {year} – 31
                        Mar {year + 1}
                      </option>
                    ))}
                  </select>
                </div>
                <SubmitButton busy={workingAction === "financial-year"}>
                  Set financial year
                </SubmitButton>
              </form>
            )}
            <EntityList
              items={workspace.periods.map(
                (period) =>
                  `${period.label} · ${displayDate(period.startsAt)} – ${displayDate(period.endsAt)}`,
              )}
              empty="No accounting period created yet."
            />
          </WorkspaceCard>
        </>
      )}
    </div>
  );
}

function EntityList({
  items,
  empty,
}: Readonly<{ items: string[]; empty: string }>) {
  if (!items.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className="mt-3 space-y-1.5 text-[9px] text-slate-600">
      {items.map((item) => (
        <li key={item} className="rounded-lg bg-slate-50 px-2.5 py-2">
          {item}
        </li>
      ))}
    </ul>
  );
}

function EntryPanel({
  workspace,
  organizationId,
  entryKind,
  setEntryKind,
  workingAction,
  onPayment,
  onSettlement,
}: Readonly<{
  workspace: LotteryWorkspace;
  organizationId: string;
  entryKind: EntryKind;
  setEntryKind: (value: EntryKind) => void;
  workingAction: string | null;
  onPayment: (payload: Record<string, unknown>) => Promise<boolean>;
  onSettlement: (payload: Record<string, unknown>) => Promise<boolean>;
}>) {
  return (
    <div className="space-y-3">
      <WorkspaceCard title="Post a new accounting entry">
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          aria-label="Entry type"
        >
          {ENTRY_KINDS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setEntryKind(value)}
              className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-bold ${entryKind === value ? "bg-emerald-600 text-white" : "border border-emerald-100 bg-white text-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </WorkspaceCard>
      {entryKind === "payment" && (
        <PaymentForm
          organizationId={organizationId}
          workspace={workspace}
          busy={workingAction === "payment"}
          onSubmit={onPayment}
        />
      )}
      {entryKind === "settlement" && (
        <SettlementForm
          organizationId={organizationId}
          workspace={workspace}
          busy={workingAction === "settlement"}
          onSubmit={onSettlement}
        />
      )}
    </div>
  );
}

type AccountingFormProps = {
  organizationId: string;
  workspace: LotteryWorkspace;
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<boolean>;
};

function PaymentForm({
  organizationId,
  workspace,
  busy,
  onSubmit,
}: Readonly<AccountingFormProps>) {
  const [partyId, setPartyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [direction, setDirection] = useState("RECEIPT");
  const [occurredAt, setOccurredAt] = useState(todayInputValue());
  const [splits, setSplits] = useState<Record<string, string>>({
    cashPaise: "",
    bankPaise: "",
    upiPaise: "",
    chequePaise: "",
    pwtPaise: "",
  });
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Object.fromEntries(
      PAYMENT_METHODS.map(([key]) => [
        key,
        splits[key].trim() ? rupeesToPaise(splits[key]) : "0",
      ]),
    );
    if (!partyId || Object.values(parsed).some((value) => !value)) {
      setError("Select party and enter valid payment amounts.");
      return;
    }
    const totalAmountPaise = sumPaise(Object.values(parsed) as string[]);
    if (totalAmountPaise === "0") {
      setError("Enter at least one payment amount.");
      return;
    }
    setError(null);
    if (
      await onSubmit({
        organizationId,
        partyId,
        periodId: periodId || null,
        direction,
        occurredAt,
        totalAmountPaise,
        methodSplit: parsed,
      })
    ) {
      setSplits({
        cashPaise: "",
        bankPaise: "",
        upiPaise: "",
        chequePaise: "",
        pwtPaise: "",
      });
    }
  };
  const total = useMemo(() => {
    const values = Object.values(splits).map((value) =>
      value.trim() ? rupeesToPaise(value) : "0",
    );
    return values.some((value) => !value) ? null : sumPaise(values as string[]);
  }, [splits]);
  if (!workspace.parties.length)
    return (
      <WorkspaceCard title="Post a payment">
        <EmptyState>
          Create a party in Setup before recording a payment.
        </EmptyState>
      </WorkspaceCard>
    );
  return (
    <WorkspaceCard title="Receipt, payment or expense">
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="lottery-payment-party">Party</Label>
            <select
              id="lottery-payment-party"
              value={partyId}
              onChange={(event) => setPartyId(event.target.value)}
              className={CONTROL_CLASS}
            >
              <option value="">Select party</option>
              {workspace.parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="lottery-payment-direction">Direction</Label>
            <select
              id="lottery-payment-direction"
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
              className={CONTROL_CLASS}
            >
              <option>RECEIPT</option>
              <option>PAYMENT</option>
              <option>EXPENSE</option>
            </select>
          </div>
          <div>
            <Label htmlFor="lottery-payment-period">Period</Label>
            <select
              id="lottery-payment-period"
              value={periodId}
              onChange={(event) => setPeriodId(event.target.value)}
              className={CONTROL_CLASS}
            >
              <option value="">No period</option>
              {workspace.periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="lottery-payment-date">Date</Label>
            <input
              id="lottery-payment-date"
              type="date"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              className={CONTROL_CLASS}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.map(([key, label]) => (
            <div key={key}>
              <Label htmlFor={`lottery-${key}`}>{label} (₹)</Label>
              <input
                id={`lottery-${key}`}
                inputMode="decimal"
                value={splits[key]}
                onChange={(event) =>
                  setSplits((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                className={CONTROL_CLASS}
              />
            </div>
          ))}
        </div>
        <p className="rounded-xl bg-slate-50 p-3 text-[10px] text-slate-600">
          The server creates the payment reference automatically. <br />
          Method split total:{" "}
          <strong>{total ? formatPaise(total) : "Enter valid ₹ values"}</strong>
        </p>
        <InlineError message={error} />
        <SubmitButton busy={busy}>Post payment</SubmitButton>
      </form>
    </WorkspaceCard>
  );
}

function SettlementForm({
  organizationId,
  workspace,
  busy,
  onSubmit,
}: Readonly<AccountingFormProps>) {
  const [saleId, setSaleId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const openSales = workspace.sales.filter(
    (sale) => BigInt(sale.outstandingPaise) > 0n,
  );
  const openPayments = workspace.payments.filter(
    (payment) =>
      payment.direction === "RECEIPT" && BigInt(payment.availablePaise) > 0n,
  );
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountPaise = rupeesToPaise(amount);
    if (!saleId || !paymentId || !amountPaise || amountPaise === "0") {
      setError("Select an open sale, a receipt and a valid amount.");
      return;
    }
    setError(null);
    if (await onSubmit({ organizationId, saleId, paymentId, amountPaise })) {
      setAmount("");
    }
  };
  if (!openSales.length || !openPayments.length)
    return (
      <WorkspaceCard title="Settle a receipt">
        <EmptyState>
          Post at least one outstanding sale and one unallocated receipt before
          settlement.
        </EmptyState>
      </WorkspaceCard>
    );
  return (
    <WorkspaceCard title="Settle receipt against sale">
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <div>
          <Label htmlFor="lottery-settlement-sale">Open sale</Label>
          <select
            id="lottery-settlement-sale"
            value={saleId}
            onChange={(event) => setSaleId(event.target.value)}
            className={CONTROL_CLASS}
          >
            <option value="">Select sale</option>
            {openSales.map((sale) => (
              <option key={sale.id} value={sale.id}>
                {sale.reference} · {sale.partyName} · due{" "}
                {formatPaise(sale.outstandingPaise)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="lottery-settlement-payment">Available receipt</Label>
          <select
            id="lottery-settlement-payment"
            value={paymentId}
            onChange={(event) => setPaymentId(event.target.value)}
            className={CONTROL_CLASS}
          >
            <option value="">Select receipt</option>
            {openPayments.map((payment) => (
              <option key={payment.id} value={payment.id}>
                {payment.reference} · available{" "}
                {formatPaise(payment.availablePaise)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="lottery-settlement-amount">
            Settlement amount (₹)
          </Label>
          <input
            id="lottery-settlement-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={CONTROL_CLASS}
          />
        </div>
        <InlineError message={error} />
        <SubmitButton busy={busy}>Post settlement</SubmitButton>
      </form>
    </WorkspaceCard>
  );
}

type StatementRow = {
  id: string;
  occurredAt: string;
  category: string;
  party: string;
  quantity: string;
  returnQuantity: string;
  netQuantity: string;
  amountPaise: string;
  paymentPaise: string;
  balancePaise: string | null;
};

type DailyStockClearanceRow = {
  day: string;
  purchased: bigint;
  dispatched: bigint;
  returned: bigint;
  stockistReturned: bigint;
  adjustment: bigint;
  newStock: bigint;
  returnWaiting: bigint;
  totalStock: bigint;
};

function inputDateKey(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function occurredDateKey(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function nextInputDate(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function dailyStockClearanceRows(
  workspace: LotteryWorkspace,
  fromDate: string,
  toDate: string,
) {
  const from = inputDateKey(fromDate);
  const to = inputDateKey(toDate);
  if (!from || !to || to < from) return [];

  const earlierMovements = workspace.stockMovements.filter(
    (movement) => occurredDateKey(movement.occurredAt) < from,
  );
  const earlierSales = [...workspace.sales, ...workspace.draftSales].filter(
    (sale) => occurredDateKey(sale.occurredAt) < from,
  );
  const earlierStockistEntries = workspace.stockistEntries.filter(
    (entry) => occurredDateKey(entry.occurredAt) < from,
  );
  let newStock =
    earlierMovements
      .filter(
        (movement) =>
          movement.movementType === "RECEIPT" && !movement.partyId,
      )
      .reduce((total, movement) => total + BigInt(movement.quantity), 0n) -
    earlierSales.reduce(
      (total, sale) => total + BigInt(sale.dispatchQuantity),
      0n,
    ) +
    earlierMovements
      .filter((movement) => movement.movementType === "ADJUSTMENT")
      .reduce((total, movement) => total + BigInt(movement.quantity), 0n) +
    earlierStockistEntries.reduce(
      (total, entry) => total + BigInt(entry.purchaseQuantity),
      0n,
    );
  let returnWaiting =
    earlierSales.reduce(
      (total, sale) => total + BigInt(sale.returnQuantity),
      0n,
    ) -
    earlierStockistEntries.reduce(
      (total, entry) => total + BigInt(entry.totalReturnQuantity),
      0n,
    );
  const rows: DailyStockClearanceRow[] = [];

  for (let day = from; day <= to; day = nextInputDate(day)) {
    const movements = workspace.stockMovements.filter(
      (movement) => occurredDateKey(movement.occurredAt) === day,
    );
    const dayStockistEntries = workspace.stockistEntries.filter(
      (entry) => occurredDateKey(entry.occurredAt) === day,
    );
    const purchased =
      movements
        .filter(
          (movement) =>
            movement.movementType === "RECEIPT" && !movement.partyId,
        )
        .reduce((total, movement) => total + BigInt(movement.quantity), 0n) +
      dayStockistEntries.reduce(
        (total, entry) => total + BigInt(entry.purchaseQuantity),
        0n,
      );
    const daySales = [...workspace.sales, ...workspace.draftSales].filter(
      (sale) => occurredDateKey(sale.occurredAt) === day,
    );
    const dispatched = daySales.reduce(
      (total, sale) => total + BigInt(sale.dispatchQuantity),
      0n,
    );
    const returned = daySales.reduce(
      (total, sale) => total + BigInt(sale.returnQuantity),
      0n,
    );
    const stockistReturned = dayStockistEntries.reduce(
      (total, entry) => total + BigInt(entry.totalReturnQuantity),
      0n,
    );
    const adjustment = movements
      .filter((movement) => movement.movementType === "ADJUSTMENT")
      .reduce((total, movement) => total + BigInt(movement.quantity), 0n);
    newStock += purchased - dispatched + adjustment;
    returnWaiting += returned - stockistReturned;
    rows.push({
      day,
      purchased,
      dispatched,
      returned,
      stockistReturned,
      adjustment,
      newStock,
      returnWaiting,
      totalStock: newStock + returnWaiting,
    });
  }
  return rows;
}

function StatementPanel({
  workspace,
}: Readonly<{ workspace: LotteryWorkspace }>) {
  const [fromDate, setFromDate] = useState(todayInputValue());
  const [toDate, setToDate] = useState(todayInputValue());
  const [partyId, setPartyId] = useState("ALL");
  const from = new Date(`${fromDate}T00:00:00Z`);
  const endCandidate = new Date(`${toDate || fromDate}T00:00:00Z`);
  const to =
    endCandidate >= from
      ? new Date(endCandidate.getTime() + 86_400_000)
      : new Date(from.getTime() + 86_400_000);
  const inRange = (occurredAt: string) => {
    const date = new Date(occurredAt);
    return date >= from && date < to;
  };
  const includesParty = (entryPartyId: string | null) =>
    partyId === "ALL" || entryPartyId === partyId;
  const visibleStock = workspace.stockMovements.filter(
    (movement) => inRange(movement.occurredAt) && includesParty(movement.partyId),
  );
  const visibleStockistEntries = workspace.stockistEntries.filter(
    (entry) => inRange(entry.occurredAt) && includesParty(entry.partyId),
  );
  const visibleSales = [...workspace.sales, ...workspace.draftSales].filter(
    (sale) => inRange(sale.occurredAt) && includesParty(sale.partyId),
  );
  const visiblePayments = workspace.payments.filter(
    (payment) => inRange(payment.occurredAt) && includesParty(payment.partyId),
  );
  const rawRows = [
    ...visibleStockistEntries.map((entry) => ({
      id: `stockist-${entry.id}`,
      occurredAt: entry.occurredAt,
      category: BigInt(entry.purchaseQuantity) > 0n ? "Stockist purchase" : "Stockist return",
      party: entry.partyName,
      quantity: entry.purchaseQuantity,
      returnQuantity: entry.totalReturnQuantity,
      netQuantity: entry.netPurchaseQuantity,
      amountPaise: entry.netPayablePaise,
      paymentPaise: "0",
      balanceEffectPaise: BigInt(entry.netPayablePaise),
    })),
    ...visibleSales.map((sale) => ({
      id: `sale-${sale.id}`,
      occurredAt: sale.occurredAt,
      category: "Seller sale",
      party: sale.partyName,
      quantity: String(sale.dispatchQuantity),
      returnQuantity: String(sale.returnQuantity),
      netQuantity: String(sale.netTickets),
      amountPaise: sale.netPayablePaise,
      paymentPaise: "0",
      balanceEffectPaise: BigInt(sale.netPayablePaise),
    })),
    ...visiblePayments.map((payment) => ({
      id: `payment-${payment.id}`,
      occurredAt: payment.occurredAt,
      category:
        payment.direction === "RECEIPT"
          ? "Money received"
          : payment.direction === "PAYMENT"
            ? "Money paid"
            : "Expense",
      party: payment.partyName,
      quantity: "—",
      returnQuantity: "—",
      netQuantity: "—",
      amountPaise: "0",
      paymentPaise: payment.totalAmountPaise,
      balanceEffectPaise:
        payment.direction === "EXPENSE"
          ? 0n
          : -BigInt(payment.totalAmountPaise),
    })),
  ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  let runningBalance = 0n;
  const rows: StatementRow[] = rawRows.map((row) => {
    runningBalance += row.balanceEffectPaise;
    return {
      ...row,
      balancePaise: partyId === "ALL" ? null : runningBalance.toString(),
    };
  });
  const purchased = visibleStockistEntries.reduce(
    (total, entry) => total + BigInt(entry.purchaseQuantity),
    visibleStock
      .filter(
        (movement) =>
          movement.movementType === "RECEIPT" && !movement.partyId,
      )
      .reduce((total, movement) => total + BigInt(movement.quantity), 0n),
  );
  const dispatched = visibleSales.reduce(
    (total, sale) => total + BigInt(sale.dispatchQuantity),
    0n,
  );
  const returned = visibleSales.reduce(
    (total, sale) => total + BigInt(sale.returnQuantity),
    0n,
  );
  const netSale = visibleSales.reduce(
    (total, sale) => total + BigInt(sale.netTickets),
    0n,
  );
  const grossSales = sumPaise(
    visibleSales.map((sale) => sale.grossSalesPaise),
  );
  const received = sumPaise(
    visiblePayments
      .filter((payment) => payment.direction === "RECEIPT")
      .map((payment) => payment.totalAmountPaise),
  );
  const expenses = sumPaise(
    visiblePayments
      .filter((payment) => payment.direction === "EXPENSE")
      .map((payment) => payment.totalAmountPaise),
  );
  const stockClearanceRows = useMemo(
    () => dailyStockClearanceRows(workspace, fromDate, toDate),
    [fromDate, toDate, workspace],
  );

  return (
    <div className="space-y-3">
      <WorkspaceCard title="Party ledger">
        <p className="text-[10px] leading-relaxed text-slate-600">
          Choose a party and date. Its purchase or sale, return, payment and
          running balance appear together in one day-wise ledger.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label>
            <Label htmlFor="statement-from-date">From date</Label>
            <input
              id="statement-from-date"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className={CONTROL_CLASS}
            />
          </label>
          <label>
            <Label htmlFor="statement-to-date">To date</Label>
            <input
              id="statement-to-date"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className={CONTROL_CLASS}
            />
          </label>
          <label>
            <Label htmlFor="statement-party">Party</Label>
            <select
              id="statement-party"
              value={partyId}
              onChange={(event) => setPartyId(event.target.value)}
              className={CONTROL_CLASS}
            >
              <option value="ALL">All parties</option>
              {workspace.parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name} · {party.partyType.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        </div>
      </WorkspaceCard>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Bought" value={purchased.toString()} />
        <Metric label="Given" value={dispatched.toString()} />
        <Metric label="Returned" value={returned.toString()} />
        <Metric label="Net" value={netSale.toString()} />
        <Metric label="Sale amount" value={formatPaise(grossSales)} />
        <Metric label="Received" value={formatPaise(received)} />
        <Metric label="Expenses" value={formatPaise(expenses)} tone="orange" />
        <Metric
          label="Net cash"
          value={formatPaise(BigInt(received) - BigInt(expenses))}
        />
      </div>

      <WorkspaceCard title="Daily stock check">
        <p className="text-[10px] leading-relaxed text-slate-600">
          New stock and seller-return stock are shown separately. Orange means
          something is still in hand or a purchase entry is missing.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-100">
          <table className="min-w-[820px] border-collapse text-left text-[10px]">
            <thead className="bg-emerald-50 text-[8px] uppercase tracking-wide text-slate-600">
              <tr>
                {[
                  "Date",
                  "Purchase",
                  "Dispatch",
                  "Return",
                  "To stockist",
                  "Adjustment",
                  "New stock",
                  "Return waiting",
                  "Total in hand",
                  "Status",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="border-b border-emerald-100 px-2 py-2 font-black"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stockClearanceRows.map((row) => {
                const clear = row.totalStock === 0n;
                return (
                  <tr
                    key={row.day}
                    className={`border-b border-slate-100 last:border-0 ${clear ? "bg-white" : "bg-orange-50/70"}`}
                  >
                    <td className="px-2 py-2">{displayDate(`${row.day}T00:00:00.000Z`)}</td>
                    <td className="px-2 py-2">
                      {row.purchased === 0n ? "No purchase" : row.purchased.toString()}
                    </td>
                    <td className="px-2 py-2">{row.dispatched.toString()}</td>
                    <td className="px-2 py-2">{row.returned.toString()}</td>
                    <td className="px-2 py-2">{row.stockistReturned.toString()}</td>
                    <td className="px-2 py-2">{row.adjustment.toString()}</td>
                    <td className="px-2 py-2 font-black">{row.newStock.toString()}</td>
                    <td className="px-2 py-2 font-black">{row.returnWaiting.toString()}</td>
                    <td className="px-2 py-2 font-black">{row.totalStock.toString()}</td>
                    <td className="px-2 py-2 font-bold">
                      {clear
                        ? "Clear"
                        : `${row.totalStock.toString()} in hand`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </WorkspaceCard>

      <WorkspaceCard title="Day-wise ledger">
        {rows.length ? (
          <div className="overflow-x-auto rounded-xl border border-emerald-100">
            <table className="min-w-[920px] border-collapse text-left text-[10px]">
              <thead className="bg-emerald-50 text-[8px] uppercase tracking-wide text-slate-600">
                <tr>
                  {[
                    "Date",
                    "Category",
                    "Party",
                    "Bought / given",
                    "Return",
                    "Net",
                    "Amount",
                    "Payment",
                    "Balance",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="border-b border-emerald-100 px-2 py-2 font-black"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-2">{displayDate(row.occurredAt)}</td>
                    <td className="px-2 py-2 capitalize">{row.category}</td>
                    <td className="px-2 py-2 font-bold">{row.party}</td>
                    <td className="px-2 py-2">{row.quantity}</td>
                    <td className="px-2 py-2">{row.returnQuantity}</td>
                    <td className="px-2 py-2">{row.netQuantity}</td>
                    <td className="px-2 py-2">{formatPaise(row.amountPaise)}</td>
                    <td className="px-2 py-2">{formatPaise(row.paymentPaise)}</td>
                    <td className="px-2 py-2 font-black">
                      {row.balancePaise === null ? "Choose one party" : formatPaise(row.balancePaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>No saved accounting row matches this date and party.</EmptyState>
        )}
      </WorkspaceCard>
    </div>
  );
}

function AnalysisPanel({
  workspace,
}: Readonly<{ workspace: LotteryWorkspace }>) {
  const { summary } = workspace;
  return (
    <div className="space-y-3">
      <WorkspaceCard title="Verified accounting AI">
        <p className="text-[10px] leading-relaxed text-slate-600">
          These results use only recalculated, verified private entries. This AI
          cannot write records or search the web.
        </p>
        <div className="mt-3 space-y-2">
          {workspace.insights.map((insight) => (
            <div
              key={insight.skill}
              className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black capitalize text-slate-900">
                  {insight.skill.replace(/-/g, " ")}
                </p>
                <span className="rounded-full bg-white px-2 py-1 text-[8px] font-bold text-emerald-700">
                  {insight.status}
                </span>
              </div>
              {insight.amountPaise && (
                <p className="mt-1 text-sm font-black text-slate-900">
                  {formatPaise(insight.amountPaise)}
                </p>
              )}
              {insight.commissionPaise && (
                <p className="mt-1 text-[9px] text-slate-600">
                  Commission {formatPaise(insight.commissionPaise)} · TDS{" "}
                  {formatPaise(insight.tdsPaise || "0")}
                </p>
              )}
              {insight.findings?.length ? (
                <p className="mt-1 text-[9px] text-orange-700">
                  {insight.findings.map(friendlyEvent).join(", ")}
                </p>
              ) : null}
              <p className="mt-1 text-[8px] text-slate-400">
                From: {insight.sourceFields.join(", ")}
              </p>
            </div>
          ))}
        </div>
      </WorkspaceCard>
      <WorkspaceCard title="Verified totals">
        <div className="grid grid-cols-2 gap-2">
          <Metric
            label="Commission"
            value={formatPaise(summary.commissionPaise)}
          />
          <Metric label="TDS" value={formatPaise(summary.tdsPaise)} />
          <Metric label="Expense" value={formatPaise(summary.expensePaise)} />
          <Metric
            label="Anomalies"
            value={String(summary.anomalies.length)}
            tone={summary.anomalies.length ? "orange" : "emerald"}
          />
        </div>
      </WorkspaceCard>
      <div className="rounded-[22px] border border-orange-100 bg-orange-50 p-4 text-[10px] leading-relaxed text-orange-800">
        <ShieldCheck className="mb-2 h-4 w-4" /> Analysis is read-only. The
        browser never receives direct table permissions; all results come
        through the authenticated Admin server route.
      </div>
    </div>
  );
}
