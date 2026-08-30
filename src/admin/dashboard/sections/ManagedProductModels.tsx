import React, { useCallback, useEffect, useState } from "react";
import {
  loadManagedProductModels,
  publishManagedProductModel,
} from "../../models/modelRegistryClient";
import type { ManagedProductModel } from "../../models/types";

interface ManagedProductModelsProps {
  previewMode?: boolean;
  loadModels?: () => Promise<ManagedProductModel[]>;
  publishModel?: (slug: string) => Promise<ManagedProductModel>;
}

function versionLabel(version: number | null | undefined): string {
  return typeof version === "number" ? `v${version}` : "Not created";
}

export function ManagedProductModels({
  previewMode = false,
  loadModels = loadManagedProductModels,
  publishModel = publishManagedProductModel,
}: Readonly<ManagedProductModelsProps>) {
  const [models, setModels] = useState<ManagedProductModel[]>([]);
  const [isLoading, setIsLoading] = useState(!previewMode);
  const [isPublishing, setIsPublishing] = useState<string | null>(null);
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

  const publish = async (model: ManagedProductModel) => {
    const currentVersion = model.currentVersion;
    if (!currentVersion || isPublishing || previewMode) return;
    const approved = window.confirm(
      `Publish ${model.displayName} ${versionLabel(currentVersion.sequence)}? ` +
        "This creates the public snapshot and opens its copy as the next editable draft.",
    );
    if (!approved) return;

    setIsPublishing(model.slug);
    setError(null);
    try {
      const updated = await publishModel(model.slug);
      setModels((current) =>
        current.map((item) => (item.slug === updated.slug ? updated : item)),
      );
    } catch {
      setError("The Accounting AI version could not be published.");
    } finally {
      setIsPublishing(null);
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

  return (
    <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-900">
            Managed product models
          </h3>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            Draft is editable by Admin. Public users will resolve only the
            published snapshot when the standalone app is connected.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading || Boolean(isPublishing)}
          className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 disabled:opacity-50"
        >
          {isLoading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs text-orange-800"
        >
          {error}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {models.map((model) => {
          const definition =
            model.currentVersion?.definition ||
            model.publishedVersion?.definition;
          const current = model.currentVersion;
          const published = model.publishedVersion;
          return (
            <article
              key={model.id}
              className="rounded-2xl border border-emerald-100 bg-emerald-50/35 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                    {model.category.replace(/_/g, " ")}
                  </p>
                  <h4 className="mt-1 text-sm font-black text-slate-900">
                    {model.displayName}
                  </h4>
                </div>
                <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[9px] font-bold text-emerald-700">
                  {model.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-white bg-white/85 p-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    Current / Draft
                  </p>
                  <p className="mt-1 text-xs font-black text-slate-900">
                    {versionLabel(current?.sequence)}
                  </p>
                </div>
                <div className="rounded-xl border border-white bg-white/85 p-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    Published / Public
                  </p>
                  <p className="mt-1 text-xs font-black text-slate-900">
                    {versionLabel(published?.sequence)}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(definition?.modules || []).map((module) => (
                  <span
                    key={module.slug}
                    className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[9px] font-semibold text-slate-600"
                  >
                    {module.name}
                  </span>
                ))}
                <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[9px] font-semibold text-orange-800">
                  AI: analysis only
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-semibold text-slate-600">
                  Web search: disabled
                </span>
              </div>

              <button
                type="button"
                onClick={() => void publish(model)}
                disabled={!current || isPublishing === model.slug}
                className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPublishing === model.slug
                  ? "Publishing…"
                  : `Publish ${versionLabel(current?.sequence)}`}
              </button>
            </article>
          );
        })}

        {!isLoading && models.length === 0 && !error && (
          <p className="py-3 text-xs text-slate-500">
            No managed product model is registered.
          </p>
        )}
      </div>
    </section>
  );
}
