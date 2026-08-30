// @vitest-environment node

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  LearningEventBatchSchema,
  MAX_LEARNING_EVENTS_PER_BATCH,
} = require("../ai/learning/LearningEventContract.cjs");

function event(overrides = {}) {
  return {
    eventId: randomUUID(),
    kind: "decision-feedback",
    occurredAt: "2026-08-29T12:00:00.000Z",
    decision: {
      intent: "live-information",
      route: "web-search",
      confidence: "high",
      evidenceRequired: true,
      reason: "time-sensitive-request",
    },
    outcome: "failed",
    feedbackCode: "missing-evidence",
    ...overrides,
  };
}

describe("metadata-only LearningEventBatch contract", () => {
  it("accepts bounded deterministic decision feedback", () => {
    const parsed = LearningEventBatchSchema.parse({ events: [event()] });
    expect(parsed.events[0]).not.toHaveProperty("sourceText");
    expect(parsed.events[0].schemaVersion).toBe(1);
  });

  it("rejects raw chat fields, duplicate identities, and oversized batches", () => {
    const rawMessage = "This is a private user question that must never persist.";
    expect(
      LearningEventBatchSchema.safeParse({
        events: [event({ sourceText: rawMessage })],
      }).success,
    ).toBe(false);

    const duplicateId = randomUUID();
    expect(
      LearningEventBatchSchema.safeParse({
        events: [event({ eventId: duplicateId }), event({ eventId: duplicateId })],
      }).success,
    ).toBe(false);

    expect(
      LearningEventBatchSchema.safeParse({
        events: Array.from(
          { length: MAX_LEARNING_EVENTS_PER_BATCH + 1 },
          () => event(),
        ),
      }).success,
    ).toBe(false);
  });
});
