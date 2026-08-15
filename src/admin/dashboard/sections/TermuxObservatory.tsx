import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Terminal,
  ChevronLeft,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";

type Task = {
  task: string;
  status: string;
  passed: boolean;
  commit: string;
  objective: string;
  implementationSummary: string;
  changedFiles: string[];
  filesByLayer: Record<string, string[]>;
  dependencies: string[];
  tests: string;
  coverage: string;
  build: string;
  typeCheck: string;
  security: string;
  architectureImpact: string;
  knownIssues: string;
  date: string;
  time: string;
  implementer: string;
  auditFile: string;
};

type Data = {
  title: string;
  purpose: string;
  work: string;
  completed: number;
  auditedTasks: number;
  progress: number;
  tasks: Task[];
  next: string;
};

const empty: Data = {
  title: "TERMUX / ANDROID OBSERVATORY",
  purpose: "Waiting for repository-backed data.",
  work: "Waiting...",
  completed: 0,
  auditedTasks: 0,
  progress: 0,
  tasks: [],
  next: "UNKNOWN",
};

// কলাপসিবল সেকশন কম্পোনেন্ট (Native HTML details/summary দিয়ে বানানো, কোনো স্টেট লাগে না)
const DetailsSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <details className="group rounded-xl border border-white/10 bg-white/5 overflow-hidden transition-all duration-300">
    <summary className="cursor-pointer p-4 text-[11px] font-bold uppercase tracking-wider text-slate-300 hover:bg-white/10 flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
      {title}
      <ChevronDown className="w-4 h-4 transition-transform duration-300 group-open:rotate-180" />
    </summary>
    <div className="p-4 border-t border-white/10 text-sm text-slate-300 bg-black/20">
      {children}
    </div>
  </details>
);

