import type { PendingClarification } from "../storage/chatStorage.types";

export const MAX_CHAT_REQUEST_MESSAGES = 20;
export const MAX_CHAT_MESSAGE_CHARS = 16_000;
// The server accepts 64 KiB. Keeping a 4 KiB margin prevents a normal
// conversation from failing simply because its JSON representation grew.
export const MAX_CHAT_REQUEST_BYTES = 60 * 1024;
export const MAX_PENDING_CLARIFICATION_AGE_MS = 10 * 60 * 1000;

export interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestPayload {
  messages: ChatRequestMessage[];
  pendingClarification?: PendingClarification;
}

export type ChatRequestPreparationError =
  "CHAT_INPUT_INVALID" | "CHAT_MESSAGE_TOO_LARGE" | "CHAT_REQUEST_TOO_LARGE";

export interface ChatRequestPreparation {
  payload: ChatRequestPayload;
  pendingClarification: PendingClarification | null;
  droppedInvalidPending: boolean;
  errorCode: ChatRequestPreparationError | null;
}

function requestBytes(payload: ChatRequestPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

function isValidPendingClarification(
  pending: PendingClarification | null | undefined,
  now: number,
): pending is PendingClarification {
  return Boolean(
    pending &&
    (pending.kind === "weather-location" ||
      pending.kind === "capability-input") &&
    typeof pending.originalRequest === "string" &&
    pending.originalRequest.trim().length > 0 &&
    pending.originalRequest.length <= MAX_CHAT_MESSAGE_CHARS &&
    Number.isFinite(pending.createdAt) &&
    Number.isFinite(pending.expiresAt) &&
    pending.createdAt <= now &&
    pending.expiresAt > now &&
    pending.expiresAt > pending.createdAt &&
    pending.expiresAt - pending.createdAt <= MAX_PENDING_CLARIFICATION_AGE_MS,
  );
}

function createPayload(
  messages: ChatRequestMessage[],
  pendingClarification: PendingClarification | null,
): ChatRequestPayload {
  return pendingClarification
    ? { messages, pendingClarification }
    : { messages };
}

export function chatRequestByteLength(payload: ChatRequestPayload): number {
  return requestBytes(payload);
}

/**
 * Builds the smallest safe request that can represent the user's newest
 * question. It deliberately does not alter the persisted transcript: this
 * is only an in-flight recovery body when an older client/context format is
 * rejected before the chat service is reached.
 */
export function prepareContextRecoveryRequest(
  sourceMessages: ReadonlyArray<ChatRequestMessage>,
): ChatRequestPreparation {
  let latestUser: ChatRequestMessage | undefined;

  for (let index = sourceMessages.length - 1; index >= 0; index -= 1) {
    const message = sourceMessages[index];
    if (
      message?.role === "user" &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
    ) {
      latestUser = { role: "user", content: message.content.trim() };
      break;
    }
  }

  if (!latestUser) {
    return {
      payload: { messages: [] },
      pendingClarification: null,
      droppedInvalidPending: false,
      errorCode: "CHAT_INPUT_INVALID",
    };
  }
  if (latestUser.content.length > MAX_CHAT_MESSAGE_CHARS) {
    return {
      payload: { messages: [latestUser] },
      pendingClarification: null,
      droppedInvalidPending: false,
      errorCode: "CHAT_MESSAGE_TOO_LARGE",
    };
  }

  return {
    payload: { messages: [latestUser] },
    pendingClarification: null,
    droppedInvalidPending: false,
    errorCode: null,
  };
}

/**
 * Produces the exact chat body sent to the server. It never splits a message:
 * old complete turns are removed first, while the newest user message stays.
 */
export function prepareChatRequest(
  sourceMessages: ReadonlyArray<ChatRequestMessage>,
  pending: PendingClarification | null | undefined,
  now = Date.now(),
): ChatRequestPreparation {
  const messages = sourceMessages
    .filter(
      (message): message is ChatRequestMessage =>
        (message?.role === "user" || message?.role === "assistant") &&
        typeof message?.content === "string" &&
        message.content.trim().length > 0,
    )
    .slice(-MAX_CHAT_REQUEST_MESSAGES)
    .map(({ role, content }) => ({ role, content: content.trim() }));
  const latest =
    messages.length > 0 ? messages[messages.length - 1] : undefined;
  const pendingClarification = isValidPendingClarification(pending, now)
    ? pending
    : null;
  const droppedInvalidPending = Boolean(pending && !pendingClarification);

  if (!latest || latest.role !== "user") {
    return {
      payload: { messages: [] },
      pendingClarification,
      droppedInvalidPending,
      errorCode: "CHAT_INPUT_INVALID",
    };
  }
  if (latest.content.length > MAX_CHAT_MESSAGE_CHARS) {
    return {
      payload: createPayload([latest], pendingClarification),
      pendingClarification,
      droppedInvalidPending,
      errorCode: "CHAT_MESSAGE_TOO_LARGE",
    };
  }

  let selected: ChatRequestMessage[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = [messages[index], ...selected];
    const payload = createPayload(candidate, pendingClarification);
    if (requestBytes(payload) <= MAX_CHAT_REQUEST_BYTES) {
      selected = candidate;
    }
  }

  const payload = createPayload(selected, pendingClarification);
  return {
    payload,
    pendingClarification,
    droppedInvalidPending,
    errorCode: selected.length > 0 ? null : "CHAT_REQUEST_TOO_LARGE",
  };
}
