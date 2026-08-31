import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { DailySellerEntry } from "./DailySellerEntry";
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
import type {
  LotteryOrganization,
  LotteryPartyType,
  LotteryWorkspace,
} from "../../models/lotteryAccountingTypes";

type WorkspaceTab =
  "dashboard" | "setup" | "seller" | "entry" | "records" | "analysis";
type EntryKind = "stock" | "payment" | "settlement";

const WORKSPACE_TABS: Array<[WorkspaceTab, string]> = [
  ["dashboard", "Dashboard"],
  ["setup", "Setup"],
  ["seller", "Daily sellers"],
  ["entry", "Data entry"],
  ["records", "Records"],
  ["analysis", "AI analysis"],
];

const ENTRY_KINDS: Array<[EntryKind, string]> = [
  ["stock", "Stock"],
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

function paiseToRupeesInput(value: string) {
  const paise = BigInt(value);
  return `${paise / 100n}.${(paise % 100n).toString().padStart(2, "0")}`;
}

function partyListLabel(party: LotteryWorkspace["parties"][number]) {
  const identity = `${party.name} · ${party.partyType.replace(/_/g, " ")}`;
  if (party.partyType !== "SELLER") return identity;
  return [
    identity,
    `${formatPaise(party.ticketRatePaise)} / ticket`,
  ].join(" · ");
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
  const [entryKind, setEntryKind] = useState<EntryKind>("stock");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
              Enter real records, inspect the immutable ledger, then review the
              model before any public publish.
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
            <DailySellerEntry
              organizationId={organizationId}
              workspace={workspace}
              busy={Boolean(workingAction)}
              onSaveDraft={(payload) =>
                runAction(
                  "daily-seller-draft",
                  () => api.saveDailySellerDraft(payload),
                  "Daily seller draft saved. You can still edit or delete it.",
                )
              }
              onUpdateDraft={(saleId, payload) =>
                runAction(
                  `daily-seller-draft-${saleId}`,
                  () => api.updateDailySellerDraft(saleId, payload),
                  "Daily seller draft updated.",
                )
              }
              onPostDraft={(saleId) =>
                runAction(
                  `daily-seller-post-${saleId}`,
                  () => api.postDailySellerDraft(saleId, { organizationId }),
                  "Daily seller entry posted with stock and ledger audit rows.",
                )
              }
              onDeleteDraft={(saleId) =>
                runAction(
                  `daily-seller-delete-${saleId}`,
                  () => api.deleteDailySellerDraft(saleId, { organizationId }),
                  "Daily seller draft deleted before posting.",
                )
              }
              onCorrectPosted={(saleId) =>
                runAction(
                  `daily-seller-correct-${saleId}`,
                  () => api.correctPostedSale(saleId, { organizationId }),
                  "Posted entry reversed safely; a replacement draft is ready to edit.",
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
            />
          )}
          {tab === "entry" && (
            <EntryPanel
              workspace={workspace}
              organizationId={organizationId}
              entryKind={entryKind}
              setEntryKind={setEntryKind}
              workingAction={workingAction}
              onStock={(payload) =>
                runAction(
                  "stock",
                  () => api.recordStockMovement(payload),
                  "Stock movement posted. The audit trail is updated.",
                )
              }
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
          {tab === "records" && <RecordsPanel workspace={workspace} />}
          {tab === "analysis" && <AnalysisPanel workspace={workspace} />}
        </>
      )}
    </section>
  );
}

