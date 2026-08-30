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
}

module.exports = { PgLearningEventRepository };
