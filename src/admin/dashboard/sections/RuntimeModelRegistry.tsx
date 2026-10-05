import React from "react";

const EMPTY_VALUE = "Not configured";

export interface RuntimeRegistryModel {
  id: string;
  codename?: string | null;
  displayName?: string | null;
  provider?: string | null;
  modelId?: string | null;
  tasks?: string[];
  capabilities?: string[];
  contextWindow?: number | null;
  toolSupport?: boolean;
  structuredOutput?: boolean;
  costClass?: string | null;
  availability?: string | null;
  priority?: number | null;
  enabled?: boolean;
  disabledReason?: string | null;
}

interface RuntimeProviderHealth {
  state?: string;
  checkedAt?: number | null;
}

interface RuntimeProviderMetadata {
  name?: string;
  type?: string;
  model?: string;
  health?: RuntimeProviderHealth;
}

export interface RuntimeRoutingAttempt {
  provider?: string | null;
  providerType?: string | null;
  model?: string | null;
  registryModelId?: string | null;
  codename?: string | null;
  source?: string | null;
  status?: string | null;
  durationMs?: number | null;
  errorCode?: string | null;
}

export interface RuntimeRoutingSnapshot {
  status?: string | null;
  at?: string | null;
  task?: string | null;
  reason?: string | null;
  registryModelId?: string | null;
  codename?: string | null;
  modelId?: string | null;
  provider?: string | null;
  source?: string | null;
  errorCode?: string | null;
  attempts?: RuntimeRoutingAttempt[];
}

interface RuntimeModelRegistryProps {
  mode?: string | null;
  providers?: RuntimeProviderMetadata[];
  activeProviderName?: string | null;
  models?: RuntimeRegistryModel[];
  lastRouting?: RuntimeRoutingSnapshot | null;
}

interface ProviderGroup {
  name: string;
  metadata: RuntimeProviderMetadata | null;
  models: RuntimeRegistryModel[];
}

function humanize(value?: string | null): string {
  if (!value) return EMPTY_VALUE;

  return value
    .replace(/[-_]+/gu, " ")
    .replace(/\b\w/gu, (character) =>
      character.toUpperCase(),
    );
}

function modelTitle(model: RuntimeRegistryModel): string {
  return (
    model.displayName ||
    model.codename ||
    model.id
  );
}

function modelWork(model: RuntimeRegistryModel): string {
  const tasks = model.tasks || [];

  return tasks.length > 0
    ? tasks.map(humanize).join(" · ")
    : "No task assignment";
}

function latestAttempt(
  model: RuntimeRegistryModel,
  lastRouting?: RuntimeRoutingSnapshot | null,
): RuntimeRoutingAttempt | null {
  const attempts = lastRouting?.attempts || [];

  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index];

    if (
      attempt.registryModelId === model.id ||
      (
        Boolean(model.modelId) &&
        attempt.model === model.modelId
      )
    ) {
      return attempt;
    }
  }

  return null;
}

function runtimeEvidence(
  model: RuntimeRegistryModel,
  lastRouting?: RuntimeRoutingSnapshot | null,
): {
  label: string;
  tone: "success" | "failed" | "neutral";
} {
  const attempt = latestAttempt(model, lastRouting);

  if (attempt?.status === "success") {
    return {
      label: "Last run succeeded",
      tone: "success",
    };
  }

  if (attempt?.status === "failed") {
    return {
      label: "Last run failed",
      tone: "failed",
    };
  }

  return {
    label: "No recent execution",
    tone: "neutral",
  };
}

