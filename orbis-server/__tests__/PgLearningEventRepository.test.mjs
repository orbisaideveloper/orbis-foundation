// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  PgLearningEventRepository,
} = require("../ai/learning/PgLearningEventRepository.cjs");

const EVENT = {
  eventId: "11111111-1111-4111-8111-111111111111",
  kind: "decision-feedback",
  occurredAt: "2026-08-29T12:00:00.000Z",
  decision: {
    route: "web-search",
    intent: "live-information",
    confidence: "high",
    evidenceRequired: true,
    reason: "time-sensitive-request",
  },
  outcome: "failed",
  feedbackCode: "missing-evidence",
  deduplicationHash: "a".repeat(64),
};
const REVIEW_PATTERN = {
  ...EVENT.decision,
  outcome: EVENT.outcome,
  feedbackCode: EVENT.feedbackCode,
};
const REVIEW_START = EVENT.occurredAt;
const REVIEW_END = "2026-08-30T12:00:00.000Z";

describe("PgLearningEventRepository", () => {
  it("writes only safe metadata and returns an idempotent duplicate", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: EVENT.eventId }] }),
    };
    const repository = new PgLearningEventRepository(pool);
    await expect(repository.createOrGetBatch([EVENT])).resolves.toEqual([
      { record: { eventId: EVENT.eventId }, duplicate: true },
    ]);
    const serializedCalls = JSON.stringify(pool.query.mock.calls);
    expect(serializedCalls).toContain(EVENT.deduplicationHash);
    expect(serializedCalls).not.toContain("private user question");
  });

  it("fails closed when storage is unavailable", async () => {
    const repository = new PgLearningEventRepository(null);
    await expect(repository.createOrGetBatch([EVENT])).rejects.toMatchObject({
      code: "LEARNING_EVENT_STORAGE_UNAVAILABLE",
    });
  });

  it("returns aggregated review patterns without selecting event ids or hashes", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            decisionRoute: REVIEW_PATTERN.route,
            decisionIntent: REVIEW_PATTERN.intent,
            decisionConfidence: REVIEW_PATTERN.confidence,
            evidenceRequired: REVIEW_PATTERN.evidenceRequired,
            decisionReason: REVIEW_PATTERN.reason,
            outcome: REVIEW_PATTERN.outcome,
            feedbackCode: REVIEW_PATTERN.feedbackCode,
            occurrences: "3",
            firstOccurredAt: new Date(REVIEW_START),
            lastOccurredAt: new Date(REVIEW_END),
          },
        ],
      }),
    };
    const repository = new PgLearningEventRepository(pool);

    await expect(repository.listReviewPatterns()).resolves.toEqual([
      {
        ...REVIEW_PATTERN,
        occurrences: 3,
        firstOccurredAt: REVIEW_START,
        lastOccurredAt: REVIEW_END,
      },
    ]);

    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('GROUP BY');
    expect(sql).not.toContain('"id"');
    expect(sql).not.toContain('"deduplicationHash"');
  });

  it("checks that a selected review pattern still exists before approval", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    };
    const repository = new PgLearningEventRepository(pool);

    await expect(repository.hasReviewPattern(REVIEW_PATTERN)).resolves.toBe(
      true,
    );
    expect(pool.query.mock.calls[0][1]).toEqual([
      REVIEW_PATTERN.route,
      REVIEW_PATTERN.intent,
      REVIEW_PATTERN.confidence,
      REVIEW_PATTERN.evidenceRequired,
      REVIEW_PATTERN.reason,
      REVIEW_PATTERN.outcome,
      REVIEW_PATTERN.feedbackCode,
    ]);
  });
});
