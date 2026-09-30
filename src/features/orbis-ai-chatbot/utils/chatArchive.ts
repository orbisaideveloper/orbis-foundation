import type { ChatMessage } from "../storage/chatStorage.types";

export type ChatArchiveRange = "6h" | "24h" | "48h" | "all";
export type ChatArchiveFormat = "txt" | "json";

const RANGE_MS: Record<Exclude<ChatArchiveRange, "all">, number> = {
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "48h": 48 * 60 * 60 * 1000,
};

function validTimestamp(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function selectChatArchiveMessages(
  messages: readonly ChatMessage[],
  range: ChatArchiveRange,
  now = Date.now(),
): ChatMessage[] {
  const cutoff =
    range === "all"
      ? Number.NEGATIVE_INFINITY
      : now - RANGE_MS[range];

  return messages
    .filter(
      (message) =>
        validTimestamp(message.createdAt) &&
        message.createdAt >= cutoff &&
        message.createdAt <= now,
    )
    .slice()
    .sort((left, right) => left.createdAt - right.createdAt);
}

function archiveRangeLabel(range: ChatArchiveRange): string {
  if (range === "6h") return "Last 6 hours";
  if (range === "24h") return "Last 24 hours";
  if (range === "48h") return "Last 48 hours";
  return "All chat";
}

export function formatChatArchiveText(
  messages: readonly ChatMessage[],
  range: ChatArchiveRange,
  exportedAt = Date.now(),
): string {
  const lines = [
    "ORBIS CHAT ARCHIVE",
    `Range: ${archiveRangeLabel(range)}`,
    `Exported: ${new Date(exportedAt).toISOString()}`,
    `Messages: ${messages.length}`,
    "",
  ];

  for (const message of messages) {
    const role = message.role === "user" ? "আপনি" : "ORBIS";
    const provider =
      message.role === "assistant" && message.providerName
        ? ` · ${message.providerName}`
        : "";

    lines.push(
      `[${new Date(message.createdAt).toISOString()}] ${role}${provider}`,
      message.content,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

export function formatChatArchiveJson(
  messages: readonly ChatMessage[],
  range: ChatArchiveRange,
  exportedAt = Date.now(),
): string {
  return JSON.stringify(
    {
      schema: "orbis-chat-archive/v1",
      exportedAt: new Date(exportedAt).toISOString(),
      range,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        providerName: message.providerName,
        evidence: message.evidence,
        model: message.model,
        important: message.important,
      })),
    },
    null,
    2,
  );
}

export function chatArchiveFileName(
  range: ChatArchiveRange,
  format: ChatArchiveFormat,
  exportedAt = Date.now(),
): string {
  const timestamp = new Date(exportedAt)
    .toISOString()
    .replace(/[:.]/g, "-");

  return `orbis-chat-${range}-${timestamp}.${format}`;
}

export function downloadChatArchive(
  content: string,
  fileName: string,
  format: ChatArchiveFormat,
): boolean {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return false;
  }

  try {
    const mimeType =
      format === "json"
        ? "application/json;charset=utf-8"
        : "text/plain;charset=utf-8";

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    return true;
  } catch {
    return false;
  }
}
