import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Database,
  GitBranch,
  ListChecks,
  Sparkles,
} from "lucide-react";
import {
  loadManagedProductModels,
  publishManagedProductModel,
  reviewManagedProductModel,
} from "../../models/modelRegistryClient";
import type {
  ManagedProductModel,
  ManagedProductModelVersion,
  ManagedProductModule,
} from "../../models/types";

type WorkspaceScreen = "catalog" | "model" | "module";
type ModuleTab =
  "overview" | "data" | "workflow" | "skills" | "review" | "versions";

interface ManagedProductModelsProps {
  previewMode?: boolean;
  initialScreen?: "catalog" | "model";
  loadModels?: () => Promise<ManagedProductModel[]>;
  publishModel?: (slug: string) => Promise<ManagedProductModel>;
  reviewModel?: (slug: string) => Promise<ManagedProductModel>;
}

function versionLabel(version: number | null | undefined): string {
  return typeof version === "number" ? `v${version}` : "Not created";
}

function StatusBadge({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[9px] font-bold text-emerald-700">
      {children}
    </span>
  );
}

function BackButton({
  label,
  onClick,
}: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-[10px] font-bold text-slate-600"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function NavigationCard({
  title,
  subtitle,
  icon,
  onClick,
}: Readonly<{
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[92px] items-center gap-3 rounded-2xl border border-emerald-100 bg-white/90 p-3 text-left shadow-sm transition active:scale-[0.985]"
    >
      <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-black text-slate-900">{title}</span>
        <span className="mt-1 block text-[9px] leading-relaxed text-slate-500">
          {subtitle}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-emerald-600" />
    </button>
  );
}

function VersionCard({
  label,
  version,
}: Readonly<{ label: string; version: ManagedProductModelVersion | null }>) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-3">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-base font-black text-slate-900">
        {versionLabel(version?.sequence)}
      </p>
      <p className="mt-1 text-[9px] text-slate-500">
        {version
          ? `${version.lifecycle} · Review ${version.reviewStatus}`
          : "No snapshot exists"}
      </p>
    </div>
  );
}

