import React, { useEffect, useState } from "react";
import { termuxRuntimeService } from "../../../core/execution/runtimes/TermuxRuntimeService";
import { Terminal, Shield, Cpu, Copy, X, ArrowRight } from "lucide-react";

const MODAL_TITLE = "LOCAL RUNTIME DETAILS";
const RUNTIME_STATUS_TITLE = "Runtime Status";
const NOT_IMPLEMENTED = "NOT IMPLEMENTED";

export const LocalRuntime: React.FC = () => {
  const [runtimeStatus, setRuntimeStatus] = useState<{
    registered: boolean;
    connected: boolean;
    healthy: boolean;
    ready: boolean;
    state: string;
    version: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    const checkRuntime = async () => {
      try {
        const status = await termuxRuntimeService.check();
        if (active) {
          setRuntimeStatus(status);
        }
      } catch (error) {
        console.error("[ORBIS] Runtime health check failed:", error);

        if (active) {
          setRuntimeStatus({
            registered: false,
            connected: false,
            healthy: false,
            ready: false,
            state: "FAILED",
            version: "unknown",
          });
        }
      }
    };

    void checkRuntime();

    const timer = window.setInterval(checkRuntime, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const runtimeConnected = runtimeStatus?.connected === true;
  let runtimeStatusText = "CHECKING...";
  if (runtimeStatus !== null) {
    runtimeStatusText = runtimeConnected ? "CONNECTED" : "NOT CONNECTED";
  }

  const [showModal, setShowModal] = useState(false);

  const handleCopyDetails = async () => {
    const report = `ORBIS LOCAL RUNTIME STATUS

Execution Core: READY
Policy Engine: ACTIVE
Runtime Registry: ACTIVE
Lifecycle Manager: ACTIVE
Authorization Gate: ACTIVE

Local Runtime: NOT CONNECTED
Linux Runtime: NOT IMPLEMENTED
Python Runtime: NOT IMPLEMENTED
Android Bridge: NOT IMPLEMENTED
Root Access: DISABLED

Security:
PRIVILEGED = DENIED
SENSITIVE = REQUIRE_APPROVAL
UNKNOWN = DENIED

Architecture:
Brain -> Policy -> Registry -> Lifecycle -> Authorization -> Runtime`;

    try {
      await navigator.clipboard.writeText(report);
      alert("Copied to clipboard successfully!");
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <>
      {/* LOCAL RUNTIME CARD */}
      <div className="w-full rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100">
            <Terminal className="h-5 w-5 text-indigo-500" />
          </div>

          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-wide text-slate-800">
              LOCAL RUNTIME
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              ORBIS local execution observability
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-600">
              Execution Core
            </span>
            <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
              READY
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-600">
              Security Gate
            </span>
            <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
              ACTIVE
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-600">Runtime</span>
            <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
              NOT CONNECTED
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-600">Linux</span>
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              NOT IMPLEMENTED
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:col-span-2">
            <span className="text-sm font-medium text-slate-600">Android</span>
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              NOT IMPLEMENTED
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-3 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
        >
          VIEW DETAILS
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* LOCAL RUNTIME DETAILS */}
      {showModal && (
        <dialog
          open
          className="fixed inset-0 z-[100] m-0 flex h-dvh max-h-none w-screen max-w-none items-center justify-center bg-slate-950/70 p-3 sm:p-5 backdrop-blur-md"
          aria-modal="true"
          aria-labelledby="local-runtime-details-title"
        >
          <div className="flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/15 bg-slate-900/95 shadow-2xl">
            {/* GLASS HEADER */}
            <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-900/80 px-4 py-3 backdrop-blur-xl sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label="Close LOCAL RUNTIME details"
                  title="Close LOCAL RUNTIME details"
                  onClick={() => setShowModal(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="min-w-0">
                  <h2
                    id="local-runtime-details-title"
                    className="truncate text-base font-bold text-white sm:text-lg"
                  >
                    {MODAL_TITLE}
                  </h2>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    ORBIS execution foundation status
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyDetails}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-500/30 sm:px-4 sm:text-sm"
              >
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">COPY DETAILS</span>
                <span className="sm:hidden">COPY</span>
              </button>
            </div>

            {/* SCROLLABLE CONTENT */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="space-y-5">
                {/* EXECUTION CORE */}
                <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
                  <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Terminal className="h-4 w-4 text-indigo-400" />
                    Execution Core
                  </h3>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[
                      ["Contract", "READY"],
                      ["Policy Engine", "ACTIVE"],
                      [
                        "Runtime Registry",
                        runtimeStatus?.registered ? "ACTIVE" : "NOT REGISTERED",
                      ],
                      [
                        "Lifecycle Manager",
                        runtimeStatus?.ready ? "READY" : "WAITING",
                      ],
                      ["Authorization Gate", "ACTIVE"],
                    ].map(([item, status]) => (
                      <div
                        key={item}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/40 px-4 py-3"
                      >
                        <span className="text-sm text-slate-200">{item}</span>
                        <span className="shrink-0 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* SECURITY */}
                <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
                  <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Shield className="h-4 w-4 text-emerald-400" />
                    Security
                  </h3>

                  <div className="space-y-2">
                    {[
                      ["SAFE", "AUTHORIZATION AVAILABLE"],
                      ["SENSITIVE", "REQUIRE APPROVAL"],
                      ["PRIVILEGED", "DENIED"],
                      ["UNKNOWN", "DENIED"],
                    ].map(([risk, status]) => (
                      <div
                        key={risk}
                        className="grid grid-cols-1 gap-1 rounded-xl border border-white/5 bg-slate-950/30 px-4 py-3 sm:grid-cols-[130px_1fr] sm:items-center"
                      >
                        <span className="text-sm font-medium text-slate-200">
                          {risk}
                        </span>
                        <span className="text-xs font-mono text-slate-400 sm:text-right">
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* RUNTIME STATUS */}
                <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
                  <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Cpu className="h-4 w-4 text-blue-400" />
                    {RUNTIME_STATUS_TITLE}
                  </h3>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[
                      ["Local Runtime", runtimeStatusText],
                      ["Linux", NOT_IMPLEMENTED],
                      ["Python", NOT_IMPLEMENTED],
                      ["Android", NOT_IMPLEMENTED],
                      ["Root Access", "DISABLED"],
                    ].map(([runtime, status]) => (
                      <div
                        key={runtime}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/30 px-4 py-3"
                      >
                        <span className="text-sm text-slate-200">
                          {runtime}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-slate-400">
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* ARCHITECTURE */}
                <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center sm:p-5">
                  <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-300">
                    Architecture Flow
                  </h3>

                  <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-mono text-slate-400">
                    <span>Brain</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>Policy</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>Registry</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>Lifecycle</span>
                    <ArrowRight className="h-3 w-3" />
                    <span>Authorization</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="text-white">Future Local Runtime</span>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
};