export const TermuxObservatory: React.FC = () => {
  const [d, setD] = useState<Data>(empty);
  const [err, setErr] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/termux-observatory");
      if (!r.ok) throw Error("API");
      setD(await r.json());
      setErr("");
    } catch (e) {
      console.error(e);
      setErr("LIVE OBSERVATORY DATA UNAVAILABLE");
    }
  }

  useEffect(() => {
    void load();
    const i = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(i);
  }, []);

  async function copyTaskData(t: Task) {
    const textToCopy = `${t.task}\n${t.objective}\n\nSTATUS: ${t.status}\n\nPURPOSE:\n${t.objective}\n\nCORE LOGIC / SUMMARY:\n${t.implementationSummary}\n\nDEPENDENCY:\n${t.dependencies?.length ? t.dependencies.join(", ") : "None"}\n\nSOURCE FILES:\n${Object.values(t.filesByLayer).flat().join("\n")}\n\nCOMMIT:\n${t.commit}\n\nAUDIT:\n${t.auditFile}`;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Copy failed", e);
    }
  }

  // সিস্টেম ব্যাক বাটন দিয়ে মোডাল বন্ধ করার লজিক
  useEffect(() => {
    if (task) {
      window.history.pushState({ modal: true }, "");
      const handlePop = () => setTask(null);
      window.addEventListener("popstate", handlePop);
      return () => window.removeEventListener("popstate", handlePop);
    }
  }, [task]);

  return (
    <section className="w-full rounded-[24px] border border-indigo-100 bg-white p-5 shadow-sm">
      {/* হেডার */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-2.5">
            <Terminal className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">{d.title}</h2>
            <p className="text-[11px] text-slate-500 font-medium tracking-wide uppercase mt-0.5">
              REAL Git + audit evidence
            </p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 tracking-wider">
          LIVE
        </span>
      </div>

      {err ? (
        <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100">
          {err}
        </div>
      ) : (
        <>
          {/* প্রোগ্রেস বার (48471.jpg এর মতো) */}
          <div className="rounded-[16px] bg-[#F8FAFC] border border-slate-100 p-5 shadow-inner">
            <div className="flex justify-between items-end mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">
                  Initiative Progress
                </p>
                <p className="text-2xl font-black text-slate-800 tracking-tight">
                  {d.completed}/{d.auditedTasks} TASKS
                </p>
              </div>
              <b className="text-3xl font-black text-indigo-600">
                {d.progress}%
              </b>
            </div>
            <div className="h-2.5 w-full rounded-full bg-indigo-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-500 ease-out"
                style={{ width: `${d.progress}%` }}
              />
            </div>
          </div>

          {/* টাস্ক লিস্ট (কমপ্যাক্ট রো) */}
          <div className="mt-5 space-y-2.5">
            {d.tasks.map((t) => (
              <button
                type="button"
                key={`${t.task}-${t.commit}`}
                onClick={() => setTask(t)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left hover:border-indigo-300 hover:shadow-md transition-all active:scale-[0.98]"
              >
                <CheckCircle2
                  className={`h-5 w-5 flex-shrink-0 ${/PASS|COMPLETED/i.test(t.status) ? "text-emerald-500" : "text-amber-500"}`}
                />
                <b className="font-mono text-[13px] text-slate-700">{t.task}</b>
                <span className="flex-1 truncate text-[13px] font-medium text-slate-500">
                  {t.objective.replace(/Implement /i, "")}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase ${/PASS|COMPLETED/i.test(t.status) ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {t.status}
                </span>
              </button>
            ))}
          </div>

          {/* Next Task Indicator */}
          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-4 text-[12px] font-medium text-slate-500 text-center leading-relaxed">
            {d.next}
          </div>
        </>
      )}

      {/* লেভেল ২: ডার্ক গ্লাস মোডাল (Drill-Down) */}
      {task && (
        <div className="fixed inset-0 z-[100] flex justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200 overflow-y-auto">
          <div className="relative w-full max-w-2xl h-fit my-auto rounded-[24px] bg-[#0F172A]/90 backdrop-blur-xl border border-white/10 shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] flex flex-col text-white animate-in zoom-in-95 duration-200">
            {/* টপ বার: Back & Copy */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-white/10 bg-[#0F172A]/50 backdrop-blur-md rounded-t-[24px]">
              <button
                type="button"
                onClick={() => setTask(null)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors py-1 px-2 rounded-lg hover:bg-white/5 active:scale-95"
              >
                <ChevronLeft className="w-5 h-5" /> Back
              </button>

              <button
                type="button"
                onClick={() => void copyTaskData(task)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider transition-all active:scale-95 ${copied ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : "bg-white/10 border-white/10 text-slate-200 hover:bg-white/20"}`}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            {/* ডিটেইলস কনটেন্ট */}
            <div className="p-5 sm:p-6 space-y-6">
              {/* মেইন ইনফো (Always Visible) */}
              <div>
                <h3 className="text-xl sm:text-2xl font-black tracking-tight">
                  {task.task}
                </h3>
                <p className="text-slate-300 text-sm sm:text-[15px] font-medium mt-1 leading-relaxed">
                  {task.objective}
                </p>
                <span className="inline-block mt-3 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400 uppercase tracking-wider shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)]">
                  Status: {task.status}
                </span>
              </div>

              {/* কোর লজিক */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" /> Core Logic / Summary
                </div>
                <div className="text-sm text-slate-200 leading-relaxed">
                  {task.implementationSummary}
                </div>
              </div>

              {/* লেভেল ৩: কলাপসিবল সেকশনস */}
              <div className="space-y-2.5">
                <DetailsSection title="Dependencies">
                  {task.dependencies.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {task.dependencies.map((dep) => (
                        <span
                          key={dep}
                          className="bg-white/10 px-2.5 py-1 rounded-md font-mono text-[11px]"
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">
                      None reported.
                    </span>
                  )}
                </DetailsSection>

                <DetailsSection title="Source Files">
                  {Object.entries(task.filesByLayer).map(([layer, files]) => (
                    <div key={layer} className="mb-4 last:mb-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        {layer}
                      </div>
                      <div className="space-y-1">
                        {files.map((f) => (
                          <div
                            key={f}
                            className="font-mono text-[11px] text-slate-300 bg-black/30 p-1.5 rounded border border-white/5 break-all"
                          >
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </DetailsSection>

                <DetailsSection title="Tests & Coverage">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">
                        Tests
                      </div>
                      <div className="text-[13px] font-medium">
                        {task.tests}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">
                        Coverage
                      </div>
                      <div className="text-[13px] font-medium">
                        {task.coverage}
                      </div>
                    </div>
                  </div>
                </DetailsSection>

                <DetailsSection title="Build & Type Check">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">
                        Build
                      </div>
                      <div className="text-[13px] font-medium">
                        {task.build}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">
                        Type Check
                      </div>
                      <div className="text-[13px] font-medium">
                        {task.typeCheck}
                      </div>
                    </div>
                  </div>
                </DetailsSection>

                <DetailsSection title="Security & Architecture">
                  <div className="space-y-4">
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">
                        Security
                      </div>
                      <div className="text-[13px] font-medium leading-relaxed">
                        {task.security}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">
                        Architecture Impact
                      </div>
                      <div className="text-[13px] font-medium leading-relaxed">
                        {task.architectureImpact}
                      </div>
                    </div>
                  </div>
                </DetailsSection>

                <DetailsSection title="Commit & Audit Info">
                  <div className="font-mono text-[11px] space-y-2 text-slate-400 bg-black/30 p-3 rounded-lg border border-white/5">
                    <p>
                      <span className="text-slate-500">COMMIT:</span>{" "}
                      <span className="text-slate-200">{task.commit}</span>
                    </p>
                    <p>
                      <span className="text-slate-500">DATE:</span> {task.date}{" "}
                      {task.time}
                    </p>
                    <p>
                      <span className="text-slate-500">AUTHOR:</span>{" "}
                      {task.implementer}
                    </p>
                    <p>
                      <span className="text-slate-500">AUDIT FILE:</span>{" "}
                      {task.auditFile}
                    </p>
                  </div>
                </DetailsSection>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
