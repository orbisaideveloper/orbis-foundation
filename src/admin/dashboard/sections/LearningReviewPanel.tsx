import React, { useCallback, useEffect, useState } from "react";
import { readAdminJson } from "../../auth/adminFetch";

type ReviewPattern = {
  route: string;
  intent: string;
  confidence: string;
  evidenceRequired: boolean;
  reason: string;
  outcome: "corrected" | "failed";
  feedbackCode: string;
  occurrences: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
};

type LearningCandidate = {
  content: string;
  category: string;
  tags: string[];
};

type CandidatePreview = {
  candidate: LearningCandidate;
  approvalToken: string;
  expiresAt: number;
};

type LearningRecord = LearningCandidate & {
  id: string;
  isActive: boolean;
  createdAt: string;
};

type LearningReviewPanelProps = {
  previewMode: boolean;
};

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}

function patternLabel(pattern: ReviewPattern): string {
  return `${pattern.feedbackCode} · ${pattern.outcome}`;
}

function reviewPatternRequest(pattern: ReviewPattern) {
  return {
    route: pattern.route,
    intent: pattern.intent,
    confidence: pattern.confidence,
    evidenceRequired: pattern.evidenceRequired,
    reason: pattern.reason,
    outcome: pattern.outcome,
    feedbackCode: pattern.feedbackCode,
  };
}

async function readLearningJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return readAdminJson<T>(`/api/chat/learning${path}`, init);
}

export function LearningReviewPanel({
  previewMode,
}: Readonly<LearningReviewPanelProps>) {
  const [patterns, setPatterns] = useState<ReviewPattern[]>([]);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [candidatePreview, setCandidatePreview] =
    useState<CandidatePreview | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<ReviewPattern | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (previewMode) return;
    setLoading(true);
    setError(null);
    try {
      const [reviewResponse, recordsResponse] = await Promise.all([
        readLearningJson<{ patterns: ReviewPattern[] }>("/review-patterns"),
        readLearningJson<{ records: LearningRecord[] }>("/records"),
      ]);
      setPatterns(Array.isArray(reviewResponse.patterns) ? reviewResponse.patterns : []);
      setRecords(Array.isArray(recordsResponse.records) ? recordsResponse.records : []);
    } catch {
      setError("Learning review is currently unavailable.");
    } finally {
      setLoading(false);
    }
  }, [previewMode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const previewRule = async (pattern: ReviewPattern) => {
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const preview = await readLearningJson<CandidatePreview>(
        "/review-patterns/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consent: true,
            pattern: reviewPatternRequest(pattern),
          }),
        },
      );
      setSelectedPattern(pattern);
      setCandidatePreview(preview);
    } catch {
      setCandidatePreview(null);
      setSelectedPattern(null);
      setError("This pattern is unavailable for review. Refresh and try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const approveRule = async () => {
    if (!candidatePreview) return;
    setActionLoading(true);
    setError(null);
    try {
      await readLearningJson("/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          candidate: candidatePreview.candidate,
          approvalToken: candidatePreview.approvalToken,
        }),
      });
      setCandidatePreview(null);
      setSelectedPattern(null);
      setNotice("Rule approved and stored. Brain use remains disabled until Phase 2B.");
      await refresh();
    } catch {
      setError("The rule could not be approved. No change was saved.");
    } finally {
      setActionLoading(false);
    }
  };

  const rejectPreview = () => {
    setCandidatePreview(null);
    setSelectedPattern(null);
    setNotice("No rule was saved. This pattern remains available for later review.");
  };

  const removeRule = async (record: LearningRecord) => {
    if (!window.confirm("Remove this approved rule? This cannot be undone.")) return;
    setActionLoading(true);
    setError(null);
    try {
      await readLearningJson(`/records/${record.id}`, { method: "DELETE" });
      setNotice("Approved rule removed. Brain behaviour remains unchanged.");
      await refresh();
    } catch {
      setError("The approved rule could not be removed.");
    } finally {
      setActionLoading(false);
    }
  };

  if (previewMode) {
    return (
      <section className="rounded-[22px] border border-orange-100 bg-orange-50/70 p-4 text-xs leading-relaxed text-orange-800">
        Learning Review is an authenticated Admin control. Public preview does
        not load patterns, approved rules, or learning actions.
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">Learning review</h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Only aggregated decision metadata appears here. Chat text, user
              identity, answers, prompts, and provider output are never shown
              or used to create a rule.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || actionLoading}
            className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs text-orange-700">{error}</p>}
        {notice && <p role="status" className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
      </section>

      {candidatePreview && selectedPattern && (
        <section className="rounded-[22px] border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Admin decision required</p>
          <h3 className="mt-2 text-sm font-black text-slate-900">Proposed safe rule</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{candidatePreview.candidate.content}</p>
          <p className="mt-2 text-[10px] text-slate-500">
            Based on aggregated pattern: {patternLabel(selectedPattern)} · expires {formatTime(new Date(candidatePreview.expiresAt).toISOString())}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void approveRule()}
              disabled={actionLoading}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-60"
            >
              Approve rule
            </button>
            <button
              type="button"
              onClick={rejectPreview}
              disabled={actionLoading}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-60"
            >
              Do not save
            </button>
          </div>
        </section>
      )}

      <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">Patterns awaiting review</h3>
        <p className="mt-1 text-[10px] text-slate-500">
          These are aggregated non-confirmed outcomes. Creating a preview does not write a rule.
        </p>
        <div className="mt-3 space-y-2">
          {patterns.map((pattern) => (
            <article key={`${pattern.route}-${pattern.intent}-${pattern.confidence}-${pattern.evidenceRequired}-${pattern.reason}-${pattern.outcome}-${pattern.feedbackCode}`} className="rounded-2xl border border-emerald-50 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-slate-800">{patternLabel(pattern)}</h4>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                    {pattern.occurrences} occurrence{pattern.occurrences === 1 ? "" : "s"} · {pattern.route} · {pattern.intent} · evidence {pattern.evidenceRequired ? "required" : "not required"}
                  </p>
                  <p className="mt-1 text-[9px] text-slate-400">Latest: {formatTime(pattern.lastOccurredAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void previewRule(pattern)}
                  disabled={actionLoading}
                  className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 disabled:opacity-60"
                >
                  Review rule
                </button>
              </div>
            </article>
          ))}
          {!loading && patterns.length === 0 && (
            <p className="py-4 text-xs text-slate-400">No non-confirmed learning patterns are awaiting review.</p>
          )}
        </div>
      </section>

      <section className="rounded-[22px] border border-emerald-100 bg-white/85 p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">Approved rules</h3>
        <p className="mt-1 text-[10px] text-slate-500">Stored rules are not yet consumed by Brain decisions.</p>
        <div className="mt-3 space-y-2">
          {records.map((record) => (
            <article key={record.id} className="rounded-2xl border border-emerald-50 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-slate-800">{record.category}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{record.content}</p>
                  <p className="mt-1 text-[9px] text-slate-400">{record.tags.join(" · ")} · saved {formatTime(record.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeRule(record)}
                  disabled={actionLoading}
                  className="shrink-0 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[10px] font-bold text-orange-700 disabled:opacity-60"
                >
                  Remove rule
                </button>
              </div>
            </article>
          ))}
          {!loading && records.length === 0 && (
            <p className="py-4 text-xs text-slate-400">No approved learning rules are stored.</p>
          )}
        </div>
      </section>
    </div>
  );
}
