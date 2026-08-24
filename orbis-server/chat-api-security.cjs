const CHAT_BODY_LIMIT_BYTES = 64 * 1024;
const CHAT_RATE_WINDOW_MS = 60_000;
const CHAT_RATE_MAX_REQUESTS = 20;
const CHAT_CLARIFICATION_MAX_AGE_MS = 10 * 60 * 1000;

function validateChatPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, code: "CHAT_INPUT_INVALID" };
  }
  if (Object.hasOwn(body, "attachments")) {
    return { valid: false, code: "ATTACHMENTS_UNSUPPORTED" };
  }
  if (
    Object.keys(body).some(
      (key) => !["messages", "pendingClarification"].includes(key),
    )
  ) {
    return { valid: false, code: "CHAT_INPUT_INVALID" };
  }

  let bytes;
  try {
    bytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  } catch {
    return { valid: false, code: "CHAT_INPUT_INVALID" };
  }
  if (bytes > CHAT_BODY_LIMIT_BYTES) {
    return { valid: false, code: "CHAT_REQUEST_TOO_LARGE" };
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1) {
    return { valid: false, code: "CHAT_INPUT_INVALID" };
  }
  if (body.messages.length > 20) {
    return { valid: false, code: "CHAT_TOO_MANY_MESSAGES" };
  }
  for (const message of body.messages) {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      message.content.trim().length === 0 ||
      message.content.length > 16_000
    ) {
      return { valid: false, code: "CHAT_INPUT_INVALID" };
    }
  }
  if (body.pendingClarification !== undefined) {
    const pending = body.pendingClarification;
    if (
      !pending ||
      typeof pending !== "object" ||
      Array.isArray(pending) ||
      !["weather-location", "capability-input"].includes(pending.kind) ||
      typeof pending.originalRequest !== "string" ||
      pending.originalRequest.trim().length === 0 ||
      pending.originalRequest.length > 16_000 ||
      !Number.isFinite(pending.createdAt) ||
      !Number.isFinite(pending.expiresAt) ||
      pending.expiresAt <= pending.createdAt ||
      pending.expiresAt - pending.createdAt > CHAT_CLARIFICATION_MAX_AGE_MS ||
      Object.keys(pending).some(
        (key) =>
          !["kind", "originalRequest", "createdAt", "expiresAt"].includes(key),
      )
    ) {
      return { valid: false, code: "CHAT_INPUT_INVALID" };
    }
  }
  return { valid: true };
}

function createChatRateLimiter(options = {}) {
  const windowMs = options.windowMs || CHAT_RATE_WINDOW_MS;
  const maxRequests = options.maxRequests || CHAT_RATE_MAX_REQUESTS;
  const clock = options.clock || (() => Date.now());
  const buckets = new Map();

  return function chatRateLimiter(req, res, next) {
    const userId = req.adminUser?.id;
    if (!userId) {
      return res.status(401).json({
        error: { category: "authentication", code: "AUTH_REQUIRED" },
      });
    }
    const now = clock();
    const current = buckets.get(userId);
    const bucket =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;
    bucket.count += 1;
    buckets.set(userId, bucket);

    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, maxRequests - bucket.count)),
    );
    if (bucket.count > maxRequests) {
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))),
      );
      return res.status(429).json({
        error: { category: "rate_limit", code: "CHAT_RATE_LIMITED" },
      });
    }
    return next();
  };
}

module.exports = {
  CHAT_BODY_LIMIT_BYTES,
  validateChatPayload,
  createChatRateLimiter,
};
