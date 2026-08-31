import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Bot,
  Boxes,
  Brain,
  CheckCircle2,
  ChevronRight,
  Copy,
  Cpu,
  Database,
  Download,
  GitBranch,
  Home,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  TrendingUp,
  WifiOff,
  X,
} from "lucide-react";
import { readAdminJson } from "../auth/adminFetch";
import { FullscreenChatView } from "../../features/orbis-ai-chatbot/components/FullscreenChatView";
import { BrainChatTestLog } from "../../features/orbis-ai-chatbot/components/BrainChatTestLog";
import { LearningReviewPanel } from "./sections/LearningReviewPanel";
import { ManagedProductModels } from "./sections/ManagedProductModels";

type DashboardView =
  | "overview"
  | "market"
  | "modules"
  | "accounting"
  | "runtime"
  | "brain"
  | "diagnostics"
  | "data"
  | "releases";

type BrainDetailTab = "status" | "test-log" | "learning" | "scan" | "changes";

type Availability = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";

const ACTIVE_NAV_STATE_CLASS =
  "bg-emerald-600 text-white shadow-[0_8px_18px_rgba(5,150,105,0.22)]";
const INACTIVE_NAV_STATE_CLASS = "text-slate-400";
const DETAIL_GRID_CLASS = "grid grid-cols-1 gap-2.5 sm:grid-cols-2";
const MORE_NAVIGATION_VIEWS = new Set<DashboardView>([
  "brain",
  "runtime",
  "diagnostics",
  "data",
  "releases",
]);

interface SystemStats {
  cpuCores: number;
  cpuModel: string;
  arch: string;
  platform: string;
  release: string;
  load: string;
  load5m: string;
  load15m: string;
  totalMem: string;
  freeMem: string;
  usedMem: string;
  ramUsedPercent: string;
  uptime: string;
  processUptime: string;
  heapUsed: string;
  status: string;
}

interface ProviderHealth {
  state?: string;
  checkedAt?: number | null;
}

interface ProviderMetadata {
  name?: string;
  type?: string;
  model?: string;
  health?: ProviderHealth;
}

interface ProviderStatus {
  activeProvider: ProviderMetadata | null;
  allProviders: ProviderMetadata[];
}

interface DiagnosticCapability {
  id: string;
  kind: string;
  configured: boolean;
  status: string;
  callable: boolean;
  executionRoute: string;
}

interface DiagnosticProvider {
  name: string;
  type: string;
  state: string;
}

interface DiagnosticTableCount {
  table: string;
  count: number | null;
  status: string;
}

interface DiagnosticEvent {
  timestamp: string;
  level: string;
  source: string;
  category: string;
  severity: string;
  count: number;
  message: string;
}

interface DiagnosticExport {
  schema: string;
  generatedAt: string;
  redacted: boolean;
  version: {
    commit: string;
    application: string;
  };
  providers: DiagnosticProvider[];
  capabilities: DiagnosticCapability[];
  brain: {
    route: string;
    registered: boolean;
    gatewayArtifact: string;
  };
  database: {
    state: string;
    foundationTableCounts: DiagnosticTableCount[];
  };
  telemetry: {
    status: string;
    summary: {
      occurrences: number;
      records: number;
      bySeverity: Record<string, number>;
      byCategory: Record<string, number>;
    };
    recentEvents: DiagnosticEvent[];
  };
  migrations: Array<{
    name: string;
    localStatus: string;
    databaseStatus: string;
  }>;
  runtime: {
    node: string;
    platform: string;
    architecture: string;
    processUptimeSeconds: number;
    cpuCores: number;
    cpuModel: string;
    memoryTotalGb: number;
    memoryUsedGb: number;
  };
  exclusions: string[];
}

interface DiagnosticsResponse {
  timestamp?: string;
  gitStatus?: string;
  logs?: DiagnosticEvent[];
}

interface ObservatoryTask {
  task?: string;
  status?: string;
  objective?: string;
  commit?: string;
  auditFile?: string;
}

interface ObservatoryResponse {
  title?: string;
  completed?: number;
  auditedTasks?: number;
  next?: string;
  tasks?: ObservatoryTask[];
}

const EMPTY_SYSTEM_STATS: SystemStats = {
  cpuCores: 0,
  cpuModel: "Unavailable",
  arch: "unknown",
  platform: "UNKNOWN",
  release: "unknown",
  load: "0.00",
  load5m: "0.00",
  load15m: "0.00",
  totalMem: "0.00",
  freeMem: "0.00",
  usedMem: "0.00",
  ramUsedPercent: "0.0",
  uptime: "Unavailable",
  processUptime: "0",
  heapUsed: "0.00",
  status: "UNAVAILABLE",
};

const VIEW_TITLES: Record<DashboardView, string> = {
  overview: "Overview",
  market: "Market Intelligence",
  modules: "Modules",
  accounting: "ORBiS Accounting AI",
  runtime: "Runtime",
  brain: "Brain",
  diagnostics: "Diagnostics",
  data: "Data & Privacy",
  releases: "Releases",
};

function normalizeAvailability(value?: string): Availability {
  if (value === "AVAILABLE" || value === "ONLINE" || value === "connected") {
    return "AVAILABLE";
  }
  if (
    value === "UNAVAILABLE" ||
    value === "OFFLINE" ||
    value === "unavailable"
  ) {
    return "UNAVAILABLE";
  }
  return "UNKNOWN";
}

