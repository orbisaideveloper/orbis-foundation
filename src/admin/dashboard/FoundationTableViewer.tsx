import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  LoaderCircle,
  X,
} from "lucide-react";
import { readAdminJson } from "../auth/adminFetch";

interface Props {
  table: string;
  count: number | null;
  status: string;
  disabled?: boolean;
}

interface ListResponse {
  table: string;
  offset: number;
  limit: number;
  hasMore: boolean;
  rows: Array<Record<string, unknown>>;
}

interface DetailResponse {
  table: string;
  row: Record<string, unknown>;
}

const PAGE_SIZE = 50;

function firstText(row: Record<string, unknown>, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

function titleFor(row: Record<string, unknown>) {
  return firstText(
    row,
    ["filePath", "eventType", "category", "source", "status", "decisionIntent", "id"],
    "Stored record",
  );
}

function timeFor(row: Record<string, unknown>) {
  const raw = firstText(
    row,
    ["updatedAt", "lastSeen", "receivedAt", "recordedAt", "createdAt", "occurredAt"],
    "",
  );
  if (!raw) return "No timestamp";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
}


function formatStoredCount(
  count: number | null,
  fallback: string,
) {
  return typeof count === "number" ? count.toLocaleString() : fallback;
}

function selectedContent(row: Record<string, unknown> | null) {
  if (!row || typeof row.content !== "string") return null;
  return row.content;
}

function selectedMetadata(row: Record<string, unknown> | null) {
  if (!row) return null;
  const next = { ...row };
  delete next.content;
  return next;
}

function copyPayload(
  row: Record<string, unknown>,
  kind: "record" | "content",
) {
  if (kind === "content" && typeof row.content === "string") {
    return row.content;
  }
  return JSON.stringify(row, null, 2);
}

export function FoundationTableViewerRow({
  table,
  count,
  status,
  disabled = false,
}: Readonly<Props>) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"record" | "content" | null>(null);
  const available = status === "available" && !disabled;

  const loadPage = useCallback(async (nextOffset: number) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const data = await readAdminJson<ListResponse>(
        `/api/admin/foundation-tables/${encodeURIComponent(
          table,
        )}/rows?offset=${nextOffset}&limit=${PAGE_SIZE}`,
      );
      setRows(data.rows);
      setOffset(data.offset);
      setHasMore(data.hasMore);
    } catch {
      setRows([]);
      setError("Stored records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [table]);

  useEffect(() => {
    if (open && available) void loadPage(0);
  }, [available, loadPage, open]);

  const openRecord = async (id: unknown) => {
    if (typeof id !== "string" || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await readAdminJson<DetailResponse>(
        `/api/admin/foundation-tables/${encodeURIComponent(
          table,
        )}/rows/${encodeURIComponent(id)}`,
      );
      setSelected(data.row);
    } catch {
      setError("This stored record could not be opened.");
    } finally {
      setLoading(false);
    }
  };

  const content = selectedContent(selected);
  const metadata = selectedMetadata(selected);

  const copy = async (kind: "record" | "content") => {
    if (!selected) return;
    const payload = copyPayload(selected, kind);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1200);
    } catch {
      setCopied(null);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={!available}
        onClick={() => setOpen(true)}
        className="flex min-h-[64px] w-full items-center justify-between gap-3 border-b border-emerald-50 py-3 text-left last:border-b-0 disabled:opacity-45"
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold text-slate-500">{status}</span>
          <span className="mt-1 block break-words text-[13px] font-bold text-slate-800">
            {table}: {formatStoredCount(count, "Unavailable")}
          </span>
          <span className="mt-1 block text-[8px] text-slate-400">
            {available ? "Tap to inspect stored rows · read-only" : "Private/unavailable"}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-emerald-600" />
      </button>

      {open && (
        <dialog
          open
          aria-modal="true"
          aria-label={`${table} stored records`}
          className="fixed inset-0 z-[95] m-0 flex h-dvh max-h-none w-screen max-w-none flex-col bg-[#fffef9] text-slate-800"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-emerald-100 bg-white/95 px-3 py-3">
            {selected ? (
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Back to stored rows"
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl border border-emerald-100 bg-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <Database className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-black">{table}</h2>
              <p className="text-[9px] text-slate-500">
                Read-only · {formatStoredCount(count, "?")} rows
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSelected(null);
              }}
              aria-label="Close stored records"
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl text-slate-400"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-24">
            {error && (
              <output className="mb-3 block rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-[10px] text-orange-700">
                {error}
              </output>
            )}

            {selected ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copy("record")}
                    className="min-h-[40px] rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700"
                  >
                    <Copy className="mr-1 inline h-3.5 w-3.5" />
                    {copied === "record" ? "Copied record" : "Copy record"}
                  </button>
                  {content !== null && (
                    <button
                      type="button"
                      onClick={() => void copy("content")}
                      className="min-h-[40px] rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-[10px] font-bold text-orange-700"
                    >
                      <Copy className="mr-1 inline h-3.5 w-3.5" />
                      {copied === "content" ? "Copied content" : "Copy content"}
                    </button>
                  )}
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-emerald-100 bg-white p-3 text-[10px]">
                  {JSON.stringify(metadata, null, 2)}
                </pre>
                {content !== null && (
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-950 p-3 text-[10px] text-slate-100">
                    {content}
                  </pre>
                )}
              </div>
            ) : loading ? (
              <div className="flex min-h-[180px] items-center justify-center gap-2 text-xs text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <>
                <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white">
                  {rows.map((row) => (
                    <button
                      key={String(row.id)}
                      type="button"
                      onClick={() => void openRecord(row.id)}
                      className="flex min-h-[62px] w-full items-center justify-between gap-3 border-b border-emerald-50 px-3 py-3 text-left last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-black">{titleFor(row)}</span>
                        <span className="mt-1 block text-[8px] text-slate-400">{timeFor(row)}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-emerald-600" />
                    </button>
                  ))}
                  {!rows.length && (
                    <p className="px-3 py-6 text-center text-xs text-slate-400">No stored rows.</p>
                  )}
                </section>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={offset === 0}
                    onClick={() => void loadPage(Math.max(0, offset - PAGE_SIZE))}
                    className="min-h-[40px] rounded-xl border border-emerald-100 bg-white px-3 text-[10px] font-bold disabled:opacity-40"
                  >
                    <ChevronLeft className="mr-1 inline h-3.5 w-3.5" /> Previous
                  </button>
                  <span className="text-[9px] text-slate-400">
                    {rows.length ? `${offset + 1}–${offset + rows.length}` : "0"}
                  </span>
                  <button
                    type="button"
                    disabled={!hasMore}
                    onClick={() => void loadPage(offset + PAGE_SIZE)}
                    className="min-h-[40px] rounded-xl border border-emerald-100 bg-white px-3 text-[10px] font-bold disabled:opacity-40"
                  >
                    Next <ChevronRight className="ml-1 inline h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </main>
        </dialog>
      )}
    </>
  );
}