export function ManagedProductModels({
  previewMode = false,
  initialScreen = "catalog",
  loadModels = loadManagedProductModels,
  publishModel = publishManagedProductModel,
  reviewModel = reviewManagedProductModel,
}: Readonly<ManagedProductModelsProps>) {
  const [models, setModels] = useState<ManagedProductModel[]>([]);
  const [screen, setScreen] = useState<WorkspaceScreen>(initialScreen);
  const [tab, setTab] = useState<ModuleTab>("overview");
  const [isLoading, setIsLoading] = useState(!previewMode);
  const [workingAction, setWorkingAction] = useState<
    "review" | "publish" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (previewMode) return;
    setIsLoading(true);
    setError(null);
    try {
      setModels(await loadModels());
    } catch {
      setError("Managed product models are unavailable.");
    } finally {
      setIsLoading(false);
    }
  }, [loadModels, previewMode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const model =
    models.find((item) => item.slug === "orbis-accounting-ai") || null;
  const definition =
    model?.currentVersion?.definition || model?.publishedVersion?.definition;
  const lottery = useMemo(
    () =>
      definition?.modules.find((module) => module.slug === "lottery") || null,
    [definition],
  );

  const replaceModel = (updated: ManagedProductModel) => {
    setModels((current) =>
      current.map((item) => (item.slug === updated.slug ? updated : item)),
    );
  };

  const runReview = async () => {
    if (!model || workingAction) return;
    setWorkingAction("review");
    setError(null);
    try {
      replaceModel(await reviewModel(model.slug));
    } catch {
      setError("The Accounting AI draft review could not be completed.");
    } finally {
      setWorkingAction(null);
    }
  };

  const publish = async () => {
    const currentVersion = model?.currentVersion;
    if (
      !model ||
      !currentVersion ||
      currentVersion.reviewStatus !== "PASSED" ||
      workingAction
    )
      return;
    const approved = window.confirm(
      `Publish ${model.displayName} ${versionLabel(currentVersion.sequence)}? The reviewed draft becomes the read-only public snapshot and its copy opens as the next draft.`,
    );
    if (!approved) return;
    setWorkingAction("publish");
    setError(null);
    try {
      replaceModel(await publishModel(model.slug));
    } catch {
      setError("The Accounting AI version could not be published.");
    } finally {
      setWorkingAction(null);
    }
  };

  if (previewMode) {
    return (
      <section className="rounded-[22px] border border-orange-100 bg-orange-50/60 p-4 text-xs leading-relaxed text-orange-800">
        Managed product models are Admin-only and are hidden in this public
        read-only preview.
      </section>
    );
  }
  if (isLoading) {
    return (
      <p className="rounded-2xl border border-emerald-100 bg-white p-4 text-xs text-slate-500">
        Loading managed models…
      </p>
    );
  }
  if (!model) {
    return (
      <section className="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-xs text-orange-800">
        {error || "ORBiS Accounting AI is not registered."}
      </section>
    );
  }

  const alert = error ? (
    <p
      role="alert"
      className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs text-orange-800"
    >
      {error}
    </p>
  ) : null;

  if (screen === "catalog") {
    return (
      <section className="space-y-3" aria-label="Managed product models">
        {alert}
        <button
          type="button"
          onClick={() => setScreen("model")}
          className="flex w-full items-center gap-3 rounded-[20px] border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-orange-50/50 p-3 text-left shadow-sm"
        >
          <span className="rounded-xl bg-emerald-600 p-2.5 text-white">
            <Bot className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
              Managed model
            </span>
            <span className="mt-1 block text-sm font-black text-slate-900">
              ORBiS Accounting AI
            </span>
            <span className="mt-1 block text-[9px] text-slate-500">
              Draft {versionLabel(model.currentVersion?.sequence)} ·{" "}
              {model.status}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-emerald-600" />
        </button>
      </section>
    );
  }

  if (screen === "model") {
    return (
      <section
        className="space-y-3"
        aria-label="ORBiS Accounting AI model home"
      >
        <BackButton label="All modules" onClick={() => setScreen("catalog")} />
        {alert}
        <div className="rounded-[22px] border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-orange-50/50 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
                Accounting model
              </p>
              <h3 className="mt-1 text-lg font-black text-slate-900">
                {model.displayName}
              </h3>
            </div>
            <StatusBadge>{model.status}</StatusBadge>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Draft configuration is Admin-managed. Only a reviewed published
            snapshot can be resolved by the future public app.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <NavigationCard
            title={lottery?.name || "Lottery Accounting"}
            subtitle="Stock, return, sales, commission, TDS, payment, settlement and ledger."
            icon={<Sparkles className="h-5 w-5" />}
            onClick={() => {
              setTab("overview");
              setScreen("module");
            }}
          />
          <NavigationCard
            title={`Draft ${versionLabel(model.currentVersion?.sequence)}`}
            subtitle={`Review ${model.currentVersion?.reviewStatus || "NOT_RUN"} · Editable`}
            icon={<ListChecks className="h-5 w-5" />}
            onClick={() => {
              setTab("versions");
              setScreen("module");
            }}
          />
          <NavigationCard
            title={`Published ${versionLabel(model.publishedVersion?.sequence)}`}
            subtitle="Read-only public snapshot"
            icon={<CheckCircle2 className="h-5 w-5" />}
            onClick={() => {
              setTab("versions");
              setScreen("module");
            }}
          />
          <NavigationCard
            title="Release history"
            subtitle="Review gate, publish state and next copied draft."
            icon={<GitBranch className="h-5 w-5" />}
            onClick={() => {
              setTab("versions");
              setScreen("module");
            }}
          />
        </div>
      </section>
    );
  }

  if (!lottery) return null;
  return (
    <section className="space-y-3" aria-label="Lottery Accounting workspace">
      <BackButton label="Accounting model" onClick={() => setScreen("model")} />
      {alert}
      <div className="rounded-[22px] border border-emerald-100 bg-white/90 p-4 shadow-sm">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
          Module workspace
        </p>
        <h3 className="mt-1 text-lg font-black text-slate-900">
          {lottery.name}
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge>{lottery.lifecycle}</StatusBadge>
          <StatusBadge>AI analysis only</StatusBadge>
          <StatusBadge>Web search disabled</StatusBadge>
        </div>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        aria-label="Lottery workspace sections"
      >
        {(
          [
            ["overview", "Overview"],
            ["data", "Data"],
            ["workflow", "Workflow"],
            ["skills", "AI Skills"],
            ["review", "Test & Review"],
            ["versions", "Versions"],
          ] as Array<[ModuleTab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-bold ${tab === value ? "bg-emerald-600 text-white" : "border border-emerald-100 bg-white text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview module={lottery} />}
      {tab === "data" && <DataContract module={lottery} />}
      {tab === "workflow" && <Workflow module={lottery} />}
      {tab === "skills" && <AiSkills module={lottery} />}
      {tab === "review" && (
        <ReviewPanel
          version={model.currentVersion}
          isReviewing={workingAction === "review"}
          onReview={() => void runReview()}
        />
      )}
      {tab === "versions" && (
        <VersionsPanel
          model={model}
          isPublishing={workingAction === "publish"}
          onPublish={() => void publish()}
        />
      )}
    </section>
  );
}

function WorkspacePanel({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div className="rounded-[22px] border border-emerald-100 bg-white/90 p-4 shadow-sm">
      <h4 className="text-sm font-black text-slate-900">{title}</h4>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Overview({ module }: Readonly<{ module: ManagedProductModule }>) {
  return (
    <WorkspacePanel title="Accounting Core">
      <p className="text-[10px] leading-relaxed text-slate-600">
        Validated Lottery entries are calculated server-side, posted to a
        balanced immutable ledger, summarized read-only and only then exposed to
        Accounting AI.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <p className="text-[9px] text-slate-500">Data entities</p>
          <p className="mt-1 text-base font-black">
            {module.dataContract.entities.length}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <p className="text-[9px] text-slate-500">AI skills</p>
          <p className="mt-1 text-base font-black">{module.aiSkills.length}</p>
        </div>
      </div>
    </WorkspacePanel>
  );
}

function DataContract({ module }: Readonly<{ module: ManagedProductModule }>) {
  return (
    <WorkspacePanel title="Real data contract">
      <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-700">
        <Database className="h-4 w-4" /> {module.dataContract.moneyUnit} ·{" "}
        {module.dataContract.rateUnit}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {module.dataContract.entities.map((entity) => (
          <div
            key={entity}
            className="rounded-xl border border-emerald-50 bg-emerald-50/50 p-2.5 text-[10px] font-semibold capitalize text-slate-700"
          >
            {entity.replace(/-/g, " ")}
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-2 text-[9px] text-slate-500">
        {module.dataContract.rules.map((rule) => (
          <li key={rule}>✓ {rule.replace(/_/g, " ")}</li>
        ))}
      </ul>
    </WorkspacePanel>
  );
}

function Workflow({ module }: Readonly<{ module: ManagedProductModule }>) {
  return (
    <WorkspacePanel title="Step-by-step workflow">
      <ol className="space-y-2">
        {module.workflow.map((step, index) => (
          <li
            key={step}
            className="flex items-center gap-3 rounded-xl border border-emerald-50 bg-emerald-50/40 p-3"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-black text-white">
              {index + 1}
            </span>
            <span className="text-[10px] font-bold capitalize text-slate-700">
              {step.replace(/-/g, " ")}
            </span>
          </li>
        ))}
      </ol>
    </WorkspacePanel>
  );
}

function AiSkills({ module }: Readonly<{ module: ManagedProductModule }>) {
  return (
    <WorkspacePanel title="Module-scoped AI skills">
      <div className="space-y-2">
        {module.aiSkills.map((skill) => (
          <div
            key={skill.slug}
            className="rounded-xl border border-emerald-100 bg-emerald-50/35 p-3"
          >
            <p className="text-[11px] font-black text-slate-900">
              {skill.name}
            </p>
            <p className="mt-1 text-[9px] text-slate-500">
              Source: {skill.source.replace(/_/g, " ")}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-3 text-[9px] leading-relaxed text-orange-800">
        Read-only: no INSERT, UPDATE, DELETE, payment, stock adjustment, ledger
        correction or web search.
      </p>
    </WorkspacePanel>
  );
}

function ReviewPanel({
  version,
  isReviewing,
  onReview,
}: Readonly<{
  version: ManagedProductModelVersion | null;
  isReviewing: boolean;
  onReview: () => void;
}>) {
  const checks = [
    ...(version?.reviewReport?.contractChecks || []),
    ...(version?.reviewReport?.coreChecks || []),
  ];
  return (
    <WorkspacePanel
      title={`Draft ${versionLabel(version?.sequence)} test & review`}
    >
      <p className="text-[10px] text-slate-600">
        Status: <strong>{version?.reviewStatus || "NOT_RUN"}</strong>
      </p>
      {checks.length > 0 && (
        <ul className="mt-3 space-y-2">
          {checks.map((check) => (
            <li
              key={check.name}
              className="flex items-center gap-2 text-[9px] text-slate-600"
            >
              <CheckCircle2
                className={`h-4 w-4 ${check.passed ? "text-emerald-600" : "text-orange-500"}`}
              />
              {check.name}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onReview}
        disabled={!version || isReviewing}
        className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-bold text-white disabled:opacity-50"
      >
        {isReviewing ? "Running review…" : "Run full module review"}
      </button>
    </WorkspacePanel>
  );
}

function VersionsPanel({
  model,
  isPublishing,
  onPublish,
}: Readonly<{
  model: ManagedProductModel;
  isPublishing: boolean;
  onPublish: () => void;
}>) {
  const canPublish = model.currentVersion?.reviewStatus === "PASSED";
  return (
    <WorkspacePanel title="Draft, published and upgrade versions">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <VersionCard label="Current / Draft" version={model.currentVersion} />
        <VersionCard
          label="Published / Public"
          version={model.publishedVersion}
        />
      </div>
      <p className="mt-3 text-[9px] leading-relaxed text-slate-500">
        Publish is unlocked only after the current draft passes Test & Review.
        Publishing archives the previous public snapshot and opens an identical
        next draft for upgrades.
      </p>
      <div className="mt-3 space-y-2" aria-label="Release history">
        {model.versionHistory.map((version) => (
          <div
            key={version.id}
            className="flex items-center justify-between rounded-xl border border-emerald-50 bg-emerald-50/35 p-2.5 text-[9px]"
          >
            <span className="font-bold text-slate-700">
              v{version.sequence}
            </span>
            <span className="text-slate-500">
              {version.lifecycle} · Review {version.reviewStatus}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onPublish}
        disabled={!canPublish || isPublishing}
        className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPublishing
          ? "Publishing…"
          : `Publish ${versionLabel(model.currentVersion?.sequence)}`}
      </button>
      {!canPublish && (
        <p className="mt-2 text-[9px] text-orange-700">
          Run and pass Test & Review before publishing.
        </p>
      )}
    </WorkspacePanel>
  );
}
