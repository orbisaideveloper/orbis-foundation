import { Copy, Download, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../core/supabase/client";
import { chatStorage } from "../storage/ChatStorageManager";
import type { ResolvedChatTestLogEntry } from "../storage/chatStorage.types";
import {
  formatTestLogEntries,
  formatTestLogEntry,
  testLogDayKey,
} from "../utils/chatTestLogFormat";

interface BrainChatTestLogProps {
  previewMode: boolean;
}

const STORAGE_DISABLED = "storage-disabled";
const BENGALI_LOCALE = "bn-BD";

type LogState = "loading" | "ready" | typeof STORAGE_DISABLED | "error";

function displayDate(value: string): string {
  return new Intl.DateTimeFormat(BENGALI_LOCALE, { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function displayDuration(value: number): string {
  return value < 1_000 ? `${Math.round(value)} ms` : `${(value / 1_000).toFixed(2)} sec`;
}

function sourceLabel(entry: ResolvedChatTestLogEntry): string {
  return `${entry.providerName} · ${entry.providerType}`;
}

export function BrainChatTestLog({ previewMode }: Readonly<BrainChatTestLogProps>) {
  const [state, setState] = useState<LogState>(
    previewMode ? STORAGE_DISABLED : "loading",
  );
  const [profileId, setProfileId] = useState("");
  const [entries, setEntries] = useState<ResolvedChatTestLogEntry[]>([]);
  const [selectedDay, setSelectedDay] = useState("all");
  const [notice, setNotice] = useState("");

  const loadEntries = useCallback(async () => {
    if (previewMode) return;
    setState("loading");
    setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      const resolvedProfileId =
        data.session?.user.id || chatStorage.getOrCreateAnonymousProfileId();
      setProfileId(resolvedProfileId);
      if (chatStorage.getConsent(resolvedProfileId) !== "accepted") {
        setState(STORAGE_DISABLED);
        return;
      }
      await chatStorage.init();
      setEntries(await chatStorage.getTestLogEntries(resolvedProfileId));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [previewMode]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const days = useMemo(
    () => Array.from(new Set(entries.map((entry) => testLogDayKey(entry.completedAt)))),
    [entries],
  );
  const visibleEntries = useMemo(
    () =>
      selectedDay === "all"
        ? entries
        : entries.filter((entry) => testLogDayKey(entry.completedAt) === selectedDay),
    [entries, selectedDay],
  );

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Log কপি হয়েছে।");
    } catch {
      setNotice("এই browser-এ clipboard অনুমতি পাওয়া যায়নি।");
    }
  };

  const exportText = () => {
    const payload = formatTestLogEntries(visibleEntries);
    const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orbis-chat-test-log-${selectedDay}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const clearLogs = async () => {
    if (!profileId || !window.confirm("সব local Chat Test Log মুছবেন? Chat history থাকবে।")) {
      return;
    }
    try {
      await chatStorage.clearTestLogs(profileId);
      setEntries([]);
      setSelectedDay("all");
      setNotice("শুধু Chat Test Log মুছে গেছে। Chat history অক্ষত আছে।");
    } catch {
      setNotice("Chat Test Log মুছতে পারেনি।");
    }
  };

  if (previewMode) {
    return (
      <section className="rounded-[22px] border border-orange-100 bg-orange-50/70 p-4 text-xs leading-relaxed text-orange-800">
        Public preview-তে private phone-local Chat Test Log খোলা যাবে না।
      </section>
    );
  }

  if (state === "loading") {
    return <p className="py-6 text-center text-xs text-slate-400">Loading local Chat Test Log…</p>;
  }

  if (state === STORAGE_DISABLED) {
    return (
      <section className="rounded-[22px] border border-orange-100 bg-orange-50/70 p-4 text-xs leading-relaxed text-orange-800">
        Device chat storage চালু করলে আপনার private Test Log এই phone-এ দেখা যাবে।
      </section>
    );
  }

  if (state === "error") {
    return (
      <section className="rounded-[22px] border border-orange-100 bg-orange-50/70 p-4 text-xs leading-relaxed text-orange-800">
        Local Chat Test Log এখন পড়া যাচ্ছে না। Chat history বা server data পরিবর্তন করা হয়নি।
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">Continuous Chat Test Log</h3>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-slate-500">
              প্রশ্ন ও উত্তর বর্তমান device-local history থেকেই পড়া হয়। এই log শুধু সময়,
              source, route ও result-এর reference রাখে।
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadEntries()} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600">
              <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Refresh
            </button>
            <button type="button" disabled={visibleEntries.length === 0} onClick={() => void copy(formatTestLogEntries(visibleEntries))} className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 disabled:opacity-40">
              <Copy className="mr-1 inline h-3.5 w-3.5" /> Copy log
            </button>
            <button type="button" disabled={visibleEntries.length === 0} onClick={exportText} className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 disabled:opacity-40">
              <Download className="mr-1 inline h-3.5 w-3.5" /> Export .txt
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <label className="text-[11px] font-bold text-slate-600">
            দিন দেখুন
            <select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]">
              <option value="all">সব দিন</option>
              {days.map((day) => <option key={day} value={day}>{displayDate(day)}</option>)}
            </select>
          </label>
          <button type="button" disabled={entries.length === 0} onClick={() => void clearLogs()} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-bold text-red-600 disabled:opacity-40">
            <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Clear Test Log
          </button>
        </div>
        {notice && <output className="mt-3 block text-[11px] font-semibold text-emerald-700">{notice}</output>}
      </section>

      {visibleEntries.length === 0 ? (
        <section className="rounded-[22px] border border-dashed border-emerald-200 bg-emerald-50/35 p-6 text-center text-xs leading-relaxed text-slate-500">
          এখনো কোনো local Chat Test Log নেই। নতুন real chat পাঠালে তার source, route ও response time এখানে আসবে।
        </section>
      ) : (
        visibleEntries.map((entry) => (
          <article key={entry.id} className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-slate-500">
              <span>{new Intl.DateTimeFormat(BENGALI_LOCALE, { dateStyle: "medium", timeStyle: "medium" }).format(entry.completedAt)}</span>
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-emerald-700">{entry.outcome}</span>
            </div>
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/75 p-3 text-xs leading-relaxed text-slate-700"><b>আপনি</b><br />{entry.userMessage?.content || "Local message unavailable"}</div>
            <div className="mt-2 rounded-xl border border-orange-100 bg-orange-50/45 p-3 text-xs leading-relaxed text-slate-700"><b>ORBIS</b><br />{entry.assistantMessage?.content || "Local message unavailable"}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
              <span className="rounded-lg bg-slate-50 p-2"><b className="block text-slate-700">Source</b>{sourceLabel(entry)}</span>
              <span className="rounded-lg bg-slate-50 p-2"><b className="block text-slate-700">Route</b>{entry.route || "Unavailable"}</span>
              <span className="rounded-lg bg-slate-50 p-2"><b className="block text-slate-700">Response</b>{displayDuration(entry.durationMs)}</span>
              <span className="rounded-lg bg-slate-50 p-2"><b className="block text-slate-700">Delivery</b>{entry.delivery}</span>
            </div>
            <div className="mt-3 text-right"><button type="button" onClick={() => void copy(formatTestLogEntry(entry))} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-700"><Copy className="mr-1 inline h-3.5 w-3.5" /> Copy entry</button></div>
          </article>
        ))
      )}
    </div>
  );
}
