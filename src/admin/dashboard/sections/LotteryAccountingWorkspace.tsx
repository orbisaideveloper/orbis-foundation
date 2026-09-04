import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, LoaderCircle, RefreshCw, WalletCards } from "lucide-react";
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
} from "../../models/lotteryAccountingMoney";
import type {
  LotteryExpenseCategory,
  LotteryExpenseProfile,
  LotteryParty,
  LotteryPartyType,
  LotteryWorkspace,
} from "../../models/lotteryAccountingTypes";

type WorkspaceTab = "dashboard" | "daily" | "payment" | "ledger" | "ai" | "masters";
type DailyMode = "SELLER" | "STOCKIST" | "CASH_CUSTOMER" | "EXPENSE";
type PartyMasterType = Extract<LotteryPartyType, "SELLER" | "STOCKIST" | "CUSTOMER">;
type PaymentKind = "SELLER" | "STOCKIST" | "CUSTOMER" | "EXPENSE";
type MoneyMethod = "cashPaise" | "bankPaise" | "upiPaise" | "pwtPaise";
type LedgerPeriod = "today" | "7d" | "10d" | "month" | "year" | "custom";
type LedgerBookType =
  | "seller"
  | "customer"
  | "stockist"
  | "sale"
  | "purchase"
  | "return"
  | "commission"
  | "tds"
  | "expense"
  | "payment"
  | "money"
  | "pwt"
  | "stock";

const WORKSPACE_TABS: Array<[WorkspaceTab, string]> = [
  ["dashboard", "Dashboard"],
  ["daily", "Daily entry"],
  ["payment", "Payment"],
  ["ledger", "Ledger"],
  ["ai", "AI"],
  ["masters", "Masters"],
];

const PARTY_PAYMENT_METHODS: Array<[MoneyMethod, string]> = [
  ["cashPaise", "Cash"],
  ["bankPaise", "Bank"],
  ["upiPaise", "UPI"],
  ["pwtPaise", "PWT"],
];

const CONTROL =
  "w-full rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const LIGHT_CARD =
  "rounded-[22px] border border-emerald-100/90 bg-gradient-to-br from-white via-emerald-50/20 to-orange-50/35 p-4 shadow-[0_10px_28px_rgba(15,68,50,0.055)]";
const SOFT_BUTTON =
  "rounded-xl border border-emerald-100 bg-white px-3 py-2 text-[10px] font-bold text-slate-600";
const ACTIVE_BUTTON =
  "rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-100 to-orange-100 px-3 py-2 text-[10px] font-black text-emerald-900";

function businessDateToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateKey(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] || "";
}

function addDays(day: string, days: number) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monthStart(day: string) {
  return `${day.slice(0, 7)}-01`;
}

function yearStart(day: string) {
  return `${day.slice(0, 4)}-01-01`;
}

function periodBounds(
  period: LedgerPeriod,
  customFrom: string,
  customTo: string,
) {
  const today = businessDateToday();
  if (period === "today") return { from: today, to: today };
  if (period === "7d") return { from: addDays(today, -6), to: today };
  if (period === "10d") return { from: addDays(today, -9), to: today };
  if (period === "month") return { from: monthStart(today), to: today };
  if (period === "year") return { from: yearStart(today), to: today };
  const from = customFrom || today;
  const to = customTo && customTo >= from ? customTo : from;
  return { from, to };
}

function inDateRange(value: string, from: string, to: string) {
  const day = dateKey(value);
  return Boolean(day && day >= from && day <= to);
}

function throughDate(value: string, to: string) {
  const day = dateKey(value);
  return Boolean(day && day <= to);
}

function sumBigInt(values: Iterable<string | number | bigint>) {
  let total = 0n;
  for (const value of values) total += BigInt(value);
  return total;
}

