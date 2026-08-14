import React, { useEffect, useState } from "react";
import { CheckCircle2, Terminal } from "lucide-react";

type Task = {
  task: string;
  status: string;
  commit: string;
  objective: string;
  auditFile: string;
};
type Data = {
  completed: number;
  auditedTasks: number;
  progress: number;
  tasks: Task[];
  next: string;
};

export const TermuxObservatory: React.FC = () => {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const r = await fetch("/api/termux-observatory");
      if (!r.ok) throw new Error("API unavailable");
      setData(await r.json());
      setError("");
    } catch (e) {
      console.error("[TERMUX OBSERVATORY]", e);
      setError("LIVE OBSERVATORY DATA UNAVAILABLE");
    }
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="w-full rounded-[24px] border border-indigo-100 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100">
          <Terminal className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            TERMUX / ANDROID OBSERVATORY
          </h2>
          <p className="text-xs text-slate-500">
            Offline AI + Android implementation progress
          </p>
        </div>
      </div>
      {error ? (
        <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
          {error}
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase text-indigo-600">
                  Initiative Progress
                </p>
                <p className="mt-1 text-2xl font-black text-slate-800">
                  {data?.completed ?? 0}/{data?.auditedTasks ?? 0} TASKS
                </p>
              </div>
              <p className="text-3xl font-black text-indigo-600">
                {data?.progress ?? 0}%
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-indigo-600"
                style={{ width: `${data?.progress ?? 0}%` }}
              />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {(data?.tasks ?? []).map((task) => (
              <div
                key={`${task.task}-${task.commit}`}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-mono text-xs font-bold text-slate-700">
                  {task.task}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                  {task.objective}
                </span>
                <span className="text-[10px] font-bold text-emerald-600">
                  {task.status}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-slate-600">
            {data?.next}
          </p>
        </>
      )}
    </section>
  );
};