function evidenceClass(
  tone: "success" | "failed" | "neutral",
): string {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (tone === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-500";
}

function providerGroups(
  providers: RuntimeProviderMetadata[],
  models: RuntimeRegistryModel[],
): ProviderGroup[] {
  const names = new Set<string>();

  for (const provider of providers) {
    if (provider.name) names.add(provider.name);
  }

  for (const model of models) {
    if (model.provider) names.add(model.provider);
  }

  return Array.from(names)
    .map((name) => ({
      name,
      metadata:
        providers.find(
          (provider) => provider.name === name,
        ) || null,
      models: models.filter(
        (model) => model.provider === name,
      ),
    }))
    .sort(
      (left, right) =>
        right.models.length - left.models.length ||
        left.name.localeCompare(right.name),
    );
}

function ModelRow({
  model,
  lastRouting,
}: Readonly<{
  model: RuntimeRegistryModel;
  lastRouting?: RuntimeRoutingSnapshot | null;
}>) {
  const evidence = runtimeEvidence(model, lastRouting);
  const selected =
    lastRouting?.registryModelId === model.id &&
    lastRouting?.status === "success";

  return (
    <article
      data-model-id={model.id}
      className="rounded-[20px] border border-slate-100 bg-white p-3.5 shadow-[0_8px_22px_rgba(50,90,58,0.05)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="wrap-break-word text-[13px] font-black text-slate-900">
              {modelTitle(model)}
            </h4>

            {selected && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-700">
                Last selected
              </span>
            )}
          </div>

          {model.codename && (
            <p className="mt-0.5 text-[9px] font-semibold text-slate-500">
              Worker · {model.codename}
            </p>
          )}
        </div>

        <span
          className={
            model.enabled
              ? "shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase text-emerald-700"
              : "shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[8px] font-black uppercase text-slate-500"
          }
        >
          {model.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      <div className="mt-3 rounded-xl bg-slate-50/80 px-3 py-2.5">
        <p className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">
          Provider model
        </p>
        <p className="mt-1 break-all text-[10px] font-bold leading-relaxed text-slate-700">
          {model.modelId || EMPTY_VALUE}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-100 px-3 py-2">
          <p className="text-[8px] font-bold uppercase text-slate-400">
            Work
          </p>
          <p className="mt-1 text-[10px] font-black text-slate-700">
            {modelWork(model)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-100 px-3 py-2">
          <p className="text-[8px] font-bold uppercase text-slate-400">
            Priority
          </p>
          <p className="mt-1 text-[10px] font-black text-slate-700">
            {model.priority ?? "—"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(model.capabilities || []).map((capability) => (
          <span
            key={capability}
            className="rounded-full border border-emerald-100 bg-emerald-50/70 px-2 py-1 text-[8px] font-bold text-emerald-800"
          >
            {humanize(capability)}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-1 text-[8px] font-black ${evidenceClass(
            evidence.tone,
          )}`}
        >
          {evidence.label}
        </span>

        <span className="text-[8px] font-semibold text-slate-400">
          {humanize(model.availability)}
        </span>
      </div>

      {!model.enabled && model.disabledReason && (
        <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-[9px] font-semibold leading-relaxed text-amber-800">
          Disabled: {humanize(model.disabledReason)}
        </p>
      )}
    </article>
  );
}

function ProviderCard({
  group,
  activeProviderName,
  lastRouting,
}: Readonly<{
  group: ProviderGroup;
  activeProviderName?: string | null;
  lastRouting?: RuntimeRoutingSnapshot | null;
}>) {
  const enabledCount = group.models.filter(
    (model) => model.enabled === true,
  ).length;

  const providerHealth =
    group.metadata?.health?.state || "UNKNOWN";

  const wasLastProvider =
    lastRouting?.provider === group.name;

  return (
    <details
      className="group overflow-hidden rounded-[24px] border border-emerald-100/80 bg-white/95 shadow-[0_12px_30px_rgba(50,90,58,0.07)]"
      open={group.models.length > 0}
    >
      <summary className="cursor-pointer list-none p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700/70">
              AI Provider
            </p>

            <h3 className="mt-1 wrap-break-word text-[16px] font-black text-slate-900">
              {group.name}
            </h3>

            <p className="mt-1 text-[9px] font-semibold text-slate-500">
              {humanize(group.metadata?.type)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[8px] font-black uppercase text-slate-600">
              {humanize(providerHealth)}
            </span>

            {activeProviderName === group.name && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[8px] font-black uppercase text-emerald-700">
                Default provider
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[8px] font-bold uppercase text-slate-400">
              Models
            </p>
            <p className="mt-1 text-sm font-black text-slate-800">
              {group.models.length}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[8px] font-bold uppercase text-slate-400">
              Enabled
            </p>
            <p className="mt-1 text-sm font-black text-slate-800">
              {enabledCount}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[8px] font-bold uppercase text-slate-400">
              Latest
            </p>
            <p className="mt-1 truncate text-[10px] font-black text-slate-800">
              {wasLastProvider
                ? humanize(lastRouting?.status)
                : "—"}
            </p>
          </div>
        </div>

        {wasLastProvider && (
          <p className="mt-3 text-[9px] font-semibold text-emerald-700">
            Last routed worker ·{" "}
            {lastRouting?.codename ||
              lastRouting?.registryModelId ||
              lastRouting?.modelId ||
              "Provider fallback"}
          </p>
        )}

        <p className="mt-3 text-[9px] font-bold text-slate-400">
          Tap to view provider models
        </p>
      </summary>

      <div className="border-t border-emerald-50 bg-slate-50/40 p-3">
        {group.models.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {group.models
              .slice()
              .sort(
                (left, right) =>
                  Number(right.enabled === true) -
                    Number(left.enabled === true) ||
                  (right.priority || 0) -
                    (left.priority || 0) ||
                  modelTitle(left).localeCompare(
                    modelTitle(right),
                  ),
              )
              .map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  lastRouting={lastRouting}
                />
              ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center">
            <p className="text-xs font-bold text-slate-600">
              No ORBIS model is assigned to this provider.
            </p>
          </div>
        )}
      </div>
    </details>
  );
}

export function RuntimeModelRegistry({
  mode,
  providers = [],
  activeProviderName,
  models = [],
  lastRouting,
}: Readonly<RuntimeModelRegistryProps>) {
  const groups = providerGroups(providers, models);
  const enabledModels = models.filter(
    (model) => model.enabled === true,
  ).length;

  return (
    <section
      aria-label="Runtime AI model registry"
      className="mb-4 rounded-[26px] border border-emerald-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,251,243,0.96))] p-4 shadow-[0_14px_34px_rgba(50,90,58,0.08)]"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700/70">
            ORBIS model control
          </p>

          <h2 className="mt-1 text-lg font-black text-slate-900">
            AI Providers & Models
          </h2>

          <p className="mt-1 max-w-2xl text-[10px] leading-relaxed text-slate-500">
            Providers are grouped automatically. Open a provider card to
            see the exact ORBIS models assigned to it and their latest
            runtime evidence.
          </p>
        </div>

        <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
          Routing · {humanize(mode)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-emerald-100 bg-white/90 px-3 py-3">
          <p className="text-[8px] font-black uppercase text-emerald-700/70">
            Providers
          </p>
          <p className="mt-1 text-base font-black text-slate-800">
            {groups.length}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-white/90 px-3 py-3">
          <p className="text-[8px] font-black uppercase text-emerald-700/70">
            Models
          </p>
          <p className="mt-1 text-base font-black text-slate-800">
            {models.length}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-white/90 px-3 py-3">
          <p className="text-[8px] font-black uppercase text-emerald-700/70">
            Enabled
          </p>
          <p className="mt-1 text-base font-black text-slate-800">
            {enabledModels}
          </p>
        </div>
      </div>

      {lastRouting && (
        <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 px-3 py-3">
          <p className="text-[8px] font-black uppercase tracking-wide text-emerald-700">
            Latest routing evidence
          </p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-700">
            <span>
              Task · {humanize(lastRouting.task)}
            </span>
            <span>
              Provider · {lastRouting.provider || "Unavailable"}
            </span>
            <span>
              Worker ·{" "}
              {lastRouting.codename ||
                lastRouting.registryModelId ||
                "Provider fallback"}
            </span>
            <span>
              Result · {humanize(lastRouting.status)}
            </span>
          </div>

          {lastRouting.at && (
            <p className="mt-2 text-[8px] text-slate-400">
              Observed ·{" "}
              {new Date(lastRouting.at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-5 text-center">
          <p className="text-xs font-bold text-slate-600">
            Runtime provider registry unavailable.
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
            No provider or model is invented by the dashboard.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3">
          {groups.map((group) => (
            <ProviderCard
              key={group.name}
              group={group}
              activeProviderName={activeProviderName}
              lastRouting={lastRouting}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-[9px] leading-relaxed text-slate-400">
        “Last run succeeded” means observed routing evidence from the
        latest ORBIS request. It is not presented as continuous model
        health when no model-specific execution has occurred.
      </p>
    </section>
  );
}

export default RuntimeModelRegistry;