function paiseInput(value: bigint) {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

function parseAmount(value: string) {
  const paise = rupeesToPaise(value);
  return paise ? BigInt(paise) : null;
}

function displayDate(value: string) {
  const key = dateKey(value);
  if (!key) return value;
  const parsed = new Date(`${key}T00:00:00.000Z`);
  return parsed.toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function expenseProfileLabel(
  profile: LotteryExpenseProfile,
  categories: LotteryExpenseCategory[],
) {
  const category =
    categories.find((item) => item.id === profile.categoryId)?.name || "Expense";
  return `${category} › ${profile.name}`;
}

function moneyMethodBalances(workspace: LotteryWorkspace, through?: string) {
  const result: Record<MoneyMethod, bigint> = {
    cashPaise: 0n,
    bankPaise: 0n,
    upiPaise: 0n,
    pwtPaise: 0n,
  };
  for (const payment of workspace.payments) {
    if (through && !throughDate(payment.occurredAt, through)) continue;
    const sign = payment.direction === "RECEIPT" ? 1n : -1n;
    for (const [method] of PARTY_PAYMENT_METHODS) {
      result[method] += sign * BigInt(payment.methodSplit[method] || "0");
    }
  }
  for (const payment of workspace.expensePayments) {
    if (through && !throughDate(payment.occurredAt, through)) continue;
    result.cashPaise -= BigInt(payment.cashPaise);
    result.bankPaise -= BigInt(payment.bankPaise);
  }
  return result;
}

function partyPaymentTotal(
  workspace: LotteryWorkspace,
  partyId: string,
  direction: "RECEIPT" | "PAYMENT",
  through: string,
) {
  return workspace.payments
    .filter(
      (payment) =>
        payment.partyId === partyId &&
        payment.direction === direction &&
        throughDate(payment.occurredAt, through),
    )
    .reduce((total, payment) => total + BigInt(payment.totalAmountPaise), 0n);
}

function sellerOutstanding(workspace: LotteryWorkspace, partyId: string, through: string) {
  const due = [...workspace.sales, ...workspace.draftSales]
    .filter((sale) => sale.partyId === partyId && throughDate(sale.occurredAt, through))
    .reduce((total, sale) => total + BigInt(sale.netPayablePaise), 0n);
  return due - partyPaymentTotal(workspace, partyId, "RECEIPT", through);
}

function stockistOutstanding(
  workspace: LotteryWorkspace,
  partyId: string,
  through: string,
) {
  const due = workspace.stockistEntries
    .filter((entry) => entry.partyId === partyId && throughDate(entry.occurredAt, through))
    .reduce((total, entry) => total + BigInt(entry.netPayablePaise), 0n);
  return due - partyPaymentTotal(workspace, partyId, "PAYMENT", through);
}

function customerOutstanding(
  workspace: LotteryWorkspace,
  partyId: string,
  through: string,
) {
  const due = workspace.customerBills
    .filter((bill) => bill.partyId === partyId && throughDate(bill.occurredAt, through))
    .reduce((total, bill) => total + BigInt(bill.amountPaise), 0n);
  return due - partyPaymentTotal(workspace, partyId, "RECEIPT", through);
}

function expenseOutstanding(
  workspace: LotteryWorkspace,
  profileId: string,
  through: string,
) {
  const due = workspace.expenseBills
    .filter((bill) => bill.profileId === profileId && throughDate(bill.occurredAt, through))
    .reduce((total, bill) => total + BigInt(bill.amountPaise), 0n);
  const paid = workspace.expensePayments
    .filter(
      (payment) =>
        payment.profileId === profileId && throughDate(payment.occurredAt, through),
    )
    .reduce((total, payment) => total + BigInt(payment.totalAmountPaise), 0n);
  return due - paid;
}

type PriorityRow = {
  id: string;
  name: string;
  type: "Seller" | "Customer" | "Stockist" | "Expense";
  amountPaise: bigint;
};

function sortPriorityRows(rows: PriorityRow[]) {
  return rows.sort((left, right) =>
    left.amountPaise === right.amountPaise
      ? left.name.localeCompare(right.name)
      : left.amountPaise > right.amountPaise
        ? -1
        : 1,
  );
}

function receivablePriority(workspace: LotteryWorkspace, through: string) {
  const result: PriorityRow[] = [];
  for (const party of workspace.parties) {
    if (party.partyType === "SELLER") {
      const amountPaise = sellerOutstanding(workspace, party.id, through);
      if (amountPaise > 0n)
        result.push({ id: party.id, name: party.name, type: "Seller", amountPaise });
    } else if (party.partyType === "CUSTOMER") {
      const amountPaise = customerOutstanding(workspace, party.id, through);
      if (amountPaise > 0n)
        result.push({ id: party.id, name: party.name, type: "Customer", amountPaise });
    }
  }
  return sortPriorityRows(result);
}

function payablePriority(workspace: LotteryWorkspace, through: string) {
  const result: PriorityRow[] = [];
  for (const party of workspace.parties) {
    if (
      party.partyType === "STOCKIST" ||
      party.partyType === "SERVICE_STOCKIST"
    ) {
      const amountPaise = stockistOutstanding(workspace, party.id, through);
      if (amountPaise > 0n)
        result.push({ id: party.id, name: party.name, type: "Stockist", amountPaise });
    }
  }
  for (const profile of workspace.expenseProfiles) {
    const amountPaise = expenseOutstanding(workspace, profile.id, through);
    if (amountPaise > 0n) {
      result.push({
        id: profile.id,
        name: expenseProfileLabel(profile, workspace.expenseCategories),
        type: "Expense",
        amountPaise,
      });
    }
  }
  return sortPriorityRows(result);
}

function periodBusinessMetrics(
  workspace: LotteryWorkspace,
  from: string,
  to: string,
) {
  const sales = [...workspace.sales, ...workspace.draftSales].filter((sale) =>
    inDateRange(sale.occurredAt, from, to),
  );
  const purchases = workspace.stockistEntries.filter((entry) =>
    inDateRange(entry.occurredAt, from, to),
  );
  const legacyExpenses = workspace.payments.filter(
    (payment) =>
      payment.direction === "EXPENSE" &&
      inDateRange(payment.occurredAt, from, to),
  );
  const expensePayments = workspace.expensePayments.filter((payment) =>
    inDateRange(payment.occurredAt, from, to),
  );
  const sellerGross = sumBigInt(sales.map((sale) => sale.grossSalesPaise));
  const stockistGross = sumBigInt(
    purchases.map((entry) => entry.grossPurchasePaise),
  );
  const sellerCommission = sumBigInt(sales.map((sale) => sale.commissionPaise));
  const stockistCommission = sumBigInt(
    purchases.map((entry) => entry.commissionPaise),
  );
  const commissionDifference = stockistCommission - sellerCommission;
  const expenses =
    sumBigInt(legacyExpenses.map((item) => item.totalAmountPaise)) +
    sumBigInt(expensePayments.map((item) => item.totalAmountPaise));
  return {
    sales,
    purchases,
    sellerGross,
    stockistGross,
    sellerCommission,
    stockistCommission,
    commissionDifference,
    expenses,
    profit: sellerGross - stockistGross + commissionDifference - expenses,
  };
}

function Metric({
  label,
  value,
  tone = "green",
  children,
  onClick,
}: Readonly<{
  label: string;
  value: string;
  tone?: "green" | "orange" | "blue" | "violet";
  children?: React.ReactNode;
  onClick?: () => void;
}>) {
  const toneClass = {
    green: "from-emerald-50 to-emerald-100/45 border-emerald-100",
    orange: "from-orange-50 to-amber-100/45 border-orange-100",
    blue: "from-blue-50 to-sky-100/45 border-blue-100",
    violet: "from-violet-50 to-purple-100/45 border-violet-100",
  }[tone];
  const content = (
    <>
      <p className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-black tracking-tight text-slate-950">{value}</p>
      {children}
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-2xl border bg-gradient-to-br p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.9)] ${toneClass}`}
    >
      {content}
    </button>
  ) : (
    <div
      className={`min-w-0 rounded-2xl border bg-gradient-to-br p-3 ${toneClass}`}
    >
      {content}
    </div>
  );
}

function InlineNotice({
  tone = "green",
  children,
}: Readonly<{ tone?: "green" | "orange"; children: React.ReactNode }>) {
  return (
    <div
      className={`rounded-xl border p-3 text-[9px] leading-relaxed ${
        tone === "green"
          ? "border-emerald-100 bg-emerald-50/60 text-emerald-900"
          : "border-orange-100 bg-orange-50/70 text-orange-900"
      }`}
    >
      {children}
    </div>
  );
}

function SectionCard({
  title,
  hint,
  children,
}: Readonly<{
  title: string;
  hint?: string;
  children: React.ReactNode;
}>) {
  return (
    <section className={LIGHT_CARD}>
      <h4 className="text-sm font-black text-slate-950">{title}</h4>
      {hint && <p className="mt-1 text-[9px] leading-relaxed text-slate-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Button({
  active = false,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`${active ? ACTIVE_BUTTON : SOFT_BUTTON} ${props.className || ""}`}
    >
      {children}
    </button>
  );
}

type SimpleEntryProps = Readonly<{
  workspace: LotteryWorkspace;
  organizationId: string;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
}>;

function EntryDateField({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (value: string) => void }>) {
  return (
    <label>
      <span className="text-[8px] font-bold text-slate-500">Date</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL}
      />
    </label>
  );
}

function ExpenseCategorySelect({
  categories,
  value,
  onChange,
  ariaLabel,
}: Readonly<{
  categories: LotteryExpenseCategory[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}>) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={CONTROL}
    >
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}

interface LotteryAccountingWorkspaceProps {
  api?: LotteryAccountingClient;
}

export function LotteryAccountingWorkspace({
  api = lotteryAccountingClient,
}: Readonly<LotteryAccountingWorkspaceProps>) {
  const [organizations, setOrganizations] = useState<
    LotteryWorkspace["organization"][]
  >([]);
  const [organizationId, setOrganizationId] = useState("");
  const [workspace, setWorkspace] = useState<LotteryWorkspace | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("dashboard");
  const [dailyMode, setDailyMode] = useState<DailyMode>("SELLER");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.listOrganizations();
      setOrganizations(next);
      setOrganizationId((current) =>
        next.some((item) => item.id === current) ? current : next[0]?.id || "",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Accounting unavailable.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  const refreshWorkspace = useCallback(
    async (nextId = organizationId) => {
      if (!nextId) {
        setWorkspace(null);
        return;
      }
      setRefreshing(true);
      try {
        setWorkspace(await api.loadWorkspace(nextId));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Accounting unavailable.");
      } finally {
        setRefreshing(false);
      }
    },
    [api, organizationId],
  );

  useEffect(() => {
    void loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    if (organizationId) void refreshWorkspace(organizationId);
    else if (!loading) setTab("masters");
  }, [organizationId, loading, refreshWorkspace]);

  const run = async (
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ) => {
    setWorking(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await refreshWorkspace();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Accounting update failed.");
      return false;
    } finally {
      setWorking(null);
    }
  };

  const createOrganization = async (name: string) => {
    setWorking("organization");
    try {
      const created = await api.createOrganization({ name });
      const next = await api.listOrganizations();
      setOrganizations(next);
      setOrganizationId(created.id);
      setNotice("Accounting workspace created.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workspace could not be created.");
      return false;
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return (
      <SectionCard title="Lottery Accounting">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading accounting…
        </p>
      </SectionCard>
    );
  }

  return (
    <section className="space-y-3" aria-label="Lottery Accounting data workspace">
      <header className="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-orange-50 p-4 shadow-[0_12px_34px_rgba(20,85,61,.07)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
              ORBIS Foundation · Lottery Accounting
            </p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              Smart Accounting Cockpit
            </h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              Easy outside. The existing accounting rules stay underneath.
            </p>
          </div>
          <span className="rounded-2xl border border-orange-100 bg-gradient-to-br from-emerald-100 to-orange-100 p-3 text-emerald-800">
            <WalletCards className="h-5 w-5" />
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <select
            aria-label="Accounting organization"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            className={`${CONTROL} flex-1`}
          >
            <option value="">Create organization</option>
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Refresh accounting workspace"
            disabled={!organizationId || refreshing}
            onClick={() => void refreshWorkspace()}
            className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-100 bg-white text-emerald-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {notice && <InlineNotice>{notice}</InlineNotice>}
      {error && <InlineNotice tone="orange">{error}</InlineNotice>}

      <WorkspaceSectionTabs
        ariaLabel="Accounting workspace sections"
        tabs={WORKSPACE_TABS}
        activeTab={tab}
        onSelect={setTab}
      />

      {!workspace ? (
        <MastersPanel
          workspace={null}
          organizationId=""
          api={api}
          working={working}
          createOrganization={createOrganization}
          run={run}
        />
      ) : (
        <>
          {tab === "dashboard" && (
            <DashboardPanel
              workspace={workspace}
              openLedger={() => setTab("ledger")}
            />
          )}
          {tab === "daily" && (
            <DailyPanel
              workspace={workspace}
              organizationId={organizationId}
              api={api}
              mode={dailyMode}
              setMode={setDailyMode}
              run={run}
              refreshWorkspace={refreshWorkspace}
            />
          )}
          {tab === "payment" && (
            <PaymentPanel
              workspace={workspace}
              organizationId={organizationId}
              api={api}
              working={working}
              run={run}
            />
          )}
          {tab === "ledger" && (
            <LedgerPanel
              workspace={workspace}
              editParty={(party) => {
                setTab("masters");
                sessionStorage.setItem("orbis-accounting-edit-party", party.id);
              }}
              editExpense={(profile) => {
                setTab("masters");
                sessionStorage.setItem(
                  "orbis-accounting-edit-expense",
                  profile.id,
                );
              }}
            />
          )}
          {tab === "ai" && <AiPanel workspace={workspace} />}
          {tab === "masters" && (
            <MastersPanel
              workspace={workspace}
              organizationId={organizationId}
              api={api}
              working={working}
              createOrganization={createOrganization}
              run={run}
            />
          )}
        </>
      )}
    </section>
  );
}

function DashboardPanel({
  workspace,
  openLedger,
}: Readonly<{ workspace: LotteryWorkspace; openLedger: () => void }>) {
  const today = businessDateToday();
  const [period, setPeriod] = useState<"today" | "7d" | "month" | "custom">("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [expanded, setExpanded] = useState<"receivable" | "payable" | null>(null);

  const bounds = useMemo(() => {
    if (period === "today") return { from: today, to: today };
    if (period === "7d") return { from: addDays(today, -6), to: today };
    if (period === "month") return { from: monthStart(today), to: today };
    return { from: from || today, to: to >= from ? to : from };
  }, [from, period, to, today]);

  const {
    sales,
    purchases,
    sellerGross,
    stockistGross,
    sellerCommission,
    stockistCommission,
    commissionDifference,
    expenses,
    profit,
  } = periodBusinessMetrics(workspace, bounds.from, bounds.to);

  const receivables = receivablePriority(workspace, bounds.to);
  const payables = payablePriority(workspace, bounds.to);
  const receivable = receivables.reduce(
    (total, item) => total + item.amountPaise,
    0n,
  );
  const payable = payables.reduce(
    (total, item) => total + item.amountPaise,
    0n,
  );

  const balances = moneyMethodBalances(workspace);
  const totalMoney = Object.values(balances).reduce(
    (total, value) => total + value,
    0n,
  );

  const purchased = purchases.reduce(
    (total, entry) => total + BigInt(entry.netPurchaseQuantity),
    0n,
  );
  const sellerSold = sales.reduce(
    (total, sale) => total + BigInt(sale.netTickets),
    0n,
  );
  const customerSold = workspace.customerBills
    .filter((bill) => inDateRange(bill.occurredAt, bounds.from, bounds.to))
    .reduce((total, bill) => total + BigInt(bill.quantity), 0n);
  const stockDifference = purchased - sellerSold - customerSold;

  const previousDay = addDays(bounds.to, -1);
  const previousSellerCommission = [...workspace.sales, ...workspace.draftSales]
    .filter((sale) => dateKey(sale.occurredAt) === previousDay)
    .reduce((total, sale) => total + BigInt(sale.commissionPaise), 0n);
  const previousStockistCommission = workspace.stockistEntries
    .filter((entry) => dateKey(entry.occurredAt) === previousDay)
    .reduce((total, entry) => total + BigInt(entry.commissionPaise), 0n);
  const previousDifference =
    previousStockistCommission - previousSellerCommission;

  return (
    <div className="space-y-3">
      <SectionCard
        title={`${workspace.organization.name} dashboard`}
        hint="Pick a period. Receivable and Payable always rank the largest open accounts first as of the selected end date."
      >
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["today", "7d", "month", "custom"] as const).map((value) => (
            <Button
              key={value}
              active={period === value}
              onClick={() => setPeriod(value)}
            >
              {{ today: "Today", "7d": "7 Days", month: "Month", custom: "Custom" }[
                value
              ]}
            </Button>
          ))}
        </div>
        {period === "custom" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label>
              <span className="text-[8px] font-bold text-slate-500">From</span>
              <input
                aria-label="Dashboard from date"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className={CONTROL}
              />
            </label>
            <label>
              <span className="text-[8px] font-bold text-slate-500">To</span>
              <input
                aria-label="Dashboard to date"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className={CONTROL}
              />
            </label>
          </div>
        )}
      </SectionCard>

      <section className="rounded-[22px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-orange-50 p-4 shadow-[0_12px_30px_rgba(20,85,61,.065)]">
        <p className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-500">
          Current money
        </p>
        <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">
          {formatPaise(totalMoney)}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PARTY_PAYMENT_METHODS.map(([method, label]) => (
            <div
              key={method}
              className="rounded-xl border border-white bg-white/75 p-2.5"
            >
              <p className="text-[7px] font-bold uppercase text-slate-500">
                {label}
              </p>
              <p className="mt-1 text-xs font-black">{formatPaise(balances[method])}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Net Profit" value={formatPaise(profit)} />
        <Metric
          label="Receivable"
          value={formatPaise(receivable)}
          tone="blue"
          onClick={() =>
            setExpanded((current) =>
              current === "receivable" ? null : "receivable",
            )
          }
        >
          <PriorityMini rows={receivables} />
        </Metric>
        <Metric
          label="Payable"
          value={formatPaise(payable)}
          tone="orange"
          onClick={() =>
            setExpanded((current) => (current === "payable" ? null : "payable"))
          }
        >
          <PriorityMini rows={payables} />
        </Metric>
        <Metric
          label="Commission"
          value={commissionDifference === 0n ? "CLEAR" : "MISMATCH"}
          tone="violet"
        >
          <p className="mt-1 text-[7px] font-bold text-slate-500">
            Difference {formatPaise(commissionDifference < 0n ? -commissionDifference : commissionDifference)}
          </p>
        </Metric>
      </div>

      {expanded && (
        <SectionCard
          title={
            expanded === "receivable"
              ? `Receivable priority · ${displayDate(bounds.to)}`
              : `Payable priority · ${displayDate(bounds.to)}`
          }
        >
          <PriorityList rows={expanded === "receivable" ? receivables : payables} />
        </SectionCard>
      )}

      <SectionCard
        title="Commission reconciliation"
        hint="Only this selected period is compared. Previous-day mismatch is shown as attention only and never carried into today's number."
      >
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Stockist Gross" value={formatPaise(stockistCommission)} />
          <Metric label="Seller Gross" value={formatPaise(sellerCommission)} tone="orange" />
          <Metric
            label="Difference"
            value={formatPaise(
              commissionDifference < 0n ? -commissionDifference : commissionDifference,
            )}
            tone={commissionDifference === 0n ? "green" : "orange"}
          />
        </div>
        {previousDifference !== 0n && (
          <div className="mt-2">
            <InlineNotice tone="orange">
              {displayDate(previousDay)} had a commission mismatch of{" "}
              {formatPaise(previousDifference < 0n ? -previousDifference : previousDifference)}.
              It is not carried forward.
            </InlineNotice>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Profit & Loss">
        <p className="text-[10px] leading-relaxed text-slate-600">
          <strong>{formatPaise(sellerGross)}</strong> seller gross −{" "}
          <strong>{formatPaise(stockistGross)}</strong> stockist gross +{" "}
          <strong>{formatPaise(stockistCommission)}</strong> stockist commission −{" "}
          <strong>{formatPaise(sellerCommission)}</strong> seller commission −{" "}
          <strong>{formatPaise(expenses)}</strong> expenses ={" "}
          <strong>{formatPaise(profit)}</strong>.
        </p>
        <p className="mt-2 text-[8px] text-slate-500">
          TDS remains separate from commission profit.
        </p>
      </SectionCard>

      <SectionCard title="Stock truth">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Net Purchase" value={purchased.toString()} />
          <Metric label="Net Sale" value={(sellerSold + customerSold).toString()} />
          <Metric
            label="Difference"
            value={stockDifference.toString()}
            tone={stockDifference === 0n ? "green" : "orange"}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="ORBIS AI business check"
        hint="Module-only accounting analysis. It uses these same numbers."
      >
        <div className="grid grid-cols-2 gap-2">
          <AiCard
            title="Profit"
            text={`${profit >= 0n ? "Profit" : "Loss"} ${formatPaise(
              profit >= 0n ? profit : -profit,
            )}`}
          />
          <AiCard
            title="Dues"
            text={`${formatPaise(receivable)} receivable · ${formatPaise(payable)} payable`}
          />
          <AiCard
            title="Commission"
            text={commissionDifference === 0n ? "Clear" : "Mismatch needs attention"}
          />
          <AiCard
            title="Stock"
            text={stockDifference === 0n ? "Selected period closes" : "Stock difference needs review"}
          />
        </div>
        <button
          type="button"
          onClick={openLedger}
          className="mt-3 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-[10px] font-black text-emerald-800"
        >
          Open Ledger
        </button>
      </SectionCard>
    </div>
  );
}

function PriorityMini({ rows }: Readonly<{ rows: PriorityRow[] }>) {
  if (!rows.length)
    return <p className="mt-2 text-[7px] font-bold text-emerald-700">No pending account</p>;
  return (
    <div className="mt-2 space-y-1">
      {rows.slice(0, 2).map((row) => (
        <div
          key={`${row.type}-${row.id}`}
          className="flex items-center justify-between gap-2 rounded-lg border border-white bg-white/75 px-2 py-1"
        >
          <span className="truncate text-[7px] text-slate-600">
            {row.type} · {row.name}
          </span>
          <strong className="shrink-0 text-[8px]">{formatPaise(row.amountPaise)}</strong>
        </div>
      ))}
    </div>
  );
}

function PriorityList({ rows }: Readonly<{ rows: PriorityRow[] }>) {
  if (!rows.length) return <InlineNotice>No pending account.</InlineNotice>;
  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
      {rows.map((row) => (
        <div
          key={`${row.type}-${row.id}`}
          className="flex items-center justify-between gap-3 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-[10px] font-black text-slate-900">{row.name}</p>
            <p className="text-[7px] uppercase text-slate-500">{row.type}</p>
          </div>
          <strong className="shrink-0 text-[10px]">{formatPaise(row.amountPaise)}</strong>
        </div>
      ))}
    </div>
  );
}

function AiCard({ title, text }: Readonly<{ title: string; text: string }>) {
  return (
    <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-3">
      <p className="text-[8px] font-black uppercase text-violet-700">{title}</p>
      <p className="mt-1 text-[9px] font-bold text-slate-700">{text}</p>
    </div>
  );
}

function DailyPanel({
  workspace,
  organizationId,
  api,
  mode,
  setMode,
  run,
  refreshWorkspace,
}: Readonly<{
  workspace: LotteryWorkspace;
  organizationId: string;
  api: LotteryAccountingClient;
  mode: DailyMode;
  setMode: (mode: DailyMode) => void;
  run: (
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ) => Promise<boolean>;
  refreshWorkspace: () => Promise<void>;
}>) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-emerald-100 bg-white p-2">
        {(
          [
            ["SELLER", "Seller Sale"],
            ["STOCKIST", "Stockist Purchase"],
            ["CASH_CUSTOMER", "Cash Customer"],
            ["EXPENSE", "Expense Bill"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            active={mode === value}
            className="shrink-0"
            onClick={() => setMode(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {mode === "SELLER" && (
        <DailySellerEntry
          organizationId={organizationId}
          workspace={workspace}
          editRequest={null}
          onSaveDraft={(payload) => api.saveDailySellerDraft(payload)}
          onUpdateDraft={(saleId, payload) =>
            api.updateDailySellerDraft(saleId, payload)
          }
          onDeleteDraft={async (saleId) => {
            await api.deleteDailySellerDraft(saleId, { organizationId });
            await refreshWorkspace();
            return true;
          }}
          onCorrectPosted={(saleId) =>
            api.correctPostedSale(saleId, { organizationId })
          }
          onUpdateTdsRate={async (tdsRateBps) => {
            await api.updateOrganizationTdsRate({ organizationId, tdsRateBps });
            await refreshWorkspace();
            return true;
          }}
        />
      )}
      {mode === "STOCKIST" && (
        <DailyStockistEntry
          organizationId={organizationId}
          workspace={workspace}
          editRequest={null}
          onSave={async (payload) => {
            const result = await api.saveDailyStockistEntry(payload);
            await refreshWorkspace();
            return result;
          }}
        />
      )}
      {mode === "CASH_CUSTOMER" && (
        <CashCustomerEntry
          workspace={workspace}
          organizationId={organizationId}
          busy={false}
          onSave={(payload) =>
            run(
              "customer-bill",
              () => api.recordCustomerBill(payload),
              "Customer sale saved.",
            )
          }
        />
      )}
      {mode === "EXPENSE" && (
        <ExpenseBillEntry
          workspace={workspace}
          organizationId={organizationId}
          busy={false}
          onSave={(payload) =>
            run(
              "expense-bill",
              () => api.recordExpenseBill(payload),
              "Expense bill saved. It is now available in Payment and Ledger.",
            )
          }
        />
      )}
    </div>
  );
}

function CashCustomerEntry({
  workspace,
  organizationId,
  busy,
  onSave,
}: SimpleEntryProps) {
  const customers = workspace.parties.filter((party) => party.partyType === "CUSTOMER");
  const cashCustomer =
    customers.find((party) => party.name.toLowerCase() === "cash customer") ||
    customers[0];
  const [partyId, setPartyId] = useState(cashCustomer?.id || "");
  const [date, setDate] = useState(businessDateToday());
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [received, setReceived] = useState("");
  const [error, setError] = useState<string | null>(null);
  const quantityValue = BigInt(quantity || "0");
  const ratePaise = parseAmount(rate) || 0n;
  const bill = quantityValue * ratePaise;
  const receivedPaise = parseAmount(received) || 0n;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!partyId || quantityValue <= 0n || ratePaise <= 0n) {
      setError("Choose a customer and enter quantity and rate.");
      return;
    }
    if (receivedPaise > bill) {
      setError("Received amount cannot be more than the bill.");
      return;
    }
    setError(null);
    if (
      await onSave({
        organizationId,
        partyId,
        occurredAt: date,
        quantity: quantityValue.toString(),
        unitRatePaise: ratePaise.toString(),
        receivedPaise: receivedPaise.toString(),
      })
    ) {
      setQuantity("");
      setReceived("");
    }
  };

  const customerDateField = <EntryDateField value={date} onChange={setDate} />;

  return (
    <SectionCard
      title="Cash Customer Sale"
      hint="This is the special direct-sale flow where the rate may be entered here."
    >
      {!customers.length ? (
        <InlineNotice tone="orange">Add a Customer in Masters first.</InlineNotice>
      ) : (
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          <div className="grid grid-cols-2 gap-2">
            {customerDateField}
            <label>
              <span className="text-[8px] font-bold text-slate-500">Customer</span>
              <select
                aria-label="Cash Customer"
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className={CONTROL}
              >
                {customers.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-[8px] font-bold text-slate-500">Quantity</span>
              <input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={CONTROL} />
            </label>
            <label>
              <span className="text-[8px] font-bold text-slate-500">Rate ₹</span>
              <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={CONTROL} />
            </label>
            <label className="col-span-2">
              <span className="text-[8px] font-bold text-slate-500">Amount received ₹</span>
              <input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} className={CONTROL} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Bill" value={formatPaise(bill)} />
            <Metric label="Received" value={formatPaise(receivedPaise)} tone="blue" />
            <Metric label="Balance" value={formatPaise(bill - receivedPaise)} tone="orange" />
          </div>
          {error && <InlineNotice tone="orange">{error}</InlineNotice>}
          <button disabled={busy} className={ACTIVE_BUTTON} type="submit">
            Save Cash Customer Sale
          </button>
        </form>
      )}
    </SectionCard>
  );
}

function ExpenseBillEntry({
  workspace,
  organizationId,
  busy,
  onSave,
}: SimpleEntryProps) {
  const [categoryId, setCategoryId] = useState(workspace.expenseCategories[0]?.id || "");
  const profiles = workspace.expenseProfiles.filter(
    (profile) => profile.categoryId === categoryId,
  );
  const [profileId, setProfileId] = useState(profiles[0]?.id || "");
  const [date, setDate] = useState(businessDateToday());
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    const next = workspace.expenseProfiles.find(
      (profile) => profile.categoryId === categoryId,
    );
    setProfileId((current) =>
      workspace.expenseProfiles.some(
        (profile) => profile.id === current && profile.categoryId === categoryId,
      )
        ? current
        : next?.id || "",
    );
  }, [categoryId, workspace.expenseProfiles]);

  useEffect(() => {
    const profile = workspace.expenseProfiles.find((item) => item.id === profileId);
    if (profile && profile.usualAmountPaise !== "0") {
      setAmount(paiseInput(BigInt(profile.usualAmountPaise)));
    }
  }, [profileId, workspace.expenseProfiles]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountPaise = parseAmount(amount);
    if (!profileId || !amountPaise || amountPaise <= 0n) return;
    if (
      await onSave({
        organizationId,
        profileId,
        occurredAt: date,
        amountPaise: amountPaise.toString(),
        reference: reference.trim() || undefined,
      })
    ) {
      setReference("");
    }
  };

  return (
    <SectionCard
      title="Expense Bill Entry"
      hint="Create the bill first. Universal Payment pays the current outstanding later."
    >
      {!workspace.expenseCategories.length ? (
        <InlineNotice tone="orange">
          Add an Expense Category and Expense Profile in Masters first.
        </InlineNotice>
      ) : (
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          <div className="grid grid-cols-2 gap-2">
            <EntryDateField value={date} onChange={setDate} />
            <label>
              <span className="text-[8px] font-bold text-slate-500">Expense category</span>
              <ExpenseCategorySelect
                categories={workspace.expenseCategories}
                value={categoryId}
                onChange={setCategoryId}
              />
            </label>
            <label className="col-span-2">
              <span className="text-[8px] font-bold text-slate-500">Profile / Name</span>
              <select
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                className={CONTROL}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-[8px] font-bold text-slate-500">Bill amount ₹</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={CONTROL} />
            </label>
            <label>
              <span className="text-[8px] font-bold text-slate-500">Reference</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className={CONTROL} />
            </label>
          </div>
          <button disabled={busy} className={ACTIVE_BUTTON} type="submit">
            Save Expense Bill
          </button>
        </form>
      )}
    </SectionCard>
  );
}

function PaymentPanel({
  workspace,
  organizationId,
  api,
  working,
  run,
}: Readonly<{
  workspace: LotteryWorkspace;
  organizationId: string;
  api: LotteryAccountingClient;
  working: string | null;
  run: (
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ) => Promise<boolean>;
}>) {
  const [kind, setKind] = useState<PaymentKind>("SELLER");
  const [expenseCategoryId, setExpenseCategoryId] = useState(
    workspace.expenseCategories[0]?.id || "",
  );
  const accounts = useMemo(() => {
    if (kind === "EXPENSE") {
      return workspace.expenseProfiles
        .filter((profile) => profile.categoryId === expenseCategoryId)
        .map((profile) => ({
          id: profile.id,
          name: expenseProfileLabel(profile, workspace.expenseCategories),
        }));
    }
    const partyType =
      kind === "SELLER" ? "SELLER" : kind === "CUSTOMER" ? "CUSTOMER" : null;
    return workspace.parties
      .filter((party) =>
        kind === "STOCKIST"
          ? party.partyType === "STOCKIST" ||
            party.partyType === "SERVICE_STOCKIST"
          : party.partyType === partyType,
      )
      .map((party) => ({ id: party.id, name: party.name }));
  }, [expenseCategoryId, kind, workspace]);
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [date, setDate] = useState(businessDateToday());
  const [amounts, setAmounts] = useState<Record<MoneyMethod, string>>({
    cashPaise: "",
    bankPaise: "",
    upiPaise: "",
    pwtPaise: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAccountId((current) =>
      accounts.some((item) => item.id === current) ? current : accounts[0]?.id || "",
    );
    setAmounts({ cashPaise: "", bankPaise: "", upiPaise: "", pwtPaise: "" });
  }, [accounts]);

  const outstanding =
    kind === "SELLER"
      ? sellerOutstanding(workspace, accountId, date)
      : kind === "CUSTOMER"
        ? customerOutstanding(workspace, accountId, date)
        : kind === "STOCKIST"
          ? stockistOutstanding(workspace, accountId, date)
          : expenseOutstanding(workspace, accountId, date);
  const methods =
    kind === "EXPENSE"
      ? PARTY_PAYMENT_METHODS.filter(([method]) =>
          new Set<MoneyMethod>(["cashPaise", "bankPaise"]).has(method),
        )
      : PARTY_PAYMENT_METHODS;
  const parsed = Object.fromEntries(
    PARTY_PAYMENT_METHODS.map(([method]) => [
      method,
      parseAmount(amounts[method]) || 0n,
    ]),
  ) as Record<MoneyMethod, bigint>;
  const entered = methods.reduce((total, [method]) => total + parsed[method], 0n);
  const after = outstanding - entered;
  const direction = kind === "SELLER" || kind === "CUSTOMER" ? "RECEIPT" : "PAYMENT";
  const balances = moneyMethodBalances(workspace, date);
  const latestExpenseBill =
    kind === "EXPENSE"
      ? workspace.expenseBills
          .filter(
            (bill) => bill.profileId === accountId && throughDate(bill.occurredAt, date),
          )
          .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
      : null;
  const latestExpensePayment =
    kind === "EXPENSE"
      ? workspace.expensePayments
          .filter(
            (payment) =>
              payment.profileId === accountId &&
              throughDate(payment.occurredAt, date),
          )
          .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
      : null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountId || entered <= 0n) {
      setError("Choose an account and enter an amount.");
      return;
    }
    if (outstanding >= 0n && entered > outstanding) {
      setError("Entered amount is greater than the current outstanding.");
      return;
    }
    setError(null);
    if (kind === "EXPENSE") {
      const ok = await run(
        "expense-payment",
        () =>
          api.recordExpensePayment({
            organizationId,
            profileId: accountId,
            occurredAt: date,
            totalAmountPaise: entered.toString(),
            cashPaise: parsed.cashPaise.toString(),
            bankPaise: parsed.bankPaise.toString(),
          }),
        "Expense payment saved.",
      );
      if (ok)
        setAmounts({ cashPaise: "", bankPaise: "", upiPaise: "", pwtPaise: "" });
      return;
    }
    const methodSplit = {
      cashPaise: parsed.cashPaise.toString(),
      bankPaise: parsed.bankPaise.toString(),
      upiPaise: parsed.upiPaise.toString(),
      chequePaise: "0",
      pwtPaise: parsed.pwtPaise.toString(),
    };
    const ok = await run(
      "payment",
      () =>
        api.recordPayment({
          organizationId,
          partyId: accountId,
          periodId: null,
          direction,
          occurredAt: date,
          totalAmountPaise: entered.toString(),
          methodSplit,
        }),
      direction === "RECEIPT" ? "Receipt saved." : "Payment saved.",
    );
    if (ok)
      setAmounts({ cashPaise: "", bankPaise: "", upiPaise: "", pwtPaise: "" });
  };

  return (
    <SectionCard
      title="Universal Payment"
      hint="Seller / Customer = Receive. Stockist / Expense = Pay. No settlement screen is required here."
    >
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <div className="grid grid-cols-1 gap-2">
          <label>
            <span className="text-[8px] font-bold uppercase text-slate-500">
              Account type
            </span>
            <select
              aria-label="Payment account type"
              value={kind}
              onChange={(event) => setKind(event.target.value as PaymentKind)}
              className={CONTROL}
            >
              <option value="SELLER">Seller</option>
              <option value="STOCKIST">Stockist</option>
              <option value="CUSTOMER">Customer</option>
              <option value="EXPENSE">Expenses</option>
            </select>
          </label>
          {kind === "EXPENSE" && (
            <label>
              <span className="text-[8px] font-bold uppercase text-slate-500">
                Expense subcategory
              </span>
              <ExpenseCategorySelect
                ariaLabel="Expense subcategory"
                categories={workspace.expenseCategories}
                value={expenseCategoryId}
                onChange={setExpenseCategoryId}
              />
            </label>
          )}
          <label>
            <span className="text-[8px] font-bold uppercase text-slate-500">
              {kind === "EXPENSE" ? "Expense / Payee" : `${kind.toLowerCase()} name`}
            </span>
            <select
              aria-label="Payment party"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className={CONTROL}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {kind === "EXPENSE" ? (
          <div className="grid grid-cols-3 gap-2">
            <Metric
              label="Last Paid"
              value={formatPaise(latestExpensePayment?.totalAmountPaise || "0")}
            />
            <Metric
              label="Current Bill"
              value={formatPaise(latestExpenseBill?.amountPaise || "0")}
              tone="blue"
            />
            <Metric
              label="Pending"
              value={formatPaise(outstanding)}
              tone="orange"
            />
          </div>
        ) : (
          <Metric
            label={direction === "RECEIPT" ? "Amount to receive" : "Amount to pay"}
            value={formatPaise(outstanding)}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          {methods.map(([method, label]) => (
            <label key={method}>
              <span className="text-[8px] font-bold uppercase text-slate-500">
                {label} ₹
              </span>
              <input
                aria-label={`Payment ${label}`}
                inputMode="decimal"
                value={amounts[method]}
                onChange={(event) =>
                  setAmounts((current) => ({
                    ...current,
                    [method]: event.target.value,
                  }))
                }
                className={CONTROL}
              />
              {direction === "PAYMENT" && kind !== "EXPENSE" && (
                <span className="mt-1 block text-[7px] text-slate-400">
                  Available {formatPaise(balances[method])}
                </span>
              )}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Entered" value={formatPaise(entered)} tone="blue" />
          <Metric label="Before" value={formatPaise(outstanding)} />
          <Metric
            label="After"
            value={formatPaise(after > 0n ? after : 0n)}
            tone="orange"
          />
        </div>
        <label>
          <span className="text-[8px] font-bold uppercase text-slate-500">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={CONTROL} />
        </label>
        {error && <InlineNotice tone="orange">{error}</InlineNotice>}
        <button
          type="submit"
          disabled={working === "payment" || working === "expense-payment"}
          className={ACTIVE_BUTTON}
        >
          {direction === "RECEIPT" ? "Receive" : "Pay"} {formatPaise(entered)}
        </button>
      </form>
    </SectionCard>
  );
}

type LedgerTxn = {
  id: string;
  occurredAt: string;
  business: string;
  money: string;
  balance: string;
  detail: string;
};

type LedgerBook = {
  id: string;
  category: LedgerBookType;
  subtype: string;
  accountId: string | null;
  accountKind: "party" | "expense" | null;
  name: string;
  typeLabel: string;
  summary: Array<[string, string]>;
  transactions: LedgerTxn[];
};

function LedgerPanel({
  workspace,
  editParty,
  editExpense,
}: Readonly<{
  workspace: LotteryWorkspace;
  editParty: (party: LotteryParty) => void;
  editExpense: (profile: LotteryExpenseProfile) => void;
}>) {
  const today = businessDateToday();
  const [bookType, setBookType] = useState<LedgerBookType>("seller");
  const [subtype, setSubtype] = useState("seller");
  const [accountId, setAccountId] = useState("");
  const [period, setPeriod] = useState<LedgerPeriod>("today");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [view, setView] = useState<"list" | "table">("list");
  const [statementOpen, setStatementOpen] = useState(false);

  const bounds = periodBounds(period, from, to);
  const subtypeOptions = useMemo(
    () => ledgerSubtypeOptions(workspace, bookType),
    [bookType, workspace],
  );

  useEffect(() => {
    setSubtype((current) =>
      subtypeOptions.some(([value]) => value === current)
        ? current
        : subtypeOptions[0]?.[0] || "",
    );
    setStatementOpen(false);
  }, [bookType, subtypeOptions]);

  const books = useMemo(
    () => buildLedgerBooks(workspace, bookType, subtype, bounds.from, bounds.to),
    [bookType, bounds.from, bounds.to, subtype, workspace],
  );

  useEffect(() => {
    setAccountId((current) =>
      books.some((book) => book.id === current) ? current : books[0]?.id || "",
    );
    setStatementOpen(false);
  }, [books]);

  const selected = books.find((book) => book.id === accountId) || books[0];
  const needsSubtype = subtypeOptions.length > 1 || bookType === "expense";
  const needsAccount = !new Set<LedgerBookType>(["money", "pwt", "stock"]).has(
    bookType,
  );

  return (
    <div className="space-y-3">
      <SectionCard
        title="Universal Ledger Hub"
        hint="Ledger Book → Type/Subcategory → Particular Party/Account → Period. The same filtering pattern works for every accounting book."
      >
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/65 via-white to-orange-50/70 p-3">
          <div className="space-y-2">
            <label>
              <span className="text-[8px] font-black uppercase text-slate-500">
                1 · Ledger Book
              </span>
              <select
                aria-label="Ledger Book"
                value={bookType}
                onChange={(event) =>
                  setBookType(event.target.value as LedgerBookType)
                }
                className={CONTROL}
              >
                {LEDGER_BOOK_LABELS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {needsSubtype && (
              <label>
                <span className="text-[8px] font-black uppercase text-slate-500">
                  2 · {bookType === "expense" ? "Expense Category" : "Type"}
                </span>
                <select
                  aria-label="Ledger type"
                  value={subtype}
                  onChange={(event) => setSubtype(event.target.value)}
                  className={CONTROL}
                >
                  {subtypeOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {needsAccount && (
              <label>
                <span className="text-[8px] font-black uppercase text-slate-500">
                  {needsSubtype ? "3" : "2"} · Party / Account
                </span>
                <select
                  aria-label="Ledger Party"
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className={CONTROL}
                >
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="mt-2 rounded-xl border border-white bg-white/70 px-3 py-2 text-[8px] font-bold text-emerald-800">
            {ledgerBookLabel(bookType)}
            {needsSubtype && subtypeOptions.find(([value]) => value === subtype)
              ? ` › ${subtypeOptions.find(([value]) => value === subtype)?.[1]}`
              : ""}
            {needsAccount && selected ? ` › ${selected.name}` : ""}
          </p>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {(
              [
                ["today", "Today"],
                ["7d", "7 Days"],
                ["10d", "10 Days"],
                ["month", "Month"],
                ["year", "Year"],
                ["custom", "Custom"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                active={period === value}
                className="shrink-0"
                onClick={() => setPeriod(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {period === "custom" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                aria-label="Ledger from date"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className={CONTROL}
              />
              <input
                aria-label="Ledger to date"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className={CONTROL}
              />
            </div>
          )}
        </div>
      </SectionCard>

      {!selected ? (
        <InlineNotice tone="orange">No account exists for this filter.</InlineNotice>
      ) : statementOpen ? (
        <LedgerStatement
          book={selected}
          bounds={bounds}
          onBack={() => setStatementOpen(false)}
          onEdit={() => {
            if (selected.accountKind === "party" && selected.accountId) {
              const party = workspace.parties.find(
                (item) => item.id === selected.accountId,
              );
              if (party) editParty(party);
            } else if (
              selected.accountKind === "expense" &&
              selected.accountId
            ) {
              const profile = workspace.expenseProfiles.find(
                (item) => item.id === selected.accountId,
              );
              if (profile) editExpense(profile);
            }
          }}
        />
      ) : (
        <SectionCard title="Selected ledger">
          <div className="mb-2 flex gap-2">
            <Button active={view === "list"} onClick={() => setView("list")}>
              Compact List
            </Button>
            <Button active={view === "table"} onClick={() => setView("table")}>
              Table View
            </Button>
          </div>
          {view === "list" ? (
            <button
              type="button"
              onClick={() => setStatementOpen(true)}
              className="grid w-full grid-cols-[minmax(90px,1.3fr)_repeat(3,minmax(55px,.8fr))] items-center gap-1 border-y border-slate-100 bg-white px-1 py-2.5 text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-[9px] font-black">{selected.name}</p>
                <p className="truncate text-[6px] uppercase text-slate-400">
                  {selected.typeLabel}
                </p>
              </div>
              {selected.summary.slice(-3).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="truncate text-[5.5px] font-bold uppercase text-slate-400">
                    {label}
                  </p>
                  <p className="truncate text-[7.5px] font-black">{value}</p>
                </div>
              ))}
            </button>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-[580px] border-collapse text-left text-[9px]">
                <thead className="bg-emerald-50/60 text-[7px] uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Account</th>
                    {selected.summary.slice(-3).map(([label]) => (
                      <th key={label} className="px-2 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr
                    role="button"
                    tabIndex={0}
                    onClick={() => setStatementOpen(true)}
                    className="cursor-pointer"
                  >
                    <td className="px-2 py-2 font-black">{selected.name}</td>
                    {selected.summary.slice(-3).map(([label, value]) => (
                      <td key={label} className="px-2 py-2">
                        {value}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

const LEDGER_BOOK_LABELS: Array<[LedgerBookType, string]> = [
  ["seller", "Seller Ledger"],
  ["customer", "Customer Ledger"],
  ["stockist", "Stockist Ledger"],
  ["sale", "Sales Ledger"],
  ["purchase", "Purchase Ledger"],
  ["return", "Return Ledger"],
  ["commission", "Commission Ledger"],
  ["tds", "TDS Ledger"],
  ["expense", "Expenses Ledger"],
  ["payment", "Payment Ledger"],
  ["money", "Cash Flow Ledger"],
  ["pwt", "PWT / Prize Ledger"],
  ["stock", "Stock Ledger"],
];

function ledgerBookLabel(value: LedgerBookType) {
  return LEDGER_BOOK_LABELS.find(([key]) => key === value)?.[1] || "Ledger";
}

function ledgerSubtypeOptions(
  workspace: LotteryWorkspace,
  type: LedgerBookType,
): Array<[string, string]> {
  if (type === "sale")
    return [
      ["seller", "Seller Sale"],
      ["customer", "Customer Sale"],
    ];
  if (type === "return")
    return [
      ["seller", "Seller Return"],
      ["stockist", "Stockist Return"],
    ];
  if (type === "commission")
    return [
      ["seller", "Seller Commission"],
      ["stockist", "Stockist Commission"],
    ];
  if (type === "tds")
    return [
      ["seller", "Seller TDS Payable"],
      ["stockist", "Stockist TDS Credit"],
    ];
  if (type === "expense")
    return workspace.expenseCategories.map((category) => [
      category.id,
      category.name,
    ]);
  if (type === "payment")
    return [
      ["seller", "Seller Receipt"],
      ["customer", "Customer Receipt"],
      ["stockist", "Stockist Payment"],
      ["expense", "Expense Payment"],
    ];
  if (type === "money")
    return [
      ["cashPaise", "Cash Book"],
      ["bankPaise", "Bank Book"],
      ["upiPaise", "UPI Book"],
      ["pwtPaise", "PWT Book"],
    ];
  if (type === "pwt")
    return [
      ["received", "PWT Received"],
      ["redeemed", "PWT Redeemed"],
    ];
  return [[type, ledgerBookLabel(type)]];
}

type PartyLedgerEvent = {
  id: string;
  date: string;
  business: bigint;
  money: bigint;
  detail: string;
};

function appendReceiptEvents(
  events: PartyLedgerEvent[],
  workspace: LotteryWorkspace,
  partyId: string,
  to: string,
) {
  for (const payment of workspace.payments) {
    if (
      payment.partyId !== partyId ||
      payment.direction !== "RECEIPT" ||
      !throughDate(payment.occurredAt, to)
    )
      continue;
    events.push({
      id: `payment-${payment.id}`,
      date: payment.occurredAt,
      business: 0n,
      money: BigInt(payment.totalAmountPaise),
      detail: `Received ${formatPaise(payment.totalAmountPaise)} · ${splitText(
        payment.methodSplit,
      )}`,
    });
  }
}

function ledgerParties(workspace: LotteryWorkspace, sellerSide: boolean) {
  return workspace.parties.filter((party) =>
    sellerSide
      ? party.partyType === "SELLER"
      : party.partyType === "STOCKIST" ||
        party.partyType === "SERVICE_STOCKIST",
  );
}

function makePartyLedgerTransactions(
  workspace: LotteryWorkspace,
  party: LotteryParty,
  from: string,
  to: string,
): { summary: Array<[string, string]>; transactions: LedgerTxn[] } {
  const allEvents: PartyLedgerEvent[] = [];
  if (party.partyType === "SELLER") {
    for (const sale of [...workspace.sales, ...workspace.draftSales]) {
      if (sale.partyId !== party.id || !throughDate(sale.occurredAt, to)) continue;
      allEvents.push({
        id: `sale-${sale.id}`,
        date: sale.occurredAt,
        business: BigInt(sale.netPayablePaise),
        money: 0n,
        detail: `${sale.netTickets} tickets · Gross ${formatPaise(
          sale.grossSalesPaise,
        )} · Commission ${formatPaise(sale.commissionPaise)} · TDS ${formatPaise(
          sale.tdsPaise,
        )}`,
      });
    }
    appendReceiptEvents(allEvents, workspace, party.id, to);
  } else if (
    party.partyType === "STOCKIST" ||
    party.partyType === "SERVICE_STOCKIST"
  ) {
    for (const entry of workspace.stockistEntries) {
      if (entry.partyId !== party.id || !throughDate(entry.occurredAt, to)) continue;
      allEvents.push({
        id: `purchase-${entry.id}`,
        date: entry.occurredAt,
        business: BigInt(entry.netPayablePaise),
        money: 0n,
        detail: `${entry.netPurchaseQuantity} tickets · Gross ${formatPaise(
          entry.grossPurchasePaise,
        )} · Commission ${formatPaise(entry.commissionPaise)} · TDS ${formatPaise(
          entry.tdsPaise,
        )}`,
      });
    }
    for (const payment of workspace.payments) {
      if (
        payment.partyId !== party.id ||
        payment.direction !== "PAYMENT" ||
        !throughDate(payment.occurredAt, to)
      )
        continue;
      allEvents.push({
        id: `payment-${payment.id}`,
        date: payment.occurredAt,
        business: 0n,
        money: BigInt(payment.totalAmountPaise),
        detail: `Paid ${formatPaise(payment.totalAmountPaise)} · ${splitText(
          payment.methodSplit,
        )}`,
      });
    }
  } else {
    for (const bill of workspace.customerBills) {
      if (bill.partyId !== party.id || !throughDate(bill.occurredAt, to)) continue;
      allEvents.push({
        id: `customer-${bill.id}`,
        date: bill.occurredAt,
        business: BigInt(bill.amountPaise),
        money: 0n,
        detail: `${bill.quantity} tickets · Rate ${formatPaise(bill.unitRatePaise)}`,
      });
    }
    appendReceiptEvents(allEvents, workspace, party.id, to);
  }
  allEvents.sort((left, right) => left.date.localeCompare(right.date));
  let balance = 0n;
  const transactions: LedgerTxn[] = [];
  for (const event of allEvents) {
    balance += event.business - event.money;
    if (inDateRange(event.date, from, to)) {
      transactions.push({
        id: event.id,
        occurredAt: event.date,
        business: formatPaise(event.business),
        money: formatPaise(event.money),
        balance: formatPaise(balance),
        detail: event.detail,
      });
    }
  }
  const business = allEvents
    .filter((event) => inDateRange(event.date, from, to))
    .reduce((total, event) => total + event.business, 0n);
  const money = allEvents
    .filter((event) => inDateRange(event.date, from, to))
    .reduce((total, event) => total + event.money, 0n);
  return {
    summary: [
      ["Net Business", formatPaise(business)],
      [
        party.partyType === "STOCKIST" || party.partyType === "SERVICE_STOCKIST"
          ? "Paid"
          : "Received",
        formatPaise(money),
      ],
      ["Balance", formatPaise(balance)],
    ],
    transactions,
  };
}

function splitText(split: Record<string, string>) {
  return PARTY_PAYMENT_METHODS.filter(([method]) => BigInt(split[method] || "0") > 0n)
    .map(([method, label]) => `${label} ${formatPaise(split[method] || "0")}`)
    .join(" + ");
}

function buildLedgerBooks(
  workspace: LotteryWorkspace,
  type: LedgerBookType,
  subtype: string,
  from: string,
  to: string,
): LedgerBook[] {
  if (type === "seller" || type === "stockist" || type === "customer") {
    const parties = workspace.parties.filter((party) =>
      type === "seller"
        ? party.partyType === "SELLER"
        : type === "stockist"
          ? party.partyType === "STOCKIST" ||
            party.partyType === "SERVICE_STOCKIST"
          : party.partyType === "CUSTOMER",
    );
    return parties.map((party) => {
      const ledger = makePartyLedgerTransactions(workspace, party, from, to);
      return {
        id: party.id,
        category: type,
        subtype: type,
        accountId: party.id,
        accountKind: "party",
        name: party.name,
        typeLabel: ledgerBookLabel(type),
        summary: ledger.summary,
        transactions: ledger.transactions,
      };
    });
  }

  if (type === "sale") {
    if (subtype === "seller") {
      return workspace.parties
        .filter((party) => party.partyType === "SELLER")
        .map((party) => {
          const rows = [...workspace.sales, ...workspace.draftSales].filter(
            (sale) =>
              sale.partyId === party.id &&
              inDateRange(sale.occurredAt, from, to),
          );
          return simpleDerivedBook({
            id: `sale-${party.id}`,
            type,
            subtype,
            accountId: party.id,
            accountKind: "party",
            name: party.name,
            typeLabel: "Seller Sales",
            rows: rows.map((sale) => ({
              id: sale.id,
              occurredAt: sale.occurredAt,
              business: formatPaise(sale.grossSalesPaise),
              money: formatPaise(sale.netPayablePaise),
              balance: `${sale.netTickets} tickets`,
              detail: `Gross ${formatPaise(sale.grossSalesPaise)} · Commission ${formatPaise(
                sale.commissionPaise,
              )} · TDS ${formatPaise(sale.tdsPaise)}`,
            })),
            summary: [
              ["Tickets", rows.reduce((total, sale) => total + sale.netTickets, 0).toString()],
              ["Gross", formatPaise(sumBigInt(rows.map((sale) => sale.grossSalesPaise)))],
              ["Net Due", formatPaise(sumBigInt(rows.map((sale) => sale.netPayablePaise)))],
            ],
          });
        });
    }
    return workspace.parties
      .filter((party) => party.partyType === "CUSTOMER")
      .map((party) => {
        const rows = workspace.customerBills.filter(
          (bill) =>
            bill.partyId === party.id && inDateRange(bill.occurredAt, from, to),
        );
        return simpleDerivedBook({
          id: `customer-sale-${party.id}`,
          type,
          subtype,
          accountId: party.id,
          accountKind: "party",
          name: party.name,
          typeLabel: "Customer Sales",
          rows: rows.map((bill) => ({
            id: bill.id,
            occurredAt: bill.occurredAt,
            business: formatPaise(bill.amountPaise),
            money: "—",
            balance: `${bill.quantity} tickets`,
            detail: `Rate ${formatPaise(bill.unitRatePaise)} · ${bill.reference}`,
          })),
          summary: [
            ["Tickets", sumBigInt(rows.map((bill) => bill.quantity)).toString()],
            ["Gross", formatPaise(sumBigInt(rows.map((bill) => bill.amountPaise)))],
            ["Entries", rows.length.toString()],
          ],
        });
      });
  }

  if (type === "purchase") {
    return workspace.parties
      .filter(
        (party) =>
          party.partyType === "STOCKIST" ||
          party.partyType === "SERVICE_STOCKIST",
      )
      .map((party) => {
        const rows = workspace.stockistEntries.filter(
          (entry) =>
            entry.partyId === party.id &&
            inDateRange(entry.occurredAt, from, to),
        );
        return simpleDerivedBook({
          id: `purchase-${party.id}`,
          type,
          subtype,
          accountId: party.id,
          accountKind: "party",
          name: party.name,
          typeLabel: "Purchase Ledger",
          rows: rows.map((entry) => ({
            id: entry.id,
            occurredAt: entry.occurredAt,
            business: formatPaise(entry.grossPurchasePaise),
            money: formatPaise(entry.netPayablePaise),
            balance: `${entry.netPurchaseQuantity} tickets`,
            detail: `Gross ${formatPaise(entry.grossPurchasePaise)} · Commission ${formatPaise(
              entry.commissionPaise,
            )} · TDS ${formatPaise(entry.tdsPaise)}`,
          })),
          summary: [
            ["Tickets", sumBigInt(rows.map((entry) => entry.netPurchaseQuantity)).toString()],
            ["Gross", formatPaise(sumBigInt(rows.map((entry) => entry.grossPurchasePaise)))],
            ["Net Payable", formatPaise(sumBigInt(rows.map((entry) => entry.netPayablePaise)))],
          ],
        });
      });
  }

  if (type === "return") {
    const sellerSide = subtype === "seller";
    const parties = ledgerParties(workspace, sellerSide);
    return parties.map((party) => {
      const rows = sellerSide
        ? [...workspace.sales, ...workspace.draftSales]
            .filter(
              (sale) =>
                sale.partyId === party.id &&
                inDateRange(sale.occurredAt, from, to),
            )
            .map((sale) => ({
              id: sale.id,
              occurredAt: sale.occurredAt,
              quantity: String(sale.dispatchQuantity),
              returned: String(sale.returnQuantity),
              net: String(sale.netTickets),
              detail: `Morning ${sale.morningReturnQuantity} · Day ${sale.dayReturnQuantity} · Evening ${sale.eveningReturnQuantity}`,
            }))
        : workspace.stockistEntries
            .filter(
              (entry) =>
                entry.partyId === party.id &&
                inDateRange(entry.occurredAt, from, to),
            )
            .map((entry) => ({
              id: entry.id,
              occurredAt: entry.occurredAt,
              quantity: entry.purchaseQuantity,
              returned: entry.totalReturnQuantity,
              net: entry.netPurchaseQuantity,
              detail: `Morning ${entry.morningReturnQuantity} · Day ${entry.dayReturnQuantity} · Evening ${entry.eveningReturnQuantity}`,
            }));
      return simpleDerivedBook({
        id: `return-${subtype}-${party.id}`,
        type,
        subtype,
        accountId: party.id,
        accountKind: "party",
        name: party.name,
        typeLabel: sellerSide ? "Seller Return" : "Stockist Return",
        rows: rows.map((row) => ({
          id: row.id,
          occurredAt: row.occurredAt,
          business: `${row.quantity} issued`,
          money: `${row.returned} return`,
          balance: `${row.net} net`,
          detail: row.detail,
        })),
        summary: [
          ["Issued", sumBigInt(rows.map((row) => row.quantity)).toString()],
          ["Return", sumBigInt(rows.map((row) => row.returned)).toString()],
          ["Net", sumBigInt(rows.map((row) => row.net)).toString()],
        ],
      });
    });
  }

  if (type === "commission" || type === "tds") {
    const sellerSide = subtype === "seller";
    const parties = ledgerParties(workspace, sellerSide);
    return parties.map((party) => {
      const entries = sellerSide
        ? [...workspace.sales, ...workspace.draftSales].filter(
            (sale) =>
              sale.partyId === party.id &&
              inDateRange(sale.occurredAt, from, to),
          )
        : workspace.stockistEntries.filter(
            (entry) =>
              entry.partyId === party.id &&
              inDateRange(entry.occurredAt, from, to),
          );
      const gross = sumBigInt(entries.map((entry) => entry.commissionPaise));
      const tax = sumBigInt(entries.map((entry) => entry.tdsPaise));
      return simpleDerivedBook({
        id: `${type}-${subtype}-${party.id}`,
        type,
        subtype,
        accountId: party.id,
        accountKind: "party",
        name: party.name,
        typeLabel:
          type === "commission"
            ? sellerSide
              ? "Seller Commission"
              : "Stockist Commission"
            : sellerSide
              ? "Seller TDS Payable"
              : "Stockist TDS Credit",
        rows: entries.map((entry) => ({
          id: entry.id,
          occurredAt: entry.occurredAt,
          business:
            type === "commission"
              ? formatPaise(entry.commissionPaise)
              : formatPaise(entry.tdsPaise),
          money:
            type === "commission" ? formatPaise(entry.tdsPaise) : "—",
          balance:
            type === "commission"
              ? formatPaise(
                  BigInt(entry.commissionPaise) - BigInt(entry.tdsPaise),
                )
              : formatPaise(entry.tdsPaise),
          detail: `Gross commission ${formatPaise(
            entry.commissionPaise,
          )} · TDS ${formatPaise(entry.tdsPaise)}`,
        })),
        summary:
          type === "commission"
            ? [
                ["Gross Commission", formatPaise(gross)],
                ["TDS", formatPaise(tax)],
                ["Net Commission", formatPaise(gross - tax)],
              ]
            : [
                [sellerSide ? "TDS Generated" : "TDS Credit", formatPaise(tax)],
                [sellerSide ? "Deposited" : "Claimed", formatPaise(0)],
                ["Balance", formatPaise(tax)],
              ],
      });
    });
  }

  if (type === "expense") {
    return workspace.expenseProfiles
      .filter((profile) => profile.categoryId === subtype)
      .map((profile) => {
        const allBills = workspace.expenseBills.filter(
          (bill) => bill.profileId === profile.id && throughDate(bill.occurredAt, to),
        );
        const allPayments = workspace.expensePayments.filter(
          (payment) =>
            payment.profileId === profile.id && throughDate(payment.occurredAt, to),
        );
        const events = [
          ...allBills.map((bill) => ({
            id: `bill-${bill.id}`,
            occurredAt: bill.occurredAt,
            business: BigInt(bill.amountPaise),
            money: 0n,
            detail: `Bill ${bill.reference}`,
          })),
          ...allPayments.map((payment) => ({
            id: `pay-${payment.id}`,
            occurredAt: payment.occurredAt,
            business: 0n,
            money: BigInt(payment.totalAmountPaise),
            detail: `Cash ${formatPaise(payment.cashPaise)} · Bank ${formatPaise(
              payment.bankPaise,
            )}`,
          })),
        ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
        let balance = 0n;
        const transactions: LedgerTxn[] = [];
        for (const event of events) {
          balance += event.business - event.money;
          if (inDateRange(event.occurredAt, from, to)) {
            transactions.push({
              id: event.id,
              occurredAt: event.occurredAt,
              business: formatPaise(event.business),
              money: formatPaise(event.money),
              balance: formatPaise(balance),
              detail: event.detail,
            });
          }
        }
        const periodBills = allBills.filter((bill) =>
          inDateRange(bill.occurredAt, from, to),
        );
        const periodPayments = allPayments.filter((payment) =>
          inDateRange(payment.occurredAt, from, to),
        );
        return {
          id: profile.id,
          category: type,
          subtype,
          accountId: profile.id,
          accountKind: "expense",
          name: expenseProfileLabel(profile, workspace.expenseCategories),
          typeLabel: "Expense Ledger",
          summary: [
            ["Bills", formatPaise(sumBigInt(periodBills.map((bill) => bill.amountPaise)))],
            ["Paid", formatPaise(sumBigInt(periodPayments.map((p) => p.totalAmountPaise)))],
            ["Balance", formatPaise(balance)],
          ],
          transactions,
        };
      });
  }

  if (type === "payment") {
    if (subtype === "expense") {
      return workspace.expenseProfiles.map((profile) => {
        const rows = workspace.expensePayments.filter(
          (payment) =>
            payment.profileId === profile.id &&
            inDateRange(payment.occurredAt, from, to),
        );
        return simpleDerivedBook({
          id: `expense-payment-${profile.id}`,
          type,
          subtype,
          accountId: profile.id,
          accountKind: "expense",
          name: expenseProfileLabel(profile, workspace.expenseCategories),
          typeLabel: "Expense Payment",
          rows: rows.map((payment) => ({
            id: payment.id,
            occurredAt: payment.occurredAt,
            business: formatPaise(payment.totalAmountPaise),
            money: `Cash ${formatPaise(payment.cashPaise)}`,
            balance: `Bank ${formatPaise(payment.bankPaise)}`,
            detail: payment.reference,
          })),
          summary: [
            ["Entries", rows.length.toString()],
            ["Paid", formatPaise(sumBigInt(rows.map((p) => p.totalAmountPaise)))],
            ["Methods", "Cash + Bank"],
          ],
        });
      });
    }
    const partyType =
      subtype === "seller"
        ? "SELLER"
        : subtype === "customer"
          ? "CUSTOMER"
          : "STOCKIST";
    return workspace.parties
      .filter((party) =>
        subtype === "stockist"
          ? party.partyType === "STOCKIST" ||
            party.partyType === "SERVICE_STOCKIST"
          : party.partyType === partyType,
      )
      .map((party) => {
        const direction = subtype === "stockist" ? "PAYMENT" : "RECEIPT";
        const rows = workspace.payments.filter(
          (payment) =>
            payment.partyId === party.id &&
            payment.direction === direction &&
            inDateRange(payment.occurredAt, from, to),
        );
        return simpleDerivedBook({
          id: `payment-${subtype}-${party.id}`,
          type,
          subtype,
          accountId: party.id,
          accountKind: "party",
          name: party.name,
          typeLabel: subtype === "stockist" ? "Stockist Payment" : "Receipt",
          rows: rows.map((payment) => ({
            id: payment.id,
            occurredAt: payment.occurredAt,
            business: formatPaise(payment.totalAmountPaise),
            money: splitText(payment.methodSplit),
            balance: "—",
            detail: payment.reference,
          })),
          summary: [
            ["Entries", rows.length.toString()],
            [
              direction === "RECEIPT" ? "Received" : "Paid",
              formatPaise(sumBigInt(rows.map((p) => p.totalAmountPaise))),
            ],
            ["Methods", "Cash/Bank/UPI/PWT"],
          ],
        });
      });
  }

  if (type === "money") {
    const method = subtype as MoneyMethod;
    const rows: LedgerTxn[] = [];
    let moneyIn = 0n;
    let moneyOut = 0n;
    for (const payment of workspace.payments) {
      if (!inDateRange(payment.occurredAt, from, to)) continue;
      const amount = BigInt(payment.methodSplit[method] || "0");
      if (amount === 0n) continue;
      const incoming = payment.direction === "RECEIPT";
      if (incoming) moneyIn += amount;
      else moneyOut += amount;
      rows.push({
        id: payment.id,
        occurredAt: payment.occurredAt,
        business: incoming ? formatPaise(amount) : "—",
        money: incoming ? "—" : formatPaise(amount),
        balance: incoming ? "Money In" : "Money Out",
        detail: `${payment.partyName} · ${payment.reference}`,
      });
    }
    if (method === "cashPaise" || method === "bankPaise") {
      for (const payment of workspace.expensePayments) {
        if (!inDateRange(payment.occurredAt, from, to)) continue;
        const amount =
          method === "cashPaise"
            ? BigInt(payment.cashPaise)
            : BigInt(payment.bankPaise);
        if (amount === 0n) continue;
        moneyOut += amount;
        rows.push({
          id: `expense-${payment.id}`,
          occurredAt: payment.occurredAt,
          business: "—",
          money: formatPaise(amount),
          balance: "Money Out",
          detail: `${payment.profileName} · ${payment.reference}`,
        });
      }
    }
    return [
      simpleDerivedBook({
        id: `money-${method}`,
        type,
        subtype,
        accountId: null,
        accountKind: null,
        name:
          PARTY_PAYMENT_METHODS.find(([key]) => key === method)?.[1] || "Money",
        typeLabel: "Cash Flow Ledger",
        rows,
        summary: [
          ["Money In", formatPaise(moneyIn)],
          ["Money Out", formatPaise(moneyOut)],
          ["Net Flow", formatPaise(moneyIn - moneyOut)],
        ],
      }),
    ];
  }

  if (type === "pwt") {
    const incoming = subtype === "received";
    const rows = workspace.payments.filter(
      (payment) =>
        inDateRange(payment.occurredAt, from, to) &&
        BigInt(payment.methodSplit.pwtPaise || "0") > 0n &&
        (incoming
          ? payment.direction === "RECEIPT"
          : payment.direction !== "RECEIPT"),
    );
    const total = sumBigInt(rows.map((p) => p.methodSplit.pwtPaise || "0"));
    return [
      simpleDerivedBook({
        id: `pwt-${subtype}`,
        type,
        subtype,
        accountId: null,
        accountKind: null,
        name: incoming ? "PWT Received" : "PWT Redeemed",
        typeLabel: "PWT / Prize Ledger",
        rows: rows.map((payment) => ({
          id: payment.id,
          occurredAt: payment.occurredAt,
          business: formatPaise(payment.methodSplit.pwtPaise || "0"),
          money: "—",
          balance: incoming ? "Received" : "Redeemed",
          detail: `${payment.partyName} · ${payment.reference}`,
        })),
        summary: [
          ["Entries", rows.length.toString()],
          [incoming ? "Received" : "Redeemed", formatPaise(total)],
          ["PWT", formatPaise(total)],
        ],
      }),
    ];
  }

  const days = new Set<string>();
  for (const sale of [...workspace.sales, ...workspace.draftSales])
    if (inDateRange(sale.occurredAt, from, to)) days.add(dateKey(sale.occurredAt));
  for (const entry of workspace.stockistEntries)
    if (inDateRange(entry.occurredAt, from, to)) days.add(dateKey(entry.occurredAt));
  for (const bill of workspace.customerBills)
    if (inDateRange(bill.occurredAt, from, to)) days.add(dateKey(bill.occurredAt));
  const transactions = [...days]
    .sort()
    .map((day) => {
      const purchase = workspace.stockistEntries
        .filter((entry) => dateKey(entry.occurredAt) === day)
        .reduce((total, entry) => total + BigInt(entry.netPurchaseQuantity), 0n);
      const sellerSale = [...workspace.sales, ...workspace.draftSales]
        .filter((sale) => dateKey(sale.occurredAt) === day)
        .reduce((total, sale) => total + BigInt(sale.netTickets), 0n);
      const customerSale = workspace.customerBills
        .filter((bill) => dateKey(bill.occurredAt) === day)
        .reduce((total, bill) => total + BigInt(bill.quantity), 0n);
      return {
        id: day,
        occurredAt: `${day}T00:00:00.000Z`,
        business: `${purchase} purchase`,
        money: `${sellerSale + customerSale} sold`,
        balance: `${purchase - sellerSale - customerSale} diff`,
        detail: "Stock is checked per business date.",
      };
    });
  const purchase = workspace.stockistEntries
    .filter((entry) => inDateRange(entry.occurredAt, from, to))
    .reduce((total, entry) => total + BigInt(entry.netPurchaseQuantity), 0n);
  const sale =
    [...workspace.sales, ...workspace.draftSales]
      .filter((entry) => inDateRange(entry.occurredAt, from, to))
      .reduce((total, entry) => total + BigInt(entry.netTickets), 0n) +
    workspace.customerBills
      .filter((entry) => inDateRange(entry.occurredAt, from, to))
      .reduce((total, entry) => total + BigInt(entry.quantity), 0n);
  return [
    simpleDerivedBook({
      id: "stock-summary",
      type,
      subtype: "stock",
      accountId: null,
      accountKind: null,
      name: "Lottery Stock",
      typeLabel: "Stock Ledger",
      rows: transactions,
      summary: [
        ["Net Purchase", purchase.toString()],
        ["Net Sale", sale.toString()],
        ["Difference", (purchase - sale).toString()],
      ],
    }),
  ];
}

function simpleDerivedBook({
  id,
  type,
  subtype,
  accountId,
  accountKind,
  name,
  typeLabel,
  rows,
  summary,
}: {
  id: string;
  type: LedgerBookType;
  subtype: string;
  accountId: string | null;
  accountKind: "party" | "expense" | null;
  name: string;
  typeLabel: string;
  rows: LedgerTxn[];
  summary: Array<[string, string]>;
}): LedgerBook {
  return {
    id,
    category: type,
    subtype,
    accountId,
    accountKind,
    name,
    typeLabel,
    summary,
    transactions: rows,
  };
}

function LedgerStatement({
  book,
  bounds,
  onBack,
  onEdit,
}: Readonly<{
  book: LedgerBook;
  bounds: { from: string; to: string };
  onBack: () => void;
  onEdit: () => void;
}>) {
  const editable = Boolean(book.accountKind);
  return (
    <SectionCard
      title={book.name}
      hint={`${displayDate(bounds.from)} → ${displayDate(bounds.to)} · ${book.typeLabel}`}
    >
      <div className="mb-2 flex flex-wrap justify-between gap-2">
        <Button onClick={onBack}>Back</Button>
        {editable && (
          <Button onClick={onEdit}>
            Edit {book.accountKind === "expense" ? "Expense Profile" : "Profile"}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="min-w-[640px] border-collapse text-left text-[9px]">
          <thead className="bg-emerald-50/60 text-[7px] uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Business / Bill</th>
              <th className="px-2 py-2">Paid / Received / TDS</th>
              <th className="px-2 py-2">Balance / Net</th>
              <th className="px-2 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {book.transactions.length ? (
              book.transactions.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-2 py-2">{displayDate(row.occurredAt)}</td>
                  <td className="px-2 py-2">{row.business}</td>
                  <td className="px-2 py-2">{row.money}</td>
                  <td className="px-2 py-2 font-black">{row.balance}</td>
                  <td className="max-w-[230px] whitespace-normal px-2 py-2 text-[8px] text-slate-500">
                    {row.detail}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                  No transaction in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function AiPanel({ workspace }: Readonly<{ workspace: LotteryWorkspace }>) {
  const [period, setPeriod] = useState<LedgerPeriod>("today");
  const today = businessDateToday();
  const bounds = periodBounds(period, today, today);
  const { sellerCommission, stockistCommission, profit } =
    periodBusinessMetrics(workspace, bounds.from, bounds.to);
  const receivable = receivablePriority(workspace, bounds.to).reduce(
    (total, row) => total + row.amountPaise,
    0n,
  );
  const payable = payablePriority(workspace, bounds.to).reduce(
    (total, row) => total + row.amountPaise,
    0n,
  );
  const commissionDifference = stockistCommission - sellerCommission;
  let health = 100;
  if (receivable > 0n) health -= 8;
  if (payable > 0n) health -= 8;
  if (commissionDifference !== 0n) health -= 15;
  if (profit < 0n) health -= 25;

  return (
    <SectionCard
      title="ORBIS AI · Accounting Health"
      hint="This AI surface is limited to this module's accounting data. It does not answer general questions."
    >
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["today", "Today"],
            ["7d", "7 Days"],
            ["10d", "10 Days"],
            ["month", "Month"],
            ["year", "Year"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            active={period === value}
            onClick={() => setPeriod(value)}
            className="shrink-0"
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Profit" value={formatPaise(profit)} />
        <Metric label="Receivable" value={formatPaise(receivable)} tone="blue" />
        <Metric label="Payable" value={formatPaise(payable)} tone="orange" />
        <Metric label="Health Score" value={`${Math.max(0, health)}/100`} tone="violet" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <AiCard
          title="Profit / Loss"
          text={`Selected period result is ${formatPaise(profit)}.`}
        />
        <AiCard
          title="Commission"
          text={
            commissionDifference === 0n
              ? "Gross Seller and Stockist commission are clear."
              : `Mismatch ${formatPaise(
                  commissionDifference < 0n
                    ? -commissionDifference
                    : commissionDifference,
                )}.`
          }
        />
        <AiCard
          title="Receivable"
          text={
            receivable > 0n
              ? `${formatPaise(receivable)} remains to receive.`
              : "No open receivable."
          }
        />
        <AiCard
          title="Payable"
          text={
            payable > 0n
              ? `${formatPaise(payable)} remains to pay.`
              : "No open payable."
          }
        />
      </div>
      <div className="mt-3">
        <InlineNotice>
          Existing verified backend insights remain available:{" "}
          {workspace.insights.map((item) => `${item.skill}: ${item.status}`).join(" · ") ||
            "No insight rows."}
        </InlineNotice>
      </div>
    </SectionCard>
  );
}

function MastersPanel({
  workspace,
  organizationId,
  api,
  working,
  createOrganization,
  run,
}: Readonly<{
  workspace: LotteryWorkspace | null;
  organizationId: string;
  api: LotteryAccountingClient;
  working: string | null;
  createOrganization: (name: string) => Promise<boolean>;
  run: (
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ) => Promise<boolean>;
}>) {
  const [organizationName, setOrganizationName] = useState("");
  const [type, setType] = useState<PartyMasterType | "EXPENSE">("SELLER");
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [partyEditorOpen, setPartyEditorOpen] = useState(false);
  const [partyName, setPartyName] = useState("");
  const [partyPhone, setPartyPhone] = useState("");
  const [partyRate, setPartyRate] = useState("");
  const [expenseCategoryId, setExpenseCategoryId] = useState(
    workspace?.expenseCategories[0]?.id || "",
  );
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryEditId, setCategoryEditId] = useState("");
  const [expenseProfileId, setExpenseProfileId] = useState("");
  const [expenseEditorOpen, setExpenseEditorOpen] = useState(false);
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [tdsPercent, setTdsPercent] = useState(
    ((workspace?.organization.tdsRateBps || 200) / 100).toFixed(2),
  );

  const parties =
    workspace?.parties.filter((party) =>
      type === "STOCKIST"
        ? party.partyType === "STOCKIST" ||
          party.partyType === "SERVICE_STOCKIST"
        : party.partyType === type,
    ) || [];
  const profiles =
    workspace?.expenseProfiles.filter(
      (profile) => profile.categoryId === expenseCategoryId,
    ) || [];

  const populatePartyEditor = useCallback((party: LotteryParty) => {
    setSelectedPartyId(party.id);
    setPartyName(party.name);
    setPartyPhone(party.phone || "");
    setPartyRate(
      BigInt(party.ticketRatePaise) > 0n
        ? paiseInput(BigInt(party.ticketRatePaise))
        : "",
    );
    setPartyEditorOpen(true);
  }, []);

  const populateExpenseEditor = useCallback((profile: LotteryExpenseProfile) => {
    setExpenseProfileId(profile.id);
    setExpenseName(profile.name);
    setExpenseAmount(
      BigInt(profile.usualAmountPaise) > 0n
        ? paiseInput(BigInt(profile.usualAmountPaise))
        : "",
    );
    setExpenseNote(profile.note || "");
    setExpenseEditorOpen(true);
  }, []);

  useEffect(() => {
    if (!workspace) return;
    const partyId = sessionStorage.getItem("orbis-accounting-edit-party");
    if (partyId) {
      sessionStorage.removeItem("orbis-accounting-edit-party");
      const party = workspace.parties.find((item) => item.id === partyId);
      if (party && new Set(["SELLER", "STOCKIST", "CUSTOMER"]).has(party.partyType)) {
        setType(party.partyType as PartyMasterType);
        populatePartyEditor(party);
      }
    }
    const expenseId = sessionStorage.getItem("orbis-accounting-edit-expense");
    if (expenseId) {
      sessionStorage.removeItem("orbis-accounting-edit-expense");
      const profile = workspace.expenseProfiles.find((item) => item.id === expenseId);
      if (profile) {
        setType("EXPENSE");
        setExpenseCategoryId(profile.categoryId);
        populateExpenseEditor(profile);
      }
    }
  }, [populateExpenseEditor, populatePartyEditor, workspace]);

  if (!workspace) {
    return (
      <SectionCard title="Create your first accounting workspace">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (organizationName.trim())
              void createOrganization(organizationName.trim());
          }}
        >
          <input
            aria-label="Business organization name"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            className={`${CONTROL} flex-1`}
            placeholder="Business name"
          />
          <button className={ACTIVE_BUTTON} type="submit">
            Create
          </button>
        </form>
      </SectionCard>
    );
  }

  const openNewParty = () => {
    setSelectedPartyId("");
    setPartyName("");
    setPartyPhone("");
    setPartyRate("");
    setPartyEditorOpen(true);
  };
  const openParty = populatePartyEditor;
  const saveParty = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ticketRatePaise =
      type === "CUSTOMER" ? "0" : parseAmount(partyRate)?.toString();
    if (!partyName.trim() || (type !== "CUSTOMER" && !ticketRatePaise)) return;
    if (selectedPartyId) {
      const ok = await run(
        "party-profile",
        () =>
          api.updatePartyProfile({
            organizationId,
            partyId: selectedPartyId,
            name: partyName.trim(),
            phone: partyPhone.trim() || undefined,
            ticketRatePaise: ticketRatePaise || "0",
          }),
        "Party profile updated.",
      );
      if (ok) setPartyEditorOpen(false);
    } else {
      const ok = await run(
        "party",
        () =>
          api.createParty({
            organizationId,
            partyType: type,
            name: partyName.trim(),
            phone: partyPhone.trim() || undefined,
            ticketRatePaise: ticketRatePaise || "0",
          }),
        "New party added.",
      );
      if (ok) setPartyEditorOpen(false);
    }
  };

  const saveCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    const ok = categoryEditId
      ? await run(
          "expense-category",
          () =>
            api.updateExpenseCategory(categoryEditId, {
              organizationId,
              name: categoryName.trim(),
            }),
          "Expense category updated.",
        )
      : await run(
          "expense-category",
          () =>
            api.createExpenseCategory({
              organizationId,
              name: categoryName.trim(),
            }),
          "Expense category added.",
        );
    if (ok) {
      setCategoryEditorOpen(false);
      setCategoryEditId("");
      setCategoryName("");
    }
  };

  const openExpense = populateExpenseEditor;
  const saveExpense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!expenseCategoryId || !expenseName.trim()) return;
    const payload = {
      organizationId,
      categoryId: expenseCategoryId,
      name: expenseName.trim(),
      usualAmountPaise: (parseAmount(expenseAmount) || 0n).toString(),
      note: expenseNote.trim() || undefined,
    };
    const ok = expenseProfileId
      ? await run(
          "expense-profile",
          () => api.updateExpenseProfile(expenseProfileId, payload),
          "Expense profile updated.",
        )
      : await run(
          "expense-profile",
          () => api.createExpenseProfile(payload),
          "Expense profile added.",
        );
    if (ok) {
      setExpenseEditorOpen(false);
      setExpenseProfileId("");
      setExpenseName("");
      setExpenseAmount("");
      setExpenseNote("");
    }
  };

  return (
    <div className="space-y-3">
      <SectionCard
        title="Masters"
        hint="Choose one specification. The list stays simple; tap a name to open its editor."
      >
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ["SELLER", "Seller"],
              ["STOCKIST", "Stockist"],
              ["CUSTOMER", "Customer"],
              ["EXPENSE", "Expenses"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              active={type === value}
              className="shrink-0"
              onClick={() => {
                setType(value);
                setPartyEditorOpen(false);
                setExpenseEditorOpen(false);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </SectionCard>

      {type !== "EXPENSE" ? (
        <SectionCard
          title={`${type === "SELLER" ? "Seller" : type === "STOCKIST" ? "Stockist" : "Customer"} Profiles`}
        >
          <div className="mb-2 flex justify-end">
            <Button active onClick={openNewParty}>
              + Add {type === "SELLER" ? "Seller" : type === "STOCKIST" ? "Stockist" : "Customer"}
            </Button>
          </div>
          {partyEditorOpen && (
            <form
              className="mb-3 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-orange-50 p-3"
              onSubmit={(event) => void saveParty(event)}
            >
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Party name"
                  value={partyName}
                  onChange={(event) => setPartyName(event.target.value)}
                  className={`${CONTROL} col-span-2`}
                  placeholder="Name"
                />
                {type !== "CUSTOMER" && (
                  <input
                    aria-label="Party fixed rate"
                    value={partyRate}
                    onChange={(event) => setPartyRate(event.target.value)}
                    inputMode="decimal"
                    className={CONTROL}
                    placeholder="Fixed rate ₹"
                  />
                )}
                <input
                  aria-label="Party phone"
                  value={partyPhone}
                  onChange={(event) => setPartyPhone(event.target.value)}
                  className={type === "CUSTOMER" ? `${CONTROL} col-span-2` : CONTROL}
                  placeholder="Phone optional"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <button className={ACTIVE_BUTTON} type="submit">
                  {selectedPartyId ? "Save Changes" : "Save"}
                </button>
                <Button onClick={() => setPartyEditorOpen(false)}>Close</Button>
              </div>
            </form>
          )}
          <div className="divide-y divide-slate-100 border-y border-slate-100">
            {parties.map((party) => (
              <button
                key={party.id}
                type="button"
                onClick={() => openParty(party)}
                className="flex w-full items-center justify-between gap-3 bg-white px-2 py-3 text-left"
              >
                <span className="text-[10px] font-black">{party.name}</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            ))}
          </div>
        </SectionCard>
      ) : (
        <SectionCard
          title="Expenses"
          hint="Expenses → Category → Profile/Name. Both Category and Profile can be added or edited."
        >
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-orange-50/60 p-3">
            <p className="text-[7px] font-black uppercase text-slate-500">Top Type</p>
            <p className="mt-1 text-sm font-black">Expenses</p>
            <label className="mt-2 block">
              <span className="text-[8px] font-bold text-slate-500">Category</span>
              <ExpenseCategorySelect
                ariaLabel="Expense master category"
                categories={workspace.expenseCategories}
                value={expenseCategoryId}
                onChange={(value) => {
                  setExpenseCategoryId(value);
                  setExpenseEditorOpen(false);
                }}
              />
            </label>
            <div className="mt-2 flex gap-2">
              <Button
                active
                onClick={() => {
                  setCategoryEditId("");
                  setCategoryName("");
                  setCategoryEditorOpen(true);
                }}
              >
                + Add Category
              </Button>
              <Button
                onClick={() => {
                  const category = workspace.expenseCategories.find(
                    (item) => item.id === expenseCategoryId,
                  );
                  if (!category) return;
                  setCategoryEditId(category.id);
                  setCategoryName(category.name);
                  setCategoryEditorOpen(true);
                }}
              >
                Edit Category
              </Button>
            </div>
          </div>

          {categoryEditorOpen && (
            <form
              className="mt-3 rounded-2xl border border-emerald-100 bg-white p-3"
              onSubmit={(event) => void saveCategory(event)}
            >
              <input
                aria-label="Expense category name"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                className={CONTROL}
                placeholder="Category name"
              />
              <div className="mt-2 flex gap-2">
                <button className={ACTIVE_BUTTON} type="submit">
                  Save Category
                </button>
                <Button onClick={() => setCategoryEditorOpen(false)}>Close</Button>
              </div>
            </form>
          )}

          <div className="mt-3 flex justify-end">
            <Button
              active
              onClick={() => {
                setExpenseProfileId("");
                setExpenseName("");
                setExpenseAmount("");
                setExpenseNote("");
                setExpenseEditorOpen(true);
              }}
            >
              + Add Profile
            </Button>
          </div>

          {expenseEditorOpen && (
            <form
              className="mt-2 rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/50 p-3"
              onSubmit={(event) => void saveExpense(event)}
            >
              <div className="grid grid-cols-2 gap-2">
                <input
                  aria-label="Expense profile name"
                  value={expenseName}
                  onChange={(event) => setExpenseName(event.target.value)}
                  className={`${CONTROL} col-span-2`}
                  placeholder="e.g. Raju"
                />
                <input
                  aria-label="Expense usual amount"
                  value={expenseAmount}
                  onChange={(event) => setExpenseAmount(event.target.value)}
                  inputMode="decimal"
                  className={CONTROL}
                  placeholder="Usual amount ₹"
                />
                <input
                  aria-label="Expense profile note"
                  value={expenseNote}
                  onChange={(event) => setExpenseNote(event.target.value)}
                  className={CONTROL}
                  placeholder="Note optional"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <button className={ACTIVE_BUTTON} type="submit">
                  Save Profile
                </button>
                <Button onClick={() => setExpenseEditorOpen(false)}>Close</Button>
              </div>
            </form>
          )}

          <div className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => openExpense(profile)}
                className="flex w-full items-center justify-between bg-white px-2 py-3 text-left"
              >
                <span className="text-[10px] font-black">{profile.name}</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Global TDS Rule"
        hint="New entries use the current TDS. Historical seller/stockist rows keep their saved TDS snapshot."
      >
        <div className="flex gap-2">
          <input
            aria-label="Global TDS percentage"
            inputMode="decimal"
            value={tdsPercent}
            onChange={(event) => setTdsPercent(event.target.value)}
            className={CONTROL}
          />
          <button
            type="button"
            disabled={working === "tds"}
            onClick={() => {
              const rate = Number(tdsPercent);
              if (!Number.isFinite(rate) || rate < 0 || rate > 100) return;
              void run(
                "tds",
                () =>
                  api.updateOrganizationTdsRate({
                    organizationId,
                    tdsRateBps: Math.round(rate * 100),
                  }),
                "TDS rule updated for new entries.",
              );
            }}
            className={ACTIVE_BUTTON}
          >
            Save TDS
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