function isMoreNavigationActive(view: DashboardView, chatOpen: boolean): boolean {
  return !chatOpen && MORE_NAVIGATION_VIEWS.has(view);
}

function statusClasses(state: Availability): string {
  if (state === "AVAILABLE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (state === "UNAVAILABLE") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  return "border-slate-200 bg-white/80 text-slate-500";
}

function statusIndicatorClass(state: Availability): string {
  switch (state) {
    case "AVAILABLE":
      return "bg-emerald-500";
    case "UNAVAILABLE":
      return "bg-orange-400";
    default:
      return "bg-slate-300";
  }
}

function getBrainAvailability(
  diagnosticExport: DiagnosticExport | null,
): Availability {
  if (!diagnosticExport) return "UNKNOWN";
  return diagnosticExport.brain.registered &&
    diagnosticExport.brain.gatewayArtifact === "available"
    ? "AVAILABLE"
    : "UNAVAILABLE";
}

function formatCheckedAt(value?: number | null): string {
  if (!value) return "Not checked";
  return new Date(value).toLocaleString();
}

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString()
    : "Unavailable";
}

async function readPublicJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
}

const StatusPill: React.FC<{ state: Availability; label?: string }> = ({
  state,
  label,
}) => (
  <span
    className={`inline-flex max-w-full min-w-0 items-center gap-1.5 whitespace-normal rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClasses(state)}`}
  >
    <span
      className={`h-1.5 w-1.5 rounded-full ${
        statusIndicatorClass(state)
      }`}
    />
    {label || state}
  </span>
);

const MetricTile: React.FC<{
  label: string;
  value: React.ReactNode;
  source: string;
}> = ({ label, value, source }) => (
  <div className="min-h-[102px] rounded-[20px] border border-emerald-100/70 bg-white/85 p-4 shadow-[0_10px_28px_rgba(50,90,58,0.07)]">
    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700/80">
      {label}
    </p>
    <div className="mt-3 break-words text-[18px] font-black text-slate-800">
      {value}
    </div>
    <p className="mt-1 text-[9px] text-slate-400">{source}</p>
  </div>
);

const DetailRow: React.FC<{
  label: string;
  value: string;
  source: string;
  copyable?: boolean;
}> = ({ label, value, source, copyable = false }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!copyable) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 border-b border-emerald-50 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500">{label}</p>
        <p className="mt-1 break-words text-[13px] font-bold text-slate-800">
          {value}
        </p>
        <p className="mt-1 text-[8px] text-slate-400">{source}</p>
      </div>
      {copyable && (
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-xl border border-emerald-100 bg-emerald-50/70 px-2.5 py-2 text-[10px] font-bold text-emerald-700"
        >
          <Copy className="mr-1 inline h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
};

interface HomeCardProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  className?: string;
  icon: React.ReactNode;
  onClick: () => void;
  status?: React.ReactNode;
}

const HomeCard: React.FC<HomeCardProps> = ({
  eyebrow,
  title,
  subtitle,
  className = "",
  icon,
  onClick,
  status,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`group relative min-h-[100px] overflow-hidden rounded-[20px] border border-emerald-100/70 bg-white/85 p-3 text-left shadow-[0_10px_26px_rgba(50,90,58,0.07)] transition active:scale-[0.985] ${className}`}
  >
    <span className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-emerald-300 via-white to-orange-200" />
    <div className="flex items-start justify-between gap-3">
      <span className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700/80">
        {eyebrow}
      </span>
      <span className="rounded-xl bg-emerald-50/80 p-2 text-emerald-700">
        {icon}
      </span>
    </div>
    <h3 className="mt-3 text-[15px] font-black text-slate-900">{title}</h3>
    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{subtitle}</p>
    <div className="mt-3 flex items-center justify-between gap-2">
      <div>{status}</div>
      <ChevronRight className="h-4 w-4 text-emerald-600" />
    </div>
  </button>
);

interface AdminDashboardProps {
  previewMode?: boolean;
}

const ReadOnlyChatPreview: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <dialog
    open
    aria-modal="true"
    aria-label="ORBIS Assistant read-only preview"
    className="fixed inset-0 z-[90] m-0 flex h-dvh max-h-none w-screen max-w-none flex-col bg-[linear-gradient(180deg,#fffef9_0%,#f6fbf3_100%)] text-slate-800"
  >
    <header className="flex items-center gap-3 border-b border-emerald-100 bg-white/90 px-4 py-3 backdrop-blur-xl">
      <button
        type="button"
        onClick={onClose}
        aria-label="Back to dashboard"
        className="rounded-2xl border border-emerald-100 bg-white p-2.5 text-slate-600"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h2 className="text-sm font-black text-slate-900">ORBIS Assistant</h2>
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700">
          Read-only preview
        </p>
      </div>
    </header>
    <main className="flex flex-1 items-center justify-center p-5">
      <section className="w-full max-w-md rounded-[24px] border border-emerald-100 bg-white/90 p-5 text-center shadow-sm">
        <MessageCircle className="mx-auto h-8 w-8 text-emerald-600" />
        <h3 className="mt-3 text-base font-black text-slate-900">
          Chat interaction is disabled here
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          This permanent preview is for visual inspection only. It does not
          send chat requests, approvals, learning actions, or Admin writes.
        </p>
      </section>
    </main>
  </dialog>
);