function DashboardPanel({
  workspace,
}: Readonly<{ workspace: LotteryWorkspace }>) {
  const { summary } = workspace;
  return (
    <div className="space-y-3">
      <WorkspaceCard title={`${workspace.organization.name} overview`}>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Closing stock" value={summary.stock.closing} />
          <Metric
            label="Gross sales"
            value={formatPaise(summary.grossSalesPaise)}
          />
          <Metric
            label="Collected"
            value={formatPaise(summary.collectedPaise)}
          />
          <Metric
            label="Outstanding"
            value={formatPaise(summary.outstandingPaise)}
            tone={BigInt(summary.outstandingPaise) > 0n ? "orange" : "emerald"}
          />
          <Metric
            label="Net cash flow"
            value={formatPaise(summary.netCashFlowPaise)}
          />
          <Metric
            label="Operating result"
            value={formatPaise(summary.operatingResultPaise)}
          />
        </div>
      </WorkspaceCard>
      <WorkspaceCard title="Before you publish the model">
        <ol className="space-y-2 text-[10px] text-slate-600">
          <li>
            <strong>1.</strong> Setup party and accounting period.
          </li>
          <li>
            <strong>2.</strong> Use Daily sellers for dispatch, three return
            times and draft review; use Data entry for stock, payment and
            settlement.
          </li>
          <li>
            <strong>3.</strong> Check Records and AI analysis from verified
            totals.
          </li>
          <li>
            <strong>4.</strong> Go back to Test & Review, then decide whether to
            publish.
          </li>
        </ol>
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
  onCreateFinancialYearPeriod,
  workingAction,
}: Readonly<{
  workspace: LotteryWorkspace | null;
  organizationId: string;
  onCreateOrganization: (name: string) => Promise<boolean>;
  onCreateParty: (payload: Record<string, unknown>) => Promise<boolean>;
  onUpdatePartyProfile: (payload: Record<string, unknown>) => Promise<boolean>;
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
    if (partyType === "SELLER" && (!ticketRatePaise || ticketRatePaise === "0")) {
      setLocalError(
        "Seller needs a fixed ticket rate.",
      );
      return;
    }
    setLocalError(null);
    if (
      await onCreateParty({
        organizationId,
        name: partyName.trim(),
        partyType,
        phone: phone.trim() || undefined,
        ...(partyType === "SELLER"
          ? { ticketRatePaise }
          : {}),
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
    if (!profilePartyId || !ticketRatePaise || ticketRatePaise === "0") {
      setLocalError(
        "Select a seller and enter its fixed rate.",
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
          <WorkspaceCard title="Parties">
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
                  <input
                    id="lottery-party-phone"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className={CONTROL_CLASS}
                  />
                </div>
                {partyType === "SELLER" && (
                  <>
                    <div>
                      <Label htmlFor="lottery-party-ticket-rate">
                        Fixed ticket rate (₹)
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
                  </>
                )}
              </div>
              <SubmitButton busy={workingAction === "party"}>
                Save party
              </SubmitButton>
            </form>
            <EntityList
              items={workspace.parties.map(partyListLabel)}
              empty="No party added yet."
            />
          </WorkspaceCard>

          <WorkspaceCard title="Update a seller fixed rate">
            <form
              className="space-y-3"
              onSubmit={(event) => void submitPartyProfile(event)}
            >
              <div>
                <Label htmlFor="lottery-party-profile">Seller</Label>
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
                  <option value="">Select seller</option>
                  {workspace.parties
                    .filter((party) => party.partyType === "SELLER")
                    .map((party) => (
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
                Commission is entered on each sale. TDS is controlled once from
                the Daily sellers screen for every seller in this workspace.
              </p>
              <SubmitButton busy={workingAction === "party-profile"}>
                Save fixed rate
              </SubmitButton>
            </form>
          </WorkspaceCard>

          <WorkspaceCard title="Financial year periods">
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
                Create / select financial year
              </SubmitButton>
            </form>
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
  onStock,
  onPayment,
  onSettlement,
}: Readonly<{
  workspace: LotteryWorkspace;
  organizationId: string;
  entryKind: EntryKind;
  setEntryKind: (value: EntryKind) => void;
  workingAction: string | null;
  onStock: (payload: Record<string, unknown>) => Promise<boolean>;
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
      {entryKind === "stock" && (
        <StockForm
          organizationId={organizationId}
          busy={workingAction === "stock"}
          onSubmit={onStock}
        />
      )}
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

function StockForm({
  organizationId,
  busy,
  onSubmit,
}: Readonly<{
  organizationId: string;
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<boolean>;
}>) {
  const [type, setType] = useState("RECEIPT");
  const [quantity, setQuantity] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayInputValue());
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^-?\d+$/.test(quantity) || Number(quantity) === 0) {
      setError("Enter a non-zero quantity.");
      return;
    }
    setError(null);
    if (
      await onSubmit({
        organizationId,
        type,
        quantity,
        occurredAt,
      })
    ) {
      setQuantity("");
    }
  };
  return (
    <WorkspaceCard title="Stock receipt, return or adjustment">
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="lottery-stock-type">Movement</Label>
            <select
              id="lottery-stock-type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className={CONTROL_CLASS}
            >
              {["RECEIPT", "DISPATCH", "RETURN", "ADJUSTMENT"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="lottery-stock-quantity">Quantity</Label>
            <input
              id="lottery-stock-quantity"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={CONTROL_CLASS}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="lottery-stock-date">Date</Label>
          <input
            id="lottery-stock-date"
            type="date"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            className={CONTROL_CLASS}
          />
        </div>
        <p className="text-[9px] leading-relaxed text-slate-500">
          The server creates the stock bill reference automatically. Posted
          stock is immutable. Use a new <strong>ADJUSTMENT</strong> entry with
          its own reference to correct stock; never overwrite history.
        </p>
        <InlineError message={error} />
        <SubmitButton busy={busy}>Post stock movement</SubmitButton>
      </form>
    </WorkspaceCard>
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

function RecordsPanel({
  workspace,
}: Readonly<{ workspace: LotteryWorkspace }>) {
  return (
    <div className="space-y-3">
      <WorkspaceCard title="Posted records are immutable">
        <p className="text-[10px] leading-relaxed text-slate-600">
          There are no edit or delete controls for posted financial rows. Keep
          the audit trail intact: use <strong>Correct</strong> in Daily sellers
          to create the reversal and a replacement draft safely.
        </p>
      </WorkspaceCard>
      <WorkspaceCard title="Sales">
        {workspace.sales.length ? (
          <RecordList
            rows={workspace.sales.map((sale) => ({
              key: sale.id,
              title: `${sale.reference} · ${sale.partyName}`,
              subtitle: `${displayDate(sale.occurredAt)} · return M/D/E ${sale.morningReturnQuantity}/${sale.dayReturnQuantity}/${sale.eveningReturnQuantity} · net ${sale.netTickets} · due ${formatPaise(sale.outstandingPaise)}`,
              amount: formatPaise(sale.netPayablePaise),
            }))}
          />
        ) : (
          <EmptyState>No sale posted yet.</EmptyState>
        )}
      </WorkspaceCard>
      <WorkspaceCard title="Payments">
        {workspace.payments.length ? (
          <RecordList
            rows={workspace.payments.map((payment) => ({
              key: payment.id,
              title: `${payment.reference} · ${payment.direction}`,
              subtitle: `${payment.partyName} · available ${formatPaise(payment.availablePaise)}`,
              amount: formatPaise(payment.totalAmountPaise),
            }))}
          />
        ) : (
          <EmptyState>No payment posted yet.</EmptyState>
        )}
      </WorkspaceCard>
      <WorkspaceCard title="Stock movements">
        {workspace.stockMovements.length ? (
          <RecordList
            rows={workspace.stockMovements.map((movement) => ({
              key: movement.id,
              title: `${movement.reference} · ${movement.movementType}`,
              subtitle: displayDate(movement.occurredAt),
              amount: movement.quantity,
            }))}
          />
        ) : (
          <EmptyState>No stock movement posted yet.</EmptyState>
        )}
      </WorkspaceCard>
      <WorkspaceCard title="Balanced ledger">
        {workspace.ledgerEntries.length ? (
          <RecordList
            rows={workspace.ledgerEntries.map((entry) => ({
              key: entry.id,
              title: `${entry.accountCode.replace(/_/g, " ")} · ${entry.side}`,
              subtitle: `${entry.sourceType.replace(/_/g, " ")} · line ${entry.lineNumber}`,
              amount: formatPaise(entry.amountPaise),
            }))}
          />
        ) : (
          <EmptyState>
            Ledger entries appear after sale or payment posting.
          </EmptyState>
        )}
      </WorkspaceCard>
      <WorkspaceCard title="Audit trail">
        {workspace.auditEvents.length ? (
          <RecordList
            rows={workspace.auditEvents.map((event) => ({
              key: event.id,
              title: friendlyEvent(event.eventType),
              subtitle: `${event.entityType.toLowerCase()} · ${displayDate(event.createdAt)}`,
              amount: "Recorded",
            }))}
          />
        ) : (
          <EmptyState>No audit events yet.</EmptyState>
        )}
      </WorkspaceCard>
    </div>
  );
}

function RecordList({
  rows,
}: Readonly<{
  rows: Array<{ key: string; title: string; subtitle: string; amount: string }>;
}>) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.key}
          className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
        >
          <span className="min-w-0">
            <strong className="block text-[10px] capitalize text-slate-800">
              {row.title}
            </strong>
            <span className="mt-1 block text-[9px] text-slate-500">
              {row.subtitle}
            </span>
          </span>
          <strong className="shrink-0 text-[10px] text-slate-800">
            {row.amount}
          </strong>
        </li>
      ))}
    </ul>
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
