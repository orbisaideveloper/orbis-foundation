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
});
