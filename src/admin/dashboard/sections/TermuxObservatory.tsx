import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clipboard,
  GitCommit,
  Network,
  Terminal,
  X,
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
  currentPhase: string;
  currentResult: string;
  completed: number;
  auditedTasks: number;
  progress: number;
  tasks: Task[];
  next: string;
  systemMap: {
    frontend: string[];
    backend: string[];
    core: string[];
    runtime: string[];
    audit: string[];
    edges: { from: string; to: string }[];
  };
};
const empty: Data = {
  title: "TERMUX / ANDROID OBSERVATORY",
  purpose: "Waiting for repository-backed data.",
  work: "Waiting for repository-backed data.",
  currentPhase: "UNKNOWN",
  currentResult: "UNKNOWN",
  completed: 0,
  auditedTasks: 0,
  progress: 0,
  tasks: [],
  next: "UNKNOWN",
  systemMap: {
    frontend: [],
    backend: [],
    core: [],
    runtime: [],
    audit: [],
    edges: [],
  },
};
export const TermuxObservatory: React.FC = () => {
  const [d, setD] = useState(empty),
    [err, setErr] = useState(""),
    [task, setTask] = useState<Task | null>(null),
    [map, setMap] = useState(false),
    [copied, setCopied] = useState(false);
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
  async function copy() {
    if (!task) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(task, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error(e);
    }
  }
  return (
    <section className="w-full rounded-[24px] border border-indigo-100 bg-white p-5 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-3">
            <Terminal className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">{d.title}</h2>
            <p className="text-xs text-slate-500">REAL Git + audit evidence</p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700">
          LIVE
        </span>
      </div>
      {err ? (
        <div className="mt-5 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600">
          {err}
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-2xl bg-indigo-50/60 p-4">
            <div className="flex justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase text-indigo-600">
                  Initiative Progress
                </p>
                <p className="text-2xl font-black text-slate-800">
                  {d.completed}/{d.auditedTasks} TASKS
                </p>
              </div>
              <b className="text-3xl text-indigo-600">{d.progress}%</b>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white">
              <div
                className="h-2 rounded-full bg-indigo-600"
                style={{ width: `${d.progress}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMap(true)}
            className="mt-4 w-full rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-left"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-700">
              <Network className="h-4 w-4" /> PURPOSE + SYSTEM MAP
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {d.purpose}
            </p>
            <p className="mt-1 text-xs text-slate-500">{d.work}</p>
          </button>
          <div className="mt-4 space-y-2">
            {d.tasks.map((t) => (
              <button
                type="button"
                key={`${t.task}-${t.commit}`}
                onClick={() => setTask(t)}
                className="flex w-full items-center gap-3 rounded-xl border bg-slate-50 p-3 text-left"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <b className="font-mono text-xs">{t.task}</b>
                <span className="flex-1 truncate text-xs text-slate-500">
                  {t.objective}
                </span>
                <b className="text-[10px] text-emerald-600">{t.status}</b>
              </button>
            ))}
          </div>
          <p className="mt-4 rounded-xl bg-indigo-50 p-3 text-xs text-slate-600">
            {d.next}
          </p>
        </>
      )}
      {(task || map) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-slate-950 p-5 text-white">
            <div className="flex justify-between">
              <b>
                {task ? `${task.task} — REAL EVIDENCE` : "PURPOSE / SYSTEM MAP"}
              </b>
              <button
                type="button"
                onClick={() => {
                  setTask(null);
                  setMap(false);
                }}
              >
                <X />
              </button>
            </div>
            {task ? (
              <div className="mt-5 space-y-4">
                <p>
                  <small>OBJECTIVE</small>
                  <br />
                  {task.objective}
                </p>
                <p>
                  <small>ACTUAL WORK / RESULT</small>
                  <br />
                  {task.implementationSummary}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    "tests",
                    "coverage",
                    "typeCheck",
                    "build",
                    "security",
                    "architectureImpact",
                  ].map((k) => (
                    <div key={k} className="rounded-xl bg-white/5 p-3">
                      <small>{k}</small>
                      <p className="text-xs">{(task as any)[k]}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <small>FILES</small>
                  {Object.entries(task.filesByLayer).map(([k, v]) => (
                    <div key={k} className="mt-2 rounded-lg bg-white/5 p-2">
                      <b className="text-[10px]">{k}</b>
                      {v.map((f) => (
                        <p key={f} className="font-mono text-[11px] break-all">
                          {f}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
                <div>
                  <small>DEPENDENCIES</small>
                  {task.dependencies.length ? (
                    task.dependencies.map((x) => (
                      <p key={x} className="font-mono text-[11px]">
                        {x}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs">None detected.</p>
                  )}
                </div>
                <p className="font-mono text-xs">
                  COMMIT: {task.commit}
                  <br />
                  {task.date} {task.time} · {task.implementer}
                  <br />
                  {task.auditFile}
                </p>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 p-3 text-sm font-bold"
                >
                  <Clipboard className="h-4 w-4" />
                  {copied ? "COPIED" : "COPY FULL TASK EVIDENCE"}
                </button>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <p>{d.purpose}</p>
                <p>{d.work}</p>
                {(
                  ["frontend", "backend", "core", "runtime", "audit"] as const
                ).map((k) => (
                  <div key={k} className="rounded-xl bg-white/5 p-3">
                    <b className="text-[10px]">{k}</b>
                    {d.systemMap[k].map((f) => (
                      <p key={f} className="font-mono text-[11px] break-all">
                        {f}
                      </p>
                    ))}
                  </div>
                ))}
                <p>
                  {d.currentPhase} — {d.currentResult}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
