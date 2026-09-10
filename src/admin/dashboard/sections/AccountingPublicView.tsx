import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  CircleUserRound,
  Info,
  MoreVertical,
  Radio,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type {
  LotteryAccountingClient,
  LotteryAccountingReadClient,
} from "../../models/lotteryAccountingClient";
import { lotteryAccountingDemoClient } from "../../models/lotteryAccountingDemoClient";
import type { ManagedProductModelVersion } from "../../models/types";
import {
  LotteryAccountingWorkspace,
  type LotteryAccountingWorkspaceNavigationRequest,
  type LotteryAccountingWorkspaceTab,
} from "./LotteryAccountingWorkspace";
import { AccountingAppearanceSelector } from "./AccountingAppearanceSelector";
import { AccountingLanguageSelector } from "./AccountingLanguageSelector";
import {
  readAccountingAppearance,
  type AccountingAppearance,
  writeAccountingAppearance,
} from "./accountingAppearance";
import {
  accountingHtmlLang,
  accountingText,
  readAccountingLanguage,
  type AccountingLanguage,
  writeAccountingLanguage,
  accountingGreetingForHour,
} from "./accountingI18n";
import "./accountingPublicTheme.css";

export type AccountingPublicViewMode = "PREVIEW" | "LIVE";

const ADMIN_DEMO_LOCAL_SCOPE = {
  ownerKind: "ADMIN_DEMO",
  ownerId: "accounting-demo",
} as const;

interface AccountingPublicViewProps {
  mode: AccountingPublicViewMode;
  version: ManagedProductModelVersion | null;
  demoApi?: LotteryAccountingReadClient;
  onBack: () => void;
  viewerName?: string | null;
}

function blockedMutation<T>(message: string): Promise<T> {
  return Promise.reject(new Error(message));
}

function createReadOnlyClient(
  source: LotteryAccountingReadClient,
  blockedMessage: string,
): LotteryAccountingClient {
  const blocked = <T,>() => blockedMutation<T>(blockedMessage);
  return {
    listOrganizations: () => source.listOrganizations(),
    loadWorkspace: (organizationId) => source.loadWorkspace(organizationId),
    createOrganization: blocked,
    createParty: blocked,
    updatePartyProfile: blocked,
    updateOrganizationTdsRate: blocked,
    updateUserLedgerStorage: blocked,
    createPeriod: blocked,
    createFinancialYearPeriod: blocked,
    recordStockMovement: blocked,
    saveDailyStockistEntry: blocked,
    clearDailyEntries: blocked,
    previewSale: blocked,
    recordSale: blocked,
    saveDailySellerDraft: blocked,
    updateDailySellerDraft: blocked,
    deleteDailySellerDraft: blocked,
    postDailySellerDraft: blocked,
    correctPostedSale: blocked,
    recordPayment: blocked,
    createExpenseCategory: blocked,
    updateExpenseCategory: blocked,
    createExpenseProfile: blocked,
    updateExpenseProfile: blocked,
    recordExpenseBill: blocked,
    recordExpensePayment: blocked,
    recordCustomerBill: blocked,
    recordSettlement: blocked,
  };
}

function versionLabel(
  version: ManagedProductModelVersion | null,
  language: AccountingLanguage,
): string {
  return version
    ? `v${version.sequence}`
    : accountingText(language, "version.notPublished");
}

