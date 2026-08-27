import React, { useState } from "react";
import { readAdminJson } from "../auth/adminFetch";

const EXPORT_PATH = "/api/admin/diagnostic-export";

async function loadRedactedReport(): Promise<string> {
  const report = await readAdminJson<Record<string, unknown>>(EXPORT_PATH);
  return JSON.stringify(report, null, 2);
}

export function DiagnosticExportActions() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: "copy" | "download") => {
    setBusy(true);
    setStatus(null);
    try {
      const json = await loadRedactedReport();
      if (action === "copy") {
        await navigator.clipboard.writeText(json);
        setStatus("Redacted diagnostic report copied.");
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "orbis-foundation-diagnostic.json";
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus("Redacted diagnostic report downloaded.");
      }
    } catch {
      setStatus("Redacted diagnostic report is unavailable.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Admin diagnostic export"
      className="mx-5 mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">
            Redacted Admin Diagnostic
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Safe operational facts only; no secrets, chat, memory, or source
            content.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-label="Copy redacted diagnostic report"
            disabled={busy}
            onClick={() => void run("copy")}
            className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            Save to clipboard
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("download")}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            Download JSON
          </button>
        </div>
      </div>
      {status && (
        <output className="mt-2 block text-xs font-semibold text-slate-600">
          {status}
        </output>
      )}
    </section>
  );
}

export { EXPORT_PATH, loadRedactedReport };
