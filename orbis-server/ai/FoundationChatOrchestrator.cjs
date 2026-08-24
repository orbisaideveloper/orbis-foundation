const { chatCapabilityRegistry } = require("./ChatCapabilityRegistry.cjs");

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 16_000;
const MAX_CLARIFICATION_AGE_MS = 10 * 60 * 1000;

function normalizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) throw new Error("CHAT_INPUT_INVALID");

  const messages = rawMessages
    .filter(
      (message) =>
        (message?.role === "user" || message?.role === "assistant") &&
        typeof message?.content === "string",
    )
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((message) => message.content.length > 0);

  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    throw new Error("CHAT_INPUT_INVALID");
  }

  return messages;
}

function normalizePending(rawPending) {
  if (!rawPending || typeof rawPending !== "object") return null;
  if (
    !["weather-location", "capability-input"].includes(rawPending.kind) ||
    typeof rawPending.originalRequest !== "string" ||
    rawPending.originalRequest.trim().length === 0 ||
    rawPending.originalRequest.length > MAX_MESSAGE_CHARS ||
    !Number.isFinite(rawPending.createdAt) ||
    !Number.isFinite(rawPending.expiresAt)
  ) {
    return null;
  }
  return {
    kind: rawPending.kind,
    originalRequest: rawPending.originalRequest.trim(),
    createdAt: rawPending.createdAt,
    expiresAt: rawPending.expiresAt,
  };
}

function clarificationFollowUp(message, pending, now) {
  if (!pending) return { message, state: "none" };
  if (
    pending.expiresAt <= now ||
    now - pending.createdAt > MAX_CLARIFICATION_AGE_MS
  ) {
    return { message, state: "expired" };
  }

  if (/^(cancel|never mind|stop|বাতিল|থাক|বাদ দাও)[.!।\s]*$/i.test(message)) {
    return { message, state: "cancelled" };
  }

  const looksClearlyNew =
    message.length > 120 ||
    /(?:weather|আবহাওয়া|ওয়েদার|news|খবর|price|দাম|system info|সিস্টেম তথ্য|read file|ফাইল পড়)/i.test(
      message,
    );
  if (looksClearlyNew) return { message, state: "replaced" };

  return {
    message: `${pending.originalRequest} ${message}`.trim(),
    state: "resolved",
  };
}

function pendingFromResponse(response, originalRequest, now) {
  if (response?.provider?.type === "WEB_SEARCH_CLARIFICATION") {
    return {
      kind: "weather-location",
      originalRequest,
      createdAt: now,
      expiresAt: now + MAX_CLARIFICATION_AGE_MS,
    };
  }
  if (
    response?.provider?.type === "BRAIN_CAPABILITY" &&
    response?.clarificationRequired === true
  ) {
    return {
      kind: "capability-input",
      originalRequest,
      createdAt: now,
      expiresAt: now + MAX_CLARIFICATION_AGE_MS,
    };
  }
  return null;
}

class FoundationChatOrchestrator {
  constructor(registry = chatCapabilityRegistry, clock = () => Date.now()) {
    this.registry = registry;
    this.clock = clock;
  }

  async orchestrate(rawRequest, executeRoute) {
    const messages = normalizeMessages(rawRequest?.messages);
    const now = this.clock();
    const rawLastMessage = messages.at(-1).content;
    const pending = normalizePending(rawRequest?.pendingClarification);
    const clarification = clarificationFollowUp(rawLastMessage, pending, now);
    if (clarification.state === "cancelled") {
      const bengali = /[\u0980-\u09FF]/.test(rawLastMessage);
      return {
        message: {
          role: "assistant",
          content: bengali
            ? "ঠিক আছে, আগের অসম্পূর্ণ অনুরোধটি বাতিল করা হয়েছে।"
            : "Okay, the previous incomplete request was cancelled.",
        },
        provider: { name: "ORBIS Foundation", type: "CLARIFICATION" },
        route: "clarification-cancel",
        routingDurationMs: 0,
        clarification: { state: "cancelled", pending: null },
      };
    }
    const effectiveMessages = messages.slice(0, -1).concat({
      role: "user",
      content: clarification.message,
    });

    const routeStartedAt = this.clock();
    const decision = this.registry.select(clarification.message);
    const capability = decision.capabilityId
      ? this.registry.get(decision.capabilityId)
      : null;
    const routingDurationMs = Math.max(0, this.clock() - routeStartedAt);

    const response = await executeRoute(effectiveMessages, {
      ...decision,
      configured: capability?.configured !== false,
    });
    const nextPending = pendingFromResponse(
      response,
      clarification.message,
      now,
    );

    return {
      message: response.message,
      provider: response.provider,
      route: decision.route,
      routingDurationMs,
      clarification: {
        state: nextPending ? "pending" : clarification.state,
        pending: nextPending,
      },
    };
  }
}

module.exports = {
  FoundationChatOrchestrator,
  foundationChatOrchestrator: new FoundationChatOrchestrator(),
  normalizeMessages,
  clarificationFollowUp,
  MAX_CLARIFICATION_AGE_MS,
};
