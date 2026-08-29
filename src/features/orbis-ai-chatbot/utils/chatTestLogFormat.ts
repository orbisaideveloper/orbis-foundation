import type { ResolvedChatTestLogEntry } from "../storage/chatStorage.types";

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat("bn-BD", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(value);
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Unavailable";
  return value < 1_000 ? `${Math.round(value)} ms` : `${(value / 1_000).toFixed(2)} sec`;
}

function contentOrUnavailable(value: string | undefined): string {
  return value?.trim() || "[Local message is unavailable]";
}

export function formatTestLogEntry(entry: ResolvedChatTestLogEntry): string {
  const lines = [
    `[${formatTimestamp(entry.completedAt)}]`,
    "আপনি:",
    contentOrUnavailable(entry.userMessage?.content),
    "",
    "ORBIS:",
    contentOrUnavailable(entry.assistantMessage?.content),
    "",
    `উৎস: ${entry.providerName} · ${entry.providerType}`,
    `Route: ${entry.route || "Unavailable"}`,
    `Brain decision: ${entry.brainDecision || "Unavailable"}`,
    `উত্তর সময়: ${formatDuration(entry.durationMs)}`,
    `Routing সময়: ${entry.routingDurationMs === null ? "Unavailable" : formatDuration(entry.routingDurationMs)}`,
    `Delivery: ${entry.delivery}`,
    `Result: ${entry.outcome}`,
  ];
  if (entry.clarificationState) {
    lines.push(`Clarification: ${entry.clarificationState}`);
  }
  if (entry.webSourceCount !== null && entry.webSourceCount !== undefined) {
    lines.push(`Verified web sources: ${entry.webSourceCount}`);
  }
  if (entry.errorCategory) lines.push(`Error category: ${entry.errorCategory}`);
  return lines.join("\n");
}

export function formatTestLogEntries(entries: ResolvedChatTestLogEntry[]): string {
  return entries
    .slice()
    .sort((left, right) => left.completedAt - right.completedAt)
    .map(formatTestLogEntry)
    .join("\n\n────────────────────\n\n");
}

export function testLogDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
