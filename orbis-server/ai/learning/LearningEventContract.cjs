const crypto = require("node:crypto");
const { z } = require("zod");
const {
  BrainDecisionTraceSchema,
} = require("../brain/BrainDecisionContract.cjs");

const LEARNING_EVENT_SCHEMA_VERSION = 1;
const MAX_LEARNING_EVENTS_PER_BATCH = 25;

const LearningEventSchema = z
  .object({
    eventId: z.string().uuid(),
    schemaVersion: z.literal(LEARNING_EVENT_SCHEMA_VERSION).default(
      LEARNING_EVENT_SCHEMA_VERSION,
    ),
    kind: z.literal("decision-feedback"),
    occurredAt: z.string().max(40).datetime({ offset: true }),
    decision: BrainDecisionTraceSchema,
    outcome: z.enum(["confirmed", "corrected", "failed"]),
    feedbackCode: z.enum([
      "confirmed",
      "answer-incorrect",
      "route-incorrect",
      "missing-evidence",
      "clarification-needed",
      "capability-failed",
      "provider-failed",
    ]),
  })
  .strict()
  .superRefine((event, context) => {
    const isConfirmed = event.outcome === "confirmed";
    if (isConfirmed !== (event.feedbackCode === "confirmed")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feedbackCode"],
        message: "Confirmed outcomes must use the confirmed feedback code",
      });
    }
    if (
      event.decision.evidenceRequired &&
      event.feedbackCode === "missing-evidence" &&
      event.outcome !== "failed"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outcome"],
        message: "Missing required evidence is a failed outcome",
      });
    }
  });

const LearningEventBatchSchema = z
  .object({
    events: z
      .array(LearningEventSchema)
      .min(1)
      .max(MAX_LEARNING_EVENTS_PER_BATCH),
  })
  .strict()
  .superRefine((batch, context) => {
    const eventIds = new Set();
    batch.events.forEach((event, index) => {
      if (eventIds.has(event.eventId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", index, "eventId"],
          message: "Each eventId must occur once per batch",
        });
      }
      eventIds.add(event.eventId);
    });
  });

function learningEventError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function parseLearningEventBatch(value) {
  const parsed = LearningEventBatchSchema.safeParse(value);
  if (!parsed.success) throw learningEventError("LEARNING_EVENT_INVALID");
  return parsed.data;
}

function learningEventDeduplicationHash(eventId) {
  return crypto.createHash("sha256").update(eventId).digest("hex");
}

module.exports = {
  LEARNING_EVENT_SCHEMA_VERSION,
  MAX_LEARNING_EVENTS_PER_BATCH,
  LearningEventSchema,
  LearningEventBatchSchema,
  parseLearningEventBatch,
  learningEventDeduplicationHash,
};
