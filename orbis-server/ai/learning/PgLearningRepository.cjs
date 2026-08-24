const crypto = require("node:crypto");

class PgLearningRepository {
  constructor(pool) {
    this.pool = pool;
  }

  ensureAvailable() {
    if (!this.pool) {
      const error = new Error("LEARNING_STORAGE_UNAVAILABLE");
      error.code = error.message;
      throw error;
    }
  }

  async createOrGet(record) {
    this.ensureAvailable();
    const inserted = await this.pool.query(
      `INSERT INTO "FoundationLearnedKnowledge"
        ("id", "category", "content", "tags", "deduplicationHash", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       ON CONFLICT ("deduplicationHash") DO NOTHING
       RETURNING "id", "category", "content", "tags", "isActive", "createdAt", "updatedAt"`,
      [
        crypto.randomUUID(),
        record.category,
        record.content,
        record.tags,
        record.deduplicationHash,
      ],
    );
    if (inserted.rows[0]) return { record: inserted.rows[0], duplicate: false };
    const existing = await this.pool.query(
      `SELECT "id", "category", "content", "tags", "isActive", "createdAt", "updatedAt"
       FROM "FoundationLearnedKnowledge" WHERE "deduplicationHash" = $1 LIMIT 1`,
      [record.deduplicationHash],
    );
    return { record: existing.rows[0], duplicate: true };
  }

  async list() {
    this.ensureAvailable();
    const result = await this.pool.query(
      `SELECT "id", "category", "content", "tags", "isActive", "createdAt", "updatedAt"
       FROM "FoundationLearnedKnowledge"
       WHERE "isActive" = true ORDER BY "createdAt" DESC LIMIT 200`,
    );
    return result.rows;
  }

  async delete(id) {
    this.ensureAvailable();
    const result = await this.pool.query(
      `DELETE FROM "FoundationLearnedKnowledge" WHERE "id" = $1 RETURNING "id"`,
      [id],
    );
    return { deleted: result.rowCount === 1 };
  }
}

module.exports = { PgLearningRepository };
