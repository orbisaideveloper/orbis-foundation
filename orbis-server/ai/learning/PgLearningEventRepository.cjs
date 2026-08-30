const MAX_REVIEW_PATTERNS = 100;

function asIsoString(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function mapReviewPattern(row) {
  const occurrences = Number(row?.occurrences);
  const firstOccurredAt = asIsoString(row?.firstOccurredAt);
  const lastOccurredAt = asIsoString(row?.lastOccurredAt);
  if (
    !Number.isSafeInteger(occurrences) ||
    occurrences < 1 ||
    !firstOccurredAt ||
    !lastOccurredAt
  ) {
    const error = new Error("LEARNING_EVENT_STORAGE_UNAVAILABLE");
    error.code = error.message;
    throw error;
  }
  return {
    route: row.decisionRoute,
    intent: row.decisionIntent,
    confidence: row.decisionConfidence,
    evidenceRequired: row.evidenceRequired,
    reason: row.decisionReason,
    outcome: row.outcome,
    feedbackCode: row.feedbackCode,
    occurrences,
    firstOccurredAt,
    lastOccurredAt,
  };
}

class PgLearningEventRepository {
  constructor(pool) {
    this.pool = pool;
  }

  ensureAvailable() {
    if (!this.pool) {
      const error = new Error("LEARNING_EVENT_STORAGE_UNAVAILABLE");
      error.code = error.message;
      throw error;
    }
  }

  async createOrGetBatch(events) {
    this.ensureAvailable();
    const results = [];
    for (const event of events) {
      results.push(await this.createOrGet(event));
    }
    return results;
  }

  async createOrGet(event) {
    this.ensureAvailable();
    const inserted = await this.pool.query(
      `INSERT INTO "FoundationLearningEvent"
        ("id", "eventType", "decisionRoute", "decisionIntent", "decisionConfidence", "evidenceRequired", "decisionReason", "outcome", "feedbackCode", "occurredAt", "deduplicationHash", "receivedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT ("deduplicationHash") DO NOTHING
       RETURNING "id"`,
      [
        event.eventId,
        event.kind,
        event.decision.route,
        event.decision.intent,
        event.decision.confidence,
        event.decision.evidenceRequired,
        event.decision.reason,
        event.outcome,
        event.feedbackCode,
        new Date(event.occurredAt),
        event.deduplicationHash,
      ],
    );
    if (inserted.rows[0]) {
      return { record: { eventId: inserted.rows[0].id }, duplicate: false };
    }
    const existing = await this.pool.query(
      `SELECT "id" FROM "FoundationLearningEvent"
       WHERE "deduplicationHash" = $1 LIMIT 1`,
      [event.deduplicationHash],
    );
    if (!existing.rows[0]) {
      const error = new Error("LEARNING_EVENT_STORAGE_UNAVAILABLE");
      error.code = error.message;
      throw error;
    }
    return { record: { eventId: existing.rows[0].id }, duplicate: true };
  }

  async listReviewPatterns() {
    this.ensureAvailable();
    const result = await this.pool.query(
      `SELECT
         "decisionRoute",
         "decisionIntent",
         "decisionConfidence",
         "evidenceRequired",
         "decisionReason",
         "outcome",
         "feedbackCode",
         COUNT(*)::text AS "occurrences",
         MIN("occurredAt") AS "firstOccurredAt",
         MAX("occurredAt") AS "lastOccurredAt"
       FROM public."FoundationLearningEvent"
       WHERE "eventType" = 'decision-feedback'
         AND "outcome" IN ('corrected', 'failed')
       GROUP BY
         "decisionRoute",
         "decisionIntent",
         "decisionConfidence",
         "evidenceRequired",
         "decisionReason",
         "outcome",
         "feedbackCode"
       ORDER BY MAX("occurredAt") DESC, COUNT(*) DESC
       LIMIT $1`,
      [MAX_REVIEW_PATTERNS],
    );
    return result.rows.map(mapReviewPattern);
  }

  async hasReviewPattern(pattern) {
    this.ensureAvailable();
    const result = await this.pool.query(
      `SELECT 1
       FROM public."FoundationLearningEvent"
       WHERE "eventType" = 'decision-feedback'
         AND "decisionRoute" = $1
         AND "decisionIntent" = $2
         AND "decisionConfidence" = $3
         AND "evidenceRequired" = $4
         AND "decisionReason" = $5
         AND "outcome" = $6
         AND "feedbackCode" = $7
         AND "outcome" IN ('corrected', 'failed')
       LIMIT 1`,
      [
        pattern.route,
        pattern.intent,
        pattern.confidence,
        pattern.evidenceRequired,
        pattern.reason,
        pattern.outcome,
        pattern.feedbackCode,
      ],
    );
    return result.rows.length > 0;
  }
}

module.exports = { MAX_REVIEW_PATTERNS, PgLearningEventRepository };