export function AdminDashboard({
  previewMode = false,
}: Readonly<AdminDashboardProps>) {
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [chatOpen, setChatOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [systemStats, setSystemStats] = useState<SystemStats>(EMPTY_SYSTEM_STATS);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>({
    activeProvider: null,
    allProviders: [],
  });
  const [diagnosticExport, setDiagnosticExport] =
    useState<DiagnosticExport | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [observatory, setObservatory] = useState<ObservatoryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("Not refreshed");
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const diagnosticsCopyTimerRef = useRef<number | null>(null);
  const [diagnosticFilter, setDiagnosticFilter] = useState<
    "ALL" | "INFO" | "WARN" | "ERROR"
  >("ALL");
  const [brainDetailTab, setBrainDetailTab] =
    useState<BrainDetailTab>("status");

  const refreshSystemStats = useCallback(async () => {
    try {
      setSystemStats(await readPublicJson<SystemStats>("/api/system-stats"));
    } catch {
      setSystemStats((current) => ({ ...current, status: "UNAVAILABLE" }));
    }
  }, []);

  const refreshSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);

    const results = await Promise.allSettled([
      readPublicJson<SystemStats>("/api/system-stats"),
      readPublicJson<ProviderStatus>("/api/ai/providers/status"),
      previewMode
        ? Promise.resolve<DiagnosticExport | null>(null)
        : readAdminJson<DiagnosticExport>("/api/admin/diagnostic-export"),
      readPublicJson<ObservatoryResponse>("/api/termux-observatory"),
    ]);

    const [statsResult, providersResult, exportResult, observatoryResult] = results;
    if (statsResult.status === "fulfilled") setSystemStats(statsResult.value);
    if (providersResult.status === "fulfilled") {
      setProviderStatus(providersResult.value);
    }
    if (exportResult.status === "fulfilled" && exportResult.value) {
      setDiagnosticExport(exportResult.value);
    }
    if (observatoryResult.status === "fulfilled") {
      setObservatory(observatoryResult.value);
    }

    const failureCount = results.filter((item) => item.status === "rejected").length;
    if (failureCount === results.length) {
      setSummaryError("Live dashboard sources are unavailable.");
    } else if (failureCount > 0) {
      setSummaryError(
        `${failureCount} live source${failureCount === 1 ? " is" : "s are"} unavailable. Available fields remain live.`,
      );
    }

    setLastRefresh(new Date().toLocaleTimeString());
    setSummaryLoading(false);
  }, [previewMode]);

  const refreshDiagnostics = useCallback(async () => {
    setDetailError(null);

    if (previewMode) {
      setDiagnostics(null);
      return;
    }

    try {
      setDiagnostics(await readAdminJson<DiagnosticsResponse>("/api/diagnostics"));
    } catch {
      setDiagnostics(null);
      setDetailError("Admin diagnostics are unavailable.");
    }
  }, [previewMode]);

  const refreshDiagnosticsSurface = useCallback(async () => {
    await refreshSummary();
    await refreshDiagnostics();
  }, [refreshDiagnostics, refreshSummary]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    return () => {
      if (diagnosticsCopyTimerRef.current !== null) {
        window.clearTimeout(diagnosticsCopyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    const timer = window.setInterval(() => void refreshSystemStats(), 15_000);
    return () => window.clearInterval(timer);
  }, [refreshSystemStats]);

  useEffect(() => {
    if (activeView === "diagnostics") void refreshDiagnostics();
  }, [activeView, refreshDiagnostics]);

  useEffect(() => {
    const handlePop = () => {
      setChatOpen(false);
      setMoreOpen(false);
      setActiveView("overview");
      scrollToTop();
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [scrollToTop]);

  useEffect(() => {
    if (!moreOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen]);

  const openView = (view: DashboardView) => {
    setMoreOpen(false);
    setChatOpen(false);
    setActiveView(view);
    window.history.pushState({ orbisDashboardView: view }, "");
    scrollToTop();
  };

  const openOverview = () => {
    setMoreOpen(false);
    setChatOpen(false);
    setActiveView("overview");
    window.history.replaceState(null, "");
    scrollToTop();
  };

  const openChat = () => {
    setMoreOpen(false);
    setChatOpen(true);
    window.history.pushState({ orbisDashboardView: "chat" }, "");
    scrollToTop();
  };

  const closeOverlay = () => {
    if (window.history.state?.orbisDashboardView) {
      window.history.back();
      return;
    }
    setChatOpen(false);
    setActiveView("overview");
  };

  const activeProvider = providerStatus.activeProvider;
  const providerHealth = normalizeAvailability(activeProvider?.health?.state);
  const systemAvailability = normalizeAvailability(systemStats.status);
  const databaseAvailability = normalizeAvailability(
    diagnosticExport?.database.state,
  );
  const brainAvailability = getBrainAvailability(diagnosticExport);

  const configuredCapabilities = useMemo(
    () =>
      diagnosticExport?.capabilities.filter(
        (capability) => capability.configured && capability.callable,
      ) || [],
    [diagnosticExport],
  );

  const downloadCurrentReport = () => {
    if (previewMode || !diagnosticExport) return;
    const blob = new Blob([JSON.stringify(diagnosticExport, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orbis-foundation-diagnostic-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyDiagnosticEvents = async (events: DiagnosticEvent[]) => {
    const displayedEvents = events.slice(0, 20);
    if (displayedEvents.length === 0) return;

    const payload = displayedEvents
      .map(
        (event) =>
          `[${event.severity || event.level}] ${event.source}\n` +
          `${event.message}\n` +
          `${event.timestamp} · count ${event.count || 1}`,
      )
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(payload);
      setDiagnosticsCopied(true);
      if (diagnosticsCopyTimerRef.current !== null) {
        window.clearTimeout(diagnosticsCopyTimerRef.current);
      }
      diagnosticsCopyTimerRef.current = window.setTimeout(() => {
        diagnosticsCopyTimerRef.current = null;
        setDiagnosticsCopied(false);
      }, 1200);
    } catch {
      setDiagnosticsCopied(false);
    }
  };

  const summaryHeader = (
    <section className="rounded-[24px] border border-emerald-100/70 bg-gradient-to-br from-white via-emerald-50/65 to-orange-50/70 p-5 shadow-[0_16px_40px_rgba(50,90,58,0.08)]">
      {previewMode && (
        <output
          className="mb-4 flex items-start gap-2 rounded-2xl border border-orange-100 bg-orange-50/80 px-3 py-2.5 text-[10px] font-semibold leading-relaxed text-orange-800"
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Public read-only preview · authenticated Admin/private data is
            hidden, diagnostic export is disabled, and chat cannot send
            requests.
          </span>
        </output>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700/75">
            ORBIS Foundation Control Center
          </p>
          <h2 className="mt-3 text-[30px] font-black leading-none tracking-[-0.04em] text-slate-900">
            Your ORBIS. Visible.
          </h2>
          <p className="mt-3 max-w-xl text-[12px] leading-relaxed text-slate-500">
            Live values come from connected Foundation services. Missing data is
            shown as unavailable instead of being invented.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshSummary()}
          disabled={summaryLoading}
          aria-label="Refresh dashboard data"
          className="rounded-2xl border border-emerald-100 bg-white/85 p-3 text-emerald-700 shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`h-5 w-5 ${summaryLoading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusPill state={systemAvailability} label={`System ${systemStats.status}`} />
        <StatusPill state={brainAvailability} label={`Brain ${brainAvailability}`} />
        <StatusPill state={databaseAvailability} label={`Database ${diagnosticExport?.database.state || "Unknown"}`} />
        <span className="text-[9px] text-slate-400">Refreshed: {lastRefresh}</span>
      </div>
      {summaryError && (
        <output className="mt-3 block rounded-xl border border-orange-100 bg-orange-50/75 px-3 py-2 text-[10px] text-orange-700">
          {summaryError}
        </output>
      )}
    </section>
  );

  const renderHome = () => (
    <>
      {summaryHeader}
      <section className="mt-3 grid grid-cols-4 gap-2.5 md:grid-cols-6">
        <HomeCard
          eyebrow="01 / Assistant"
          title="ORBIS Chat"
          subtitle="One conversational entry to Brain and enabled capabilities."
          icon={<MessageCircle className="h-5 w-5" />}
          onClick={openChat}
          className="col-span-4 bg-gradient-to-br from-emerald-50/90 via-white to-orange-50/80 md:col-span-2 md:row-span-2 md:min-h-[244px]"
          status={<StatusPill state={providerHealth} label={activeProvider?.name || "Provider not checked"} />}
        />
        <HomeCard
          eyebrow="02"
          title="Market Intelligence"
          subtitle="Reserved for the verified market engine and live market feed."
          icon={<TrendingUp className="h-5 w-5" />}
          onClick={() => openView("market")}
          className="col-span-4 md:col-span-2 md:row-span-2 md:min-h-[244px]"
          status={<StatusPill state="UNAVAILABLE" label="Not connected" />}
        />
        <HomeCard
          eyebrow="03"
          title="Modules"
          subtitle={`${configuredCapabilities.length} callable capabilities currently registered.`}
          icon={<Boxes className="h-5 w-5" />}
          onClick={() => openView("modules")}
          className="col-span-2 md:col-span-2"
          status={<StatusPill state={diagnosticExport ? "AVAILABLE" : "UNKNOWN"} label="Capability registry" />}
        />
        <HomeCard
          eyebrow="04"
          title="ORBiS Accounting AI"
          subtitle="Lottery Accounting model, review gate and version workspace."
          icon={<Bot className="h-5 w-5" />}
          onClick={() => openView("accounting")}
          className="col-span-2 md:col-span-2"
          status={<StatusPill state="AVAILABLE" label="Draft model" />}
        />
        <HomeCard
          eyebrow="05"
          title="Runtime"
          subtitle={`${systemStats.platform} · ${systemStats.arch} · ${systemStats.cpuCores} cores`}
          icon={<Cpu className="h-5 w-5" />}
          onClick={() => openView("runtime")}
          className="col-span-2 md:col-span-2"
          status={<StatusPill state={systemAvailability} label={systemStats.uptime} />}
        />
        <HomeCard
          eyebrow="06"
          title="Brain"
          subtitle="Gateway artifact, provider health and authorization surface."
          icon={<Brain className="h-5 w-5" />}
          onClick={() => openView("brain")}
          className="col-span-2 md:col-span-2"
          status={<StatusPill state={brainAvailability} />}
        />
        <HomeCard
          eyebrow="07"
          title="Diagnostics"
          subtitle={`${diagnosticExport?.telemetry.summary.records ?? 0} redacted recent telemetry records.`}
          icon={<Activity className="h-5 w-5" />}
          onClick={() => openView("diagnostics")}
          className="col-span-2 md:col-span-2"
          status={<StatusPill state={normalizeAvailability(diagnosticExport?.telemetry.status)} label={diagnosticExport?.telemetry.status || "Unknown"} />}
        />
        <HomeCard
          eyebrow="08"
          title="Data & Privacy"
          subtitle="Foundation table counts, storage state and redaction policy."
          icon={<Database className="h-5 w-5" />}
          onClick={() => openView("data")}
          className="col-span-2 md:col-span-2"
          status={<StatusPill state={databaseAvailability} label={diagnosticExport?.database.state || "Unknown"} />}
        />
        <HomeCard
          eyebrow="09"
          title="Releases"
          subtitle={`Commit ${diagnosticExport?.version.commit || "Unavailable"}`}
          icon={<GitBranch className="h-5 w-5" />}
          onClick={() => openView("releases")}
          className="col-span-2 md:col-span-2"
          status={<StatusPill state={diagnosticExport ? "AVAILABLE" : "UNKNOWN"} label={`v${diagnosticExport?.version.application || "?"}`} />}
        />
      </section>
    </>
  );

  const renderMarket = () => (
    <div className="space-y-3">
      <section className="rounded-[24px] border border-orange-100 bg-gradient-to-br from-white to-orange-50/70 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-orange-50 p-3 text-orange-500"><TrendingUp className="h-6 w-6" /></span>
          <div>
            <h3 className="text-lg font-black text-slate-900">Market Intelligence is not connected yet</h3>
            <p className="mt-1 text-[11px] text-slate-500">No live market endpoint or broker feed is exposed by the current Foundation backend, so this screen intentionally shows no prices, P&amp;L, confidence or signals.</p>
          </div>
        </div>
      </section>
      <div className={DETAIL_GRID_CLASS}>
        <MetricTile label="Live feed" value="Unavailable" source="No verified market source" />
        <MetricTile label="Paper trading" value="Not implemented" source="Market module pending" />
        <MetricTile label="Research engine" value="Not implemented" source="Market module pending" />
        <MetricTile label="Market storage" value="Not implemented" source="Market module pending" />
      </div>
    </div>
  );

  const renderModules = () => (
    <div className="space-y-3">
      <ManagedProductModels previewMode={previewMode} />
      <div className={DETAIL_GRID_CLASS}>
        <MetricTile label="Registered capabilities" value={diagnosticExport?.capabilities.length ?? "Unavailable"} source="Admin diagnostic capability registry" />
        <MetricTile label="Callable + configured" value={configuredCapabilities.length} source="Admin diagnostic capability registry" />
        <MetricTile label="Development registry" value="Not wired" source="No live module registry endpoint" />
        <MetricTile label="Published registry" value="Not wired" source="No live module registry endpoint" />
      </div>
      <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">Current capability registry</h3>
        <div className="mt-2">
          {(diagnosticExport?.capabilities || []).map((capability) => (
            <DetailRow
              key={capability.id}
              label={`${capability.kind} · ${capability.status}`}
              value={capability.id}
              source={`${capability.executionRoute} · configured=${String(capability.configured)} · callable=${String(capability.callable)}`}
              copyable
            />
          ))}
          {!diagnosticExport && <p className="py-4 text-xs text-slate-400">Capability registry unavailable.</p>}
        </div>
      </section>
    </div>
  );

  const renderAccounting = () => (
    <ManagedProductModels previewMode={previewMode} initialScreen="model" />
  );

  const renderRuntime = () => (
    <div className="space-y-3">
      <div className={DETAIL_GRID_CLASS}>
        <MetricTile label="Platform" value={systemStats.platform} source="/api/system-stats" />
        <MetricTile label="Architecture" value={systemStats.arch} source="/api/system-stats" />
        <MetricTile label="CPU cores" value={systemStats.cpuCores} source="/api/system-stats" />
        <MetricTile label="Memory used" value={`${systemStats.usedMem} / ${systemStats.totalMem} GB`} source="/api/system-stats" />
        <MetricTile label="Load average" value={systemStats.load} source="OS 1-minute load average" />
        <MetricTile label="Uptime" value={systemStats.uptime} source="OS uptime" />
      </div>
      <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">Runtime boundaries</h3>
        <DetailRow label="Current backend runtime" value={`${systemStats.platform} ${systemStats.release}`} source="/api/system-stats" copyable />
        <DetailRow label="Node runtime" value={diagnosticExport?.runtime.node || "Unavailable"} source="Admin diagnostic export" copyable />
        <DetailRow label="Physical Android phone link" value="Not exposed by current backend" source="No authenticated cloud-to-phone pairing telemetry exists yet" />
        <DetailRow label="Audit-driven runtime tasks" value={formatNumber(observatory?.auditedTasks)} source="/api/termux-observatory" />
        <DetailRow label="Next audited task" value={observatory?.next || "Unavailable"} source="/api/termux-observatory" copyable />
      </section>
    </div>
  );

  const renderBrain = () => (
    <div className="space-y-3">
      <nav
        aria-label="Brain detail sections"
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
      >
        {([
          ["status", "Status"],
          ["test-log", "Chat Test Log"],
          ["learning", "Learning Review"],
          ["scan", "Improvement Scan"],
          ["changes", "Boundaries"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            aria-pressed={brainDetailTab === tab}
            onClick={() => setBrainDetailTab(tab)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-bold ${
              brainDetailTab === tab
                ? ACTIVE_NAV_STATE_CLASS
                : "border-emerald-100 bg-white text-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {brainDetailTab === "status" && (
        <>
          <div className={DETAIL_GRID_CLASS}>
            <MetricTile label="Brain route" value={diagnosticExport?.brain.route || "Unavailable"} source="Admin diagnostic export" />
            <MetricTile label="Gateway artifact" value={diagnosticExport?.brain.gatewayArtifact || "Unavailable"} source="Admin diagnostic export" />
            <MetricTile label="Active provider" value={activeProvider?.name || "Unavailable"} source="/api/ai/providers/status" />
            <MetricTile label="Provider health" value={activeProvider?.health?.state || "UNKNOWN"} source={`Checked: ${formatCheckedAt(activeProvider?.health?.checkedAt)}`} />
          </div>
          <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-900">Providers</h3>
            {(providerStatus.allProviders || []).map((provider) => (
              <DetailRow
                key={`${provider.name}-${provider.model}`}
                label={`${provider.type || "unknown"} · ${provider.health?.state || "UNKNOWN"}`}
                value={`${provider.name || "Unnamed"} · ${provider.model || "model unavailable"}`}
                source={`Last health check: ${formatCheckedAt(provider.health?.checkedAt)}`}
                copyable
              />
            ))}
            {providerStatus.allProviders.length === 0 && <p className="py-4 text-xs text-slate-400">No provider metadata available.</p>}
          </section>
        </>
      )}

      {brainDetailTab === "test-log" && <BrainChatTestLog previewMode={previewMode} />}

      {brainDetailTab === "learning" && (
        <LearningReviewPanel previewMode={previewMode} />
      )}

      {brainDetailTab === "scan" && (
        <>
          <div className={DETAIL_GRID_CLASS}>
            <MetricTile label="Gateway evidence" value={diagnosticExport?.brain.gatewayArtifact || "Unavailable"} source="Admin diagnostic export" />
            <MetricTile label="Provider check" value={activeProvider?.health?.state || "UNKNOWN"} source={`Checked: ${formatCheckedAt(activeProvider?.health?.checkedAt)}`} />
            <MetricTile label="Callable capabilities" value={configuredCapabilities.length} source="Admin diagnostic capability registry" />
            <MetricTile label="Phone link" value="Not verified" source="No authenticated cloud-to-phone pairing telemetry exists yet" />
          </div>
          <section className="rounded-[22px] border border-orange-100 bg-orange-50/70 p-4 text-xs leading-relaxed text-orange-800">
            A Brain percentage is intentionally not shown. Gateway, provider, capability,
            phone link and execution-quality probes need measured evidence before a score is valid.
          </section>
        </>
      )}

      {brainDetailTab === "changes" && (
        <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
          <h3 className="text-sm font-black text-slate-900">Brain Test Lab boundaries</h3>
          <DetailRow label="Chat Test Log" value="Device-local only" source="Existing OrbisChatDB; raw chat is not written to server diagnostics" />
          <DetailRow label="Chat behaviour" value="Unchanged" source="Existing authentication, rate limit, routing and approval boundaries remain in place" />
          <DetailRow label="Outer dashboard" value="Unchanged" source="Only this Brain detail screen adds Test Log and Scan tabs" />
          <DetailRow label="Market data" value="Not connected" source="No verified live market source is added by this Brain batch" />
        </section>
      )}
    </div>
  );

  const renderDiagnostics = () => {
    const events = diagnostics?.logs || diagnosticExport?.telemetry.recentEvents || [];
    const filteredEvents =
      diagnosticFilter === "ALL"
        ? events
        : events.filter(
            (event) =>
              (event.severity || event.level).toUpperCase() === diagnosticFilter,
          );
    const displayedEvents = filteredEvents.slice(0, 20);
    return (
      <div className="space-y-3">
        {detailError && <p role="alert" className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs text-orange-700">{detailError}</p>}
        <div className={DETAIL_GRID_CLASS}>
          <MetricTile label="Telemetry" value={diagnosticExport?.telemetry.status || "Unavailable"} source="Admin diagnostic export" />
          <MetricTile label="Recent records" value={diagnosticExport?.telemetry.summary.records ?? "Unavailable"} source="Redacted telemetry" />
          <MetricTile label="Occurrences" value={diagnosticExport?.telemetry.summary.occurrences ?? "Unavailable"} source="Aggregated redacted events" />
          <MetricTile label="Git status" value={diagnostics?.gitStatus || diagnosticExport?.version.commit || "Unavailable"} source="Live diagnostics / diagnostic export" />
          <MetricTile label="Database" value={diagnosticExport?.database.state || "Unavailable"} source="Admin diagnostic export" />
          <MetricTile label="Brain route" value={diagnosticExport?.brain.route || "Unavailable"} source="Authenticated capability gateway" />
          <MetricTile label="Provider health" value={activeProvider?.health?.state || "UNKNOWN"} source={activeProvider?.name || "No active provider"} />
          <MetricTile label="Process uptime" value={diagnosticExport ? `${Math.floor(diagnosticExport.runtime.processUptimeSeconds / 60)} min` : "Unavailable"} source="Current backend process" />
        </div>
        <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="min-w-0 flex-1 text-sm font-black text-slate-900">Redacted operational events</h3>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshDiagnosticsSurface()}
                disabled={previewMode || summaryLoading}
                aria-label="Refresh diagnostics data"
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-40"
              >
                <RefreshCw
                  className={`mr-1 inline h-3.5 w-3.5 ${
                    summaryLoading ? "animate-spin" : ""
                  }`}
                />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void copyDiagnosticEvents(displayedEvents)}
                disabled={displayedEvents.length === 0}
                className="min-h-[40px] rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 disabled:opacity-40"
              >
                <Copy className="mr-1 inline h-3.5 w-3.5" />
                {diagnosticsCopied ? "Copied" : "Copy all"}
              </button>
              <button
                type="button"
                onClick={downloadCurrentReport}
                disabled={previewMode || !diagnosticExport}
                className="min-h-[40px] rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-[10px] font-bold text-orange-700 disabled:opacity-40"
              >
                <Download className="mr-1 inline h-3.5 w-3.5" /> Export
              </button>
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {(["ALL", "INFO", "WARN", "ERROR"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setDiagnosticFilter(filter)}
                aria-pressed={diagnosticFilter === filter}
                className={`min-h-[36px] shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold ${
                  diagnosticFilter === filter
                    ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                    : "border-emerald-100 bg-white text-slate-500"
                }`}
              >
                {filter === "ALL" ? "All" : filter}
              </button>
            ))}
          </div>
          <div className="mt-2">
            {displayedEvents.map((event) => (
              <DetailRow
                key={`${event.timestamp}-${event.source}-${event.message}`}
                label={`${event.severity || event.level} · ${event.source}`}
                value={event.message}
                source={`${event.timestamp} · count ${event.count || 1}`}
              />
            ))}
            {events.length === 0 && <p className="py-4 text-xs text-slate-400">No redacted operational events are available.</p>}
          </div>
        </section>
      </div>
    );
  };

  const renderData = () => (
    <div className="space-y-3">
      <div className={DETAIL_GRID_CLASS}>
        <MetricTile label="Database" value={diagnosticExport?.database.state || "Unavailable"} source="Admin diagnostic export" />
        <MetricTile label="Redaction" value={diagnosticExport?.redacted ? "Enabled" : "Unavailable"} source="Admin diagnostic schema" />
        <MetricTile label="Telemetry" value={diagnosticExport?.telemetry.status || "Unavailable"} source="Admin diagnostic export" />
        <MetricTile label="Storage scope" value="Foundation tables only" source="Diagnostic export allow-list" />
      </div>
      <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">Foundation table counts</h3>
        {(diagnosticExport?.database.foundationTableCounts || []).map((table) => (
          <DetailRow
            key={table.table}
            label={table.status}
            value={`${table.table}: ${formatNumber(table.count)}`}
            source="Admin diagnostic database count"
            copyable
          />
        ))}
      </section>
      <section className="rounded-[22px] border border-orange-100 bg-orange-50/55 p-4">
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Diagnostic privacy exclusions</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {(diagnosticExport?.exclusions || []).map((item) => (
            <span key={item} className="rounded-full border border-orange-100 bg-white/80 px-2.5 py-1 text-[9px] text-slate-600">{item}</span>
          ))}
        </div>
      </section>
    </div>
  );

  const renderReleases = () => (
    <div className="space-y-3">
      <div className={DETAIL_GRID_CLASS}>
        <MetricTile label="Application" value={diagnosticExport ? `v${diagnosticExport.version.application}` : "Unavailable"} source="package.json via diagnostic export" />
        <MetricTile label="Commit" value={diagnosticExport?.version.commit || "Unavailable"} source="git rev-parse via diagnostic export" />
        <MetricTile label="Migrations" value={diagnosticExport?.migrations.length ?? "Unavailable"} source="Local migration directory" />
        <MetricTile label="Generated" value={diagnosticExport?.generatedAt ? new Date(diagnosticExport.generatedAt).toLocaleString() : "Unavailable"} source="Diagnostic export timestamp" />
      </div>
      <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">Release evidence</h3>
        <DetailRow label="Current commit" value={diagnosticExport?.version.commit || "Unavailable"} source="Admin diagnostic export" copyable />
        <DetailRow label="Application version" value={diagnosticExport?.version.application || "Unavailable"} source="package.json" copyable />
        <DetailRow label="Latest audit target" value={observatory?.next || "Unavailable"} source="/api/termux-observatory" copyable />
        <DetailRow label="Published-release registry" value="Not wired" source="No live published-release registry endpoint" />
      </section>
    </div>
  );

  const renderActiveView = () => {
    switch (activeView) {
      case "market":
        return renderMarket();
      case "modules":
        return renderModules();
      case "accounting":
        return renderAccounting();
      case "runtime":
        return renderRuntime();
      case "brain":
        return renderBrain();
      case "diagnostics":
        return renderDiagnostics();
      case "data":
        return renderData();
      case "releases":
        return renderReleases();
      default:
        return renderHome();
    }
  };

  const detailOpen = activeView !== "overview";
  const moreIsActive = isMoreNavigationActive(activeView, chatOpen);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_0_0,rgba(220,248,220,0.9),transparent_30%),radial-gradient(circle_at_100%_0,rgba(255,238,210,0.9),transparent_30%),linear-gradient(180deg,#fffef9_0%,#f6fbf3_100%)] pb-24 text-slate-800 md:pb-8 md:pl-36">
      <header className="sticky top-0 z-30 border-b border-emerald-100/70 bg-white/80 px-4 py-3 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-black tracking-[0.12em] text-slate-900">ORBIS FOUNDATION</h1>
            <p className="mt-0.5 text-[8px] tracking-[0.08em] text-slate-400">BUILD · OBSERVE · EVOLVE</p>
          </div>
          <div className="flex items-center gap-2">
            {systemAvailability === "AVAILABLE" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-orange-400" />}
            <button type="button" onClick={() => setMoreOpen(true)} aria-label="Open dashboard menu" className="rounded-2xl border border-emerald-100 bg-white/80 p-2.5 text-slate-500">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-3 sm:px-5">
        {detailOpen && (
          <div className="mb-3 flex items-center gap-3">
            <button type="button" onClick={closeOverlay} className="rounded-2xl border border-emerald-100 bg-white/85 p-2.5 text-slate-600" aria-label="Back to dashboard">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700/75">ORBIS Control Center</p>
              <h2 className="text-xl font-black text-slate-900">{VIEW_TITLES[activeView]}</h2>
            </div>
          </div>
        )}
        {previewMode && detailOpen && (
          <output
            className="mb-3 rounded-2xl border border-orange-100 bg-orange-50/80 px-3 py-2 text-[10px] font-semibold leading-relaxed text-orange-800"
          >
            Public read-only preview · private Admin data and actions remain
            unavailable on this screen.
          </output>
        )}
        {renderActiveView()}
      </main>

      <nav className="fixed bottom-[max(0.45rem,env(safe-area-inset-bottom))] left-1/2 z-40 grid h-[62px] w-[94%] max-w-[590px] -translate-x-1/2 grid-cols-5 rounded-[22px] border border-emerald-100 bg-white/90 p-1.5 shadow-[0_14px_38px_rgba(50,90,58,0.14)] backdrop-blur-2xl md:left-5 md:top-24 md:h-[310px] md:w-[124px] md:translate-x-0 md:grid-cols-1">
        <button type="button" onClick={openOverview} className={`min-h-[44px] rounded-2xl text-[10px] font-semibold md:text-[9px] ${activeView === "overview" && !chatOpen ? ACTIVE_NAV_STATE_CLASS : INACTIVE_NAV_STATE_CLASS}`}><Home className="mx-auto mb-1 h-5 w-5" />Home</button>
        <button type="button" onClick={openChat} className={`min-h-[44px] rounded-2xl text-[10px] font-semibold md:text-[9px] ${chatOpen ? ACTIVE_NAV_STATE_CLASS : INACTIVE_NAV_STATE_CLASS}`}><MessageCircle className="mx-auto mb-1 h-5 w-5" />Chat</button>
        <button type="button" onClick={() => openView("market")} className={`min-h-[44px] rounded-2xl text-[10px] font-semibold md:text-[9px] ${activeView === "market" ? ACTIVE_NAV_STATE_CLASS : INACTIVE_NAV_STATE_CLASS}`}><TrendingUp className="mx-auto mb-1 h-5 w-5" />Market</button>
        <button type="button" onClick={() => openView("modules")} className={`min-h-[44px] rounded-2xl text-[10px] font-semibold md:text-[9px] ${activeView === "modules" || activeView === "accounting" ? ACTIVE_NAV_STATE_CLASS : INACTIVE_NAV_STATE_CLASS}`}><Boxes className="mx-auto mb-1 h-5 w-5" />Modules</button>
        <button type="button" onClick={() => setMoreOpen(true)} className={`min-h-[44px] rounded-2xl text-[10px] font-semibold md:text-[9px] ${moreIsActive ? ACTIVE_NAV_STATE_CLASS : INACTIVE_NAV_STATE_CLASS}`}><MoreHorizontal className="mx-auto mb-1 h-5 w-5" />More</button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[70] flex items-end md:justify-center">
          <button
            type="button"
            aria-label="Close More menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 cursor-default bg-slate-900/10 backdrop-blur-[2px]"
          />
          <dialog
            open
            aria-modal="true"
            aria-labelledby="orbis-more-title"
            className="relative z-10 m-0 max-h-[88dvh] w-full overflow-y-auto rounded-t-[28px] border border-emerald-100 bg-[#fffef9] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl md:mb-5 md:max-w-lg md:rounded-[28px]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <div className="sticky top-0 z-10 flex items-center justify-between bg-[#fffef9] pb-1">
              <h2 id="orbis-more-title" className="text-sm font-black text-slate-900">More</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="min-h-[44px] min-w-[44px] rounded-xl p-2 text-slate-400"
              >
                <X className="mx-auto h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 divide-y divide-emerald-50">
              {[
                ["brain", "Brain", Brain],
                ["runtime", "Runtime", Server],
                ["diagnostics", "Diagnostics", Activity],
                ["data", "Data & Privacy", Database],
                ["releases", "Releases", GitBranch],
              ].map(([key, label, Icon]) => {
                const RowIcon = Icon as React.ComponentType<{ className?: string }>;
                return (
                  <button key={String(key)} type="button" onClick={() => openView(key as DashboardView)} className="flex w-full items-center gap-3 py-3 text-left text-sm font-semibold text-slate-700">
                    <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><RowIcon className="h-4 w-4" /></span>
                    <span className="flex-1">{String(label)}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </button>
                );
              })}
              <button type="button" disabled className="flex w-full cursor-not-allowed items-center gap-3 py-3 text-left text-sm font-semibold text-slate-400">
                <span className="rounded-xl bg-orange-50 p-2 text-orange-500"><Settings className="h-4 w-4" /></span>
                <span className="flex-1">Settings</span>
                <span className="text-[9px] text-slate-400">Not implemented</span>
              </button>
            </div>
          </dialog>
        </div>
      )}

      {chatOpen &&
        (previewMode ? (
          <ReadOnlyChatPreview onClose={closeOverlay} />
        ) : (
          <FullscreenChatView onClose={closeOverlay} />
        ))}
    </div>
  );
}

export default AdminDashboard;
