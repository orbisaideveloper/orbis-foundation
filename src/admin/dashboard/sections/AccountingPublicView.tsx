import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  CircleUserRound,
  Eye,
  Info,
  MoreVertical,
  Radio,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  lotteryAccountingClient,
  type LotteryAccountingClient,
} from "../../models/lotteryAccountingClient";
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

interface AccountingPublicViewProps {
  mode: AccountingPublicViewMode;
  version: ManagedProductModelVersion | null;
  api?: LotteryAccountingClient;
  onBack: () => void;
  viewerName?: string | null;
}

function blockedMutation<T>(message: string): Promise<T> {
  return Promise.reject(new Error(message));
}

function createReadOnlyClient(
  source: LotteryAccountingClient,
  blockedMessage: string,
): LotteryAccountingClient {
  return {
    ...source,
    createOrganization: () => blockedMutation(blockedMessage),
    createParty: () => blockedMutation(blockedMessage),
    updatePartyProfile: () => blockedMutation(blockedMessage),
    updateOrganizationTdsRate: () => blockedMutation(blockedMessage),
    updateUserLedgerStorage: () => blockedMutation(blockedMessage),
    createPeriod: () => blockedMutation(blockedMessage),
    createFinancialYearPeriod: () => blockedMutation(blockedMessage),
    recordStockMovement: () => blockedMutation(blockedMessage),
    saveDailyStockistEntry: () => blockedMutation(blockedMessage),
    clearDailyEntries: () => blockedMutation(blockedMessage),
    recordSale: () => blockedMutation(blockedMessage),
    saveDailySellerDraft: () => blockedMutation(blockedMessage),
    updateDailySellerDraft: () => blockedMutation(blockedMessage),
    deleteDailySellerDraft: () => blockedMutation(blockedMessage),
    postDailySellerDraft: () => blockedMutation(blockedMessage),
    correctPostedSale: () => blockedMutation(blockedMessage),
    recordPayment: () => blockedMutation(blockedMessage),
    createExpenseCategory: () => blockedMutation(blockedMessage),
    updateExpenseCategory: () => blockedMutation(blockedMessage),
    createExpenseProfile: () => blockedMutation(blockedMessage),
    updateExpenseProfile: () => blockedMutation(blockedMessage),
    recordExpenseBill: () => blockedMutation(blockedMessage),
    recordExpensePayment: () => blockedMutation(blockedMessage),
    recordCustomerBill: () => blockedMutation(blockedMessage),
    recordSettlement: () => blockedMutation(blockedMessage),
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
  api = lotteryAccountingClient,
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
        api,
        accountingText(language, "public.readOnlyBlocked"),
      ),
    [api, language],
  );
  const isPreview = mode === "PREVIEW";
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
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-[10px] font-bold text-slate-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" />{" "}
          {accountingText(language, "public.currentMode")}
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
      className="space-y-3"
      aria-label={
        isPreview
          ? accountingText(language, "public.publishPreview")
          : accountingText(language, "public.liveUserMode")
      }
      lang={accountingHtmlLang(language)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-[10px] font-bold text-slate-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" />{" "}
          {accountingText(language, "public.currentMode")}
        </button>
        <span className="rounded-full border border-emerald-100 bg-white px-3 py-2 text-[9px] font-black text-emerald-700">
          {isPreview
            ? `${accountingText(language, "public.currentDraft")} ${versionLabel(version, language)}`
            : `${accountingText(language, "public.livePublished")} ${versionLabel(version, language)}`}
        </span>
      </div>

      {isClassic && (
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
      )}

      <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-3 text-[9px] leading-relaxed text-orange-800">
        {accountingText(language, "public.readOnlyNotice")}
      </div>

      {isClassic ? (
        <div
          data-testid="accounting-public-shell"
          data-accounting-appearance={appearance}
        >
          <LotteryAccountingWorkspace
            api={readOnlyApi}
            dashboardGreeting={dashboardGreeting}
          />
        </div>
      ) : (
        <div
          className="orbis-accounting-public-shell"
          data-accounting-appearance={appearance}
          data-testid="accounting-public-shell"
        >
          <header className="orbis-public-app-header">
            <div className="relative z-[1] flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="orbis-public-logo">O</span>
                <div className="min-w-0">
                  <p className="text-[7px] font-black uppercase tracking-[0.15em] text-emerald-100">
                    {accountingText(language, "public.accountingEyebrow")}
                  </p>
                  <h2 className="mt-0.5 truncate text-[15px] font-black tracking-tight text-white">
                    {accountingText(language, "public.title")}
                  </h2>
                  <div className="mt-0.5 flex items-center gap-1 text-[8px] font-semibold text-emerald-50/85">
                    {isPreview ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <Radio className="h-3 w-3" />
                    )}
                    <span>
                      {isPreview
                        ? accountingText(language, "public.publicUserPreview")
                        : accountingText(language, "public.liveUserMode")}{" "}
                      · {versionLabel(version, language)}
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
                    <span>No new notifications in this preview.</span>
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
                      {versionLabel(version, language)} ·{" "}
                      {isPreview ? "Public Preview" : "Live User Mode"} ·{" "}
                      {version.lifecycle}
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