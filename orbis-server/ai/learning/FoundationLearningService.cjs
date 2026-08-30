const crypto = require("node:crypto");
const {
  learningEventDeduplicationHash,
  parseLearningEventBatch,
} = require("./LearningEventContract.cjs");

const ALLOWED_CATEGORIES = new Set([
  "FOUNDATION_GUIDANCE",
  "PRODUCT_KNOWLEDGE",
  "OPERATING_RULE",
  "GENERAL_KNOWLEDGE",
]);
const MIN_SOURCE_CHARS = 40;
const MAX_SOURCE_CHARS = 2_000;
const MIN_CONTENT_CHARS = 30;
const MAX_CONTENT_CHARS = 500;
const MAX_TAGS = 5;
const APPROVAL_TTL_MS = 10 * 60 * 1_000;
const REVIEWABLE_OUTCOMES = new Set(["corrected", "failed"]);
const REVIEW_PATTERN_VALUES = Object.freeze({
  route: new Set([
    "approval",
    "foundation-capability",
    "foundation-capability-status",
    "web-search",
    "brain-direct-reply",
    "brain-orchestrated-provider",
    "clarification",
  ]),
  intent: new Set([
    "approval",
    "foundation-capability",
    "capability-status",
    "live-information",
    "direct-conversation",
    "general-conversation",
    "unclear",
  ]),
  confidence: new Set(["high", "medium", "low"]),
  reason: new Set([
    "approval-decision",
    "registered-capability",
    "capability-status",
    "time-sensitive-request",
    "brain-direct-policy",
    "provider-reasoning",
    "invalid-decision",
  ]),
  outcome: REVIEWABLE_OUTCOMES,
  feedbackCode: new Set([
    "answer-incorrect",
    "route-incorrect",
    "missing-evidence",
    "clarification-needed",
    "capability-failed",
    "provider-failed",
  ]),
});
const REVIEW_CANDIDATES = Object.freeze({
  "answer-incorrect": Object.freeze({
    content:
      "Uncertain factual responses require verification before final delivery.",
    category: "OPERATING_RULE",
    tags: Object.freeze(["verification", "response-quality"]),
  }),
  "route-incorrect": Object.freeze({
    content: "Route selection requires intent validation before execution begins.",
    category: "OPERATING_RULE",
    tags: Object.freeze(["routing", "validation"]),
  }),
  "missing-evidence": Object.freeze({
    content:
      "Time-sensitive responses require evidence-backed verification before final delivery.",
    category: "OPERATING_RULE",
    tags: Object.freeze(["evidence", "verification"]),
  }),
  "clarification-needed": Object.freeze({
    content:
      "Ambiguous requests require clarification before an action or final response.",
    category: "OPERATING_RULE",
    tags: Object.freeze(["clarification", "safety"]),
  }),
  "capability-failed": Object.freeze({
    content:
      "Capability failures require a bounded fallback and diagnostic review.",
    category: "OPERATING_RULE",
    tags: Object.freeze(["capability", "fallback"]),
  }),
  "provider-failed": Object.freeze({
    content:
      "Provider failures require a bounded fallback without unverified claims.",
    category: "OPERATING_RULE",
    tags: Object.freeze(["provider", "fallback"]),
  }),
});

const PERSONAL_OR_SECRET_PATTERNS = [
  /\b(?:i am|i'm|my|mine|me|we|our|username|user id|account id|email|phone|mobile|password|passcode|secret|token|bearer)\b/i,
  /\bapi[ _-]?key\b/i,
  /(?:আমি|আমার|আমাকে|আমরা|আমাদের|নাম|ইমেইল|ফোন|মোবাইল|পাসওয়ার্ড|পাসওয়ার্ড|টোকেন|গোপন)/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:\+?\d[\d\s().-]{7,}\d)/,
  /\b(?:street|st\.|road|rd\.|avenue|ave\.|lane|house|apartment|postal|zip|latitude|longitude|coordinates?)\b/i,
  /(?:ঠিকানা|বাড়ি|বাড়ি|রাস্তা|পোস্টাল|অক্ষাংশ|দ্রাঘিমাংশ)/u,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /\b(?:sk|pk|api)[_-][A-Za-z0-9_-]{16,}\b/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /(?:^|\s)@[a-z0-9_]{3,32}\b/i,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /(?:^|\s)(?:\.{0,2}\/|[A-Za-z]:\\)[^\s]+/,
  /\b(?:data:[^;]+;base64|attachment|file contents?|transcript)\b/i,
];

const DISALLOWED_CANDIDATE_PATTERNS = [
  ...PERSONAL_OR_SECRET_PATTERNS,
  /\b(?:you|your|yours|he|she|his|her|they|their|person|individual|customer|admin user)\b/i,
  /(?:তুমি|তোমার|আপনি|আপনার|সে|তার|ব্যক্তি|ব্যবহারকারী)/u,
  /https?:\/\//i,
  /```|["“”‘’]/,
  /[\r\n]/,
];

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function containsRejectedData(value, patterns = PERSONAL_OR_SECRET_PATTERNS) {
  return patterns.some((pattern) => pattern.test(value));
}

function validateSourceText(rawSource) {
  if (typeof rawSource !== "string") throw fail("LEARNING_SOURCE_REJECTED");
  const source = normalizeText(rawSource);
  if (
    source.length < MIN_SOURCE_CHARS ||
    source.length > MAX_SOURCE_CHARS ||
    // The validation intentionally rejects ASCII control characters.
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(source) ||
    containsRejectedData(source)
  ) {
    throw fail("LEARNING_SOURCE_REJECTED");
  }
  return source;
}

function wordSet(value) {
  return new Set(
    normalizeText(value)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 2),
  );
}

function sourceOverlap(source, candidate) {
  const sourceWords = wordSet(source);
  const candidateWords = wordSet(candidate);
  if (candidateWords.size === 0) return 1;
  let shared = 0;
  for (const word of candidateWords) {
    if (sourceWords.has(word)) shared += 1;
  }
  return shared / candidateWords.size;
}

function validateCandidate(rawCandidate, source) {
  if (!rawCandidate || typeof rawCandidate !== "object") {
    throw fail("LEARNING_CANDIDATE_REJECTED");
  }
  if (
    Object.keys(rawCandidate).some(
      (key) => !["content", "category", "tags"].includes(key),
    )
  ) {
    throw fail("LEARNING_CANDIDATE_REJECTED");
  }
  const content = normalizeText(rawCandidate.content);
  const category = normalizeText(rawCandidate.category).toUpperCase();
  const rawTags = rawCandidate.tags;
  if (
    content.length < MIN_CONTENT_CHARS ||
    content.length > MAX_CONTENT_CHARS ||
    !ALLOWED_CATEGORIES.has(category) ||
    !Array.isArray(rawTags) ||
    rawTags.length < 1 ||
    rawTags.length > MAX_TAGS ||
    content.endsWith("?") ||
    containsRejectedData(content, DISALLOWED_CANDIDATE_PATTERNS)
  ) {
    throw fail("LEARNING_CANDIDATE_REJECTED");
  }
  const tags = rawTags.map((tag) => normalizeText(tag).toLowerCase());
  if (
    tags.some(
      (tag) =>
        tag.length < 2 ||
        tag.length > 32 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag),
    ) ||
    new Set(tags).size !== tags.length ||
    tags.some((tag) => containsRejectedData(tag))
  ) {
    throw fail("LEARNING_CANDIDATE_REJECTED");
  }
  if (source) {
    const normalizedSource = normalizeText(source).toLowerCase();
    const normalizedContent = content.toLowerCase();
    if (
      normalizedSource === normalizedContent ||
      normalizedSource.includes(normalizedContent) ||
      sourceOverlap(source, content) >= 0.85
    ) {
      throw fail("LEARNING_ANONYMIZATION_UNCERTAIN");
    }
  }
  return { content, category, tags };
}

function deduplicationHash(candidate) {
  return crypto
    .createHash("sha256")
    .update(`${candidate.category}\0${candidate.content.toLowerCase()}`)
    .digest("hex");
}

function validateReviewPattern(rawPattern) {
  if (!rawPattern || typeof rawPattern !== "object") {
    throw fail("LEARNING_PATTERN_INVALID");
  }
  const allowedKeys = [
    "route",
    "intent",
    "confidence",
    "evidenceRequired",
    "reason",
    "outcome",
    "feedbackCode",
  ];
  if (
    Object.keys(rawPattern).some((key) => !allowedKeys.includes(key)) ||
    Object.keys(rawPattern).length !== allowedKeys.length
  ) {
    throw fail("LEARNING_PATTERN_INVALID");
  }

  const pattern = {
    route: normalizeText(rawPattern.route),
    intent: normalizeText(rawPattern.intent),
    confidence: normalizeText(rawPattern.confidence),
    evidenceRequired: rawPattern.evidenceRequired,
    reason: normalizeText(rawPattern.reason),
    outcome: normalizeText(rawPattern.outcome),
    feedbackCode: normalizeText(rawPattern.feedbackCode),
  };
  if (
    typeof pattern.evidenceRequired !== "boolean" ||
    !REVIEW_PATTERN_VALUES.route.has(pattern.route) ||
    !REVIEW_PATTERN_VALUES.intent.has(pattern.intent) ||
    !REVIEW_PATTERN_VALUES.confidence.has(pattern.confidence) ||
    !REVIEW_PATTERN_VALUES.reason.has(pattern.reason) ||
    !REVIEW_PATTERN_VALUES.outcome.has(pattern.outcome) ||
    !REVIEW_PATTERN_VALUES.feedbackCode.has(pattern.feedbackCode)
  ) {
    throw fail("LEARNING_PATTERN_INVALID");
  }
  return pattern;
}

function candidateForReviewPattern(pattern) {
  const candidate = REVIEW_CANDIDATES[pattern.feedbackCode];
  if (!candidate) throw fail("LEARNING_PATTERN_NOT_REVIEWABLE");
  return validateCandidate({ ...candidate, tags: [...candidate.tags] });
}

class FoundationLearningService {
  constructor(options) {
    this.repository = options.repository;
    this.eventRepository = options.eventRepository || null;
    this.candidateGenerator = options.candidateGenerator;
    this.clock = options.clock || (() => Date.now());
    this.signingKey = options.signingKey || crypto.randomBytes(32);
    this.consumedTokens = new Set();
  }

  async preview({ consent, sourceText }) {
    if (consent !== true) throw fail("LEARNING_CONSENT_REQUIRED");
    const source = validateSourceText(sourceText);
    let generated;
    try {
      generated = await this.candidateGenerator(source);
    } catch {
      throw fail("LEARNING_CANDIDATE_UNAVAILABLE");
    }
    const candidate = validateCandidate(generated, source);
    return this.createApprovalPreview(candidate);
  }

  createApprovalPreview(candidate) {
    const expiresAt = this.clock() + APPROVAL_TTL_MS;
    const payload = Buffer.from(
      JSON.stringify({
        hash: deduplicationHash(candidate),
        expiresAt,
        nonce: crypto.randomUUID(),
      }),
    ).toString("base64url");
    const signature = crypto
      .createHmac("sha256", this.signingKey)
      .update(payload)
      .digest("base64url");
    return {
      candidate,
      approvalToken: `${payload}.${signature}`,
      expiresAt,
    };
  }

  async listReviewPatterns() {
    if (
      !this.eventRepository ||
      typeof this.eventRepository.listReviewPatterns !== "function"
    ) {
      throw fail("LEARNING_EVENT_STORAGE_UNAVAILABLE");
    }
    try {
      const patterns = await this.eventRepository.listReviewPatterns();
      if (!Array.isArray(patterns)) throw new Error("invalid patterns");
      return patterns.map((rawPattern) => {
        const { occurrences, firstOccurredAt, lastOccurredAt, ...pattern } =
          rawPattern || {};
        const normalizedOccurrences = Number(occurrences);
        if (
          !Number.isSafeInteger(normalizedOccurrences) ||
          normalizedOccurrences < 1 ||
          typeof firstOccurredAt !== "string" ||
          typeof lastOccurredAt !== "string"
        ) {
          throw new Error("invalid pattern summary");
        }
        return {
          ...validateReviewPattern(pattern),
          occurrences: normalizedOccurrences,
          firstOccurredAt,
          lastOccurredAt,
        };
      });
    } catch (error) {
      if (error?.code === "LEARNING_EVENT_STORAGE_UNAVAILABLE") throw error;
      throw fail("LEARNING_EVENT_STORAGE_UNAVAILABLE");
    }
  }

  async previewReviewPattern({ consent, pattern: rawPattern }) {
    if (consent !== true) throw fail("LEARNING_CONSENT_REQUIRED");
    const pattern = validateReviewPattern(rawPattern);
    if (
      !this.eventRepository ||
      typeof this.eventRepository.hasReviewPattern !== "function"
    ) {
      throw fail("LEARNING_EVENT_STORAGE_UNAVAILABLE");
    }
    try {
      if (!(await this.eventRepository.hasReviewPattern(pattern))) {
        throw fail("LEARNING_PATTERN_NOT_FOUND");
      }
    } catch (error) {
      if (
        error?.code === "LEARNING_PATTERN_NOT_FOUND" ||
        error?.code === "LEARNING_EVENT_STORAGE_UNAVAILABLE"
      ) {
        throw error;
      }
      throw fail("LEARNING_EVENT_STORAGE_UNAVAILABLE");
    }
    return this.createApprovalPreview(candidateForReviewPattern(pattern));
  }

  async approve({ consent, candidate: rawCandidate, approvalToken }) {
    if (consent !== true) throw fail("LEARNING_CONSENT_REQUIRED");
    const candidate = validateCandidate(rawCandidate);
    const tokenHash = crypto
      .createHash("sha256")
      .update(String(approvalToken || ""))
      .digest("hex");
    if (this.consumedTokens.has(tokenHash))
      throw fail("LEARNING_APPROVAL_REPLAY");
    const payload = this.verifyApprovalToken(approvalToken);
    if (
      payload.expiresAt <= this.clock() ||
      payload.hash !== deduplicationHash(candidate)
    ) {
      throw fail("LEARNING_APPROVAL_INVALID");
    }
    const result = await this.repository.createOrGet({
      ...candidate,
      deduplicationHash: payload.hash,
    });
    this.consumedTokens.add(tokenHash);
    if (this.consumedTokens.size > 10_000) {
      this.consumedTokens.delete(this.consumedTokens.values().next().value);
    }
    return result;
  }

  async list() {
    return this.repository.list();
  }

  async delete(id) {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
      throw fail("LEARNING_RECORD_INVALID");
    }
    return this.repository.delete(id);
  }

  async recordEventBatch(rawBatch) {
    const batch = parseLearningEventBatch(rawBatch);
    if (
      !this.eventRepository ||
      typeof this.eventRepository.createOrGetBatch !== "function"
    ) {
      throw fail("LEARNING_EVENT_STORAGE_UNAVAILABLE");
    }
    let results;
    try {
      results = await this.eventRepository.createOrGetBatch(
        batch.events.map((event) => ({
          ...event,
          deduplicationHash: learningEventDeduplicationHash(event.eventId),
        })),
      );
    } catch (error) {
      if (error?.code === "LEARNING_EVENT_STORAGE_UNAVAILABLE") throw error;
      throw fail("LEARNING_EVENT_STORAGE_UNAVAILABLE");
    }
    if (!Array.isArray(results) || results.length !== batch.events.length) {
      throw fail("LEARNING_EVENT_STORAGE_UNAVAILABLE");
    }
    const eventResults = results.map((result) => {
      if (
        !result ||
        typeof result.duplicate !== "boolean" ||
        typeof result.record?.eventId !== "string"
      ) {
        throw fail("LEARNING_EVENT_STORAGE_UNAVAILABLE");
      }
      return { eventId: result.record.eventId, duplicate: result.duplicate };
    });
    const duplicates = eventResults.filter((event) => event.duplicate).length;
    return {
      accepted: eventResults.length - duplicates,
      duplicates,
      events: eventResults,
    };
  }

  verifyApprovalToken(token) {
    if (typeof token !== "string" || token.length > 1_000) {
      throw fail("LEARNING_APPROVAL_REQUIRED");
    }
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra)
      throw fail("LEARNING_APPROVAL_REQUIRED");
    const expected = crypto
      .createHmac("sha256", this.signingKey)
      .update(payload)
      .digest();
    let supplied;
    try {
      supplied = Buffer.from(signature, "base64url");
    } catch {
      throw fail("LEARNING_APPROVAL_INVALID");
    }
    if (
      expected.length !== supplied.length ||
      !crypto.timingSafeEqual(expected, supplied)
    ) {
      throw fail("LEARNING_APPROVAL_INVALID");
    }
    try {
      const parsed = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      );
      if (
        typeof parsed.hash !== "string" ||
        !/^[a-f0-9]{64}$/.test(parsed.hash) ||
        !Number.isFinite(parsed.expiresAt) ||
        typeof parsed.nonce !== "string"
      ) {
        throw new Error("invalid");
      }
      return parsed;
    } catch {
      throw fail("LEARNING_APPROVAL_INVALID");
    }
  }
}

module.exports = {
  APPROVAL_TTL_MS,
  FoundationLearningService,
  deduplicationHash,
  validateReviewPattern,
  validateCandidate,
  validateSourceText,
};