export function AccountingPublicView({
  mode,
  version,
  demoApi = lotteryAccountingDemoClient,
  onBack,
  viewerName = null,
}: Readonly<AccountingPublicViewProps>) {
  const [appearance, setAppearance] = useState<AccountingAppearance>(() =>
    readAccountingAppearance(),
  );
  const [language, setLanguage] = useState<AccountingLanguage>(() =>
    readAccountingLanguage(),
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerContext, setDrawerContext] = useState<
    "menu" | "notifications" | "profile"
  >("menu");
  const [navigationRequest, setNavigationRequest] =
    useState<LotteryAccountingWorkspaceNavigationRequest | null>(null);

  const readOnlyApi = useMemo(
    () =>
      createReadOnlyClient(
        demoApi,
        accountingText(language, "public.readOnlyBlocked"),
      ),
    [demoApi, language],
  );
  const isPreview = mode === "PREVIEW";
  const inspectionLabel = isPreview
    ? "Publish Preview"
    : "Published Live Inspection";
  const isClassic = appearance === "CLASSIC";

  const selectAppearance = (next: AccountingAppearance) => {
    setAppearance(next);
    writeAccountingAppearance(next);
  };

  const selectLanguage = (next: AccountingLanguage) => {
    setLanguage(next);
    writeAccountingLanguage(next);
  };

  const openDrawer = (context: "menu" | "notifications" | "profile") => {
    setDrawerContext(context);
    setDrawerOpen(true);
  };

  const navigateWorkspace = (
    tab: LotteryAccountingWorkspaceTab,
    ledgerView?: "party",
  ) => {
    setNavigationRequest((current) => ({
      id: (current?.id ?? 0) + 1,
      tab,
      ledgerView,
    }));
    setDrawerOpen(false);
  };

  const displayName = viewerName?.trim() || "";
  const greeting = accountingGreetingForHour(
    language,
    new Date().getHours(),
  );
  const dashboardGreeting = (
    <section
      className="orbis-public-greeting"
      aria-label={accountingText(language, "greeting.aria")}
    >
      <div className="orbis-public-greeting-glow" aria-hidden="true" />
      <div className="relative z-[1] flex items-center gap-2.5">
        <span className="orbis-public-greeting-mark" aria-hidden="true">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="orbis-public-greeting-kicker">
            {accountingText(language, "greeting.kicker")}
          </p>
          <h3 className="orbis-public-greeting-title">
            {greeting}
            {displayName ? `, ${displayName}` : ""}
          </h3>
          <p className="orbis-public-greeting-copy">
            {accountingText(language, "greeting.companion")}
          </p>
        </div>
      </div>
    </section>
  );

  if (!version) {
    return (
      <section
        className="space-y-3"
        aria-label={accountingText(language, "public.liveUnavailable")}
        lang={accountingHtmlLang(language)}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to ORBIS Accounting"
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-[10px] font-bold text-slate-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to ORBIS Accounting
        </button>
        <div className="rounded-[22px] border border-orange-100 bg-orange-50/70 p-4 text-xs leading-relaxed text-orange-800">
          {accountingText(language, "public.liveUnavailableMessage")}
        </div>
      </section>
    );
  }

  const publicMenuItems: Array<
    [LotteryAccountingWorkspaceTab, string, React.ReactNode]
  > = [
    ["dashboard", "Dashboard", <Sparkles key="dashboard" className="h-4 w-4" />],
    ["daily", "Daily entry", <BookOpen key="daily" className="h-4 w-4" />],
    ["payment", "Payment", <CircleUserRound key="payment" className="h-4 w-4" />],
    ["ledger", "Ledger", <BookOpen key="ledger" className="h-4 w-4" />],
    ["ai", "AI", <Sparkles key="ai" className="h-4 w-4" />],
    ["masters", "Masters", <Users key="masters" className="h-4 w-4" />],
  ];

  return (
    <section
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#F8FAFC]"
      data-testid="accounting-public-viewport"
      aria-label={inspectionLabel}
      lang={accountingHtmlLang(language)}
    >
      {isClassic ? (
        <div className="min-h-dvh space-y-3 p-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to ORBIS Accounting"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-[10px] font-bold text-slate-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to ORBIS Accounting
          </button>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <AccountingLanguageSelector
              value={language}
              onChange={selectLanguage}
            />
            <AccountingAppearanceSelector
              value={appearance}
              onChange={selectAppearance}
              language={language}
            />
          </div>
          <div
            data-testid="accounting-public-shell"
            data-accounting-appearance={appearance}
          >
            <LotteryAccountingWorkspace
              api={readOnlyApi}
              dashboardGreeting={dashboardGreeting}
              localScope={ADMIN_DEMO_LOCAL_SCOPE}
            />
          </div>
        </div>
      ) : (
        <div
          className="orbis-accounting-public-shell orbis-public-viewport-shell"
          data-accounting-appearance={appearance}
          data-testid="accounting-public-shell"
        >
          <header className="orbis-public-app-header">
            <div className="relative z-[1] flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  className="orbis-public-icon-button"
                  aria-label="Back to ORBIS Accounting"
                  onClick={onBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="orbis-public-logo">O</span>
                <div className="min-w-0">
                  <p className="text-[7px] font-black uppercase tracking-[0.15em] text-emerald-100">
                    {accountingText(language, "public.accountingEyebrow")}
                  </p>
                  <h2 className="mt-0.5 truncate text-[15px] font-black tracking-tight text-white">
                    {accountingText(language, "public.title")}
                  </h2>
                  <div className="mt-0.5 flex items-center gap-1 text-[8px] font-semibold text-emerald-50/85">
                    <Radio className="h-3 w-3" />
                    <span>
                      {inspectionLabel} · {versionLabel(version, language)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  className="orbis-public-icon-button"
                  aria-label="Notifications"
                  onClick={() => openDrawer("notifications")}
                >
                  <Bell className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="orbis-public-icon-button"
                  aria-label="User profile"
                  onClick={() => openDrawer("profile")}
                >
                  <CircleUserRound className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="orbis-public-icon-button"
                  aria-label="Open public menu"
                  onClick={() => openDrawer("menu")}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="orbis-public-greeting-slot">{dashboardGreeting}</div>

          <div className="orbis-signature-workspace">
            <LotteryAccountingWorkspace
              api={readOnlyApi}
              navigationRequest={navigationRequest}
              localScope={ADMIN_DEMO_LOCAL_SCOPE}
            />
          </div>

          {drawerOpen && (
            <div
              className="orbis-public-drawer-backdrop"
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setDrawerOpen(false);
                }
              }}
            >
              <aside
                className="orbis-public-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Accounting public menu"
              >
                <div className="orbis-public-drawer-header">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.14em] text-emerald-600">
                      ORBiS Accounting
                    </p>
                    <h3 className="mt-1 text-base font-black text-slate-950">
                      Public menu
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="orbis-public-drawer-close"
                    aria-label="Close public menu"
                    onClick={() => setDrawerOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {drawerContext === "notifications" && (
                  <div className="orbis-public-drawer-note">
                    <Bell className="h-4 w-4" />
                    <span>No new notifications.</span>
                  </div>
                )}

                <section
                  className="orbis-public-profile-card"
                  aria-label="User profile summary"
                >
                  <span className="orbis-public-profile-avatar" aria-hidden="true">
                    <CircleUserRound className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-black text-slate-950">
                      {displayName || "Public user"}
                    </p>
                    <p className="mt-0.5 text-[8px] leading-relaxed text-slate-500">
                      {drawerContext === "profile"
                        ? "Signed-in profile details stay connected to the ORBiS account."
                        : "User profile"}
                    </p>
                  </div>
                </section>

                <section className="orbis-public-drawer-section">
                  <div className="mb-2 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-emerald-700" />
                    <h4 className="text-[10px] font-black text-slate-900">
                      Quick access
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {publicMenuItems.map(([tab, label, icon]) => (
                      <button
                        key={tab}
                        type="button"
                        className="orbis-public-menu-item"
                        onClick={() => navigateWorkspace(tab)}
                      >
                        {icon}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="orbis-public-party-ledger"
                    onClick={() => navigateWorkspace("ledger", "party")}
                  >
                    <Users className="h-4 w-4" />
                    <span>Party Ledger</span>
                  </button>
                </section>

                <section
                  className="orbis-public-drawer-section"
                  aria-label="Public settings"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Settings className="h-4 w-4 text-emerald-700" />
                    <h4 className="text-[10px] font-black text-slate-900">
                      Settings
                    </h4>
                  </div>
                  <div className="orbis-public-settings-controls space-y-2">
                    <AccountingLanguageSelector
                      value={language}
                      onChange={selectLanguage}
                    />
                    <AccountingAppearanceSelector
                      value={appearance}
                      onChange={selectAppearance}
                      language={language}
                    />
                  </div>
                </section>

                <section
                  className="orbis-public-version-card"
                  aria-label="Version information"
                >
                  <Info className="h-4 w-4 text-emerald-700" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-black text-slate-900">
                      Version information
                    </p>
                    <p className="mt-1 text-[8px] leading-relaxed text-slate-500">
                      {versionLabel(version, language)} · {inspectionLabel}
                    </p>
                  </div>
                </section>
              </aside>
            </div>
          )}
        </div>
      )}
    </section>
  );
}