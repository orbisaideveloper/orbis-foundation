const { z } = require("zod");

const ROUTES = [
  "approval",
  "foundation-capability",
  "foundation-capability-status",
  "web-search",
  "brain-direct-reply",
  "brain-orchestrated-provider",
  "clarification",
];

const INTENTS = [
  "approval",
  "foundation-capability",
  "capability-status",
  "live-information",
  "direct-conversation",
  "general-conversation",
  "unclear",
];

const REASONS = [
  "approval-decision",
  "registered-capability",
  "capability-status",
  "time-sensitive-request",
  "brain-direct-policy",
  "provider-reasoning",
  "invalid-decision",
];

const BrainDecisionSchema = z
  .object({
    route: z.enum(ROUTES),
    capabilityId: z.string().trim().min(1).max(120).nullable(),
    brainDecision: z.string().trim().min(1).max(120),
    intent: z.enum(INTENTS),
    confidence: z.enum(["high", "medium", "low"]),
    evidenceRequired: z.boolean(),
    reason: z.enum(REASONS),
    conversationPlan: z.unknown().optional(),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.route === "web-search" && !decision.evidenceRequired) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidenceRequired"],
        message: "Web search decisions must require evidence",
      });
    }
    if (decision.route !== "web-search" && decision.evidenceRequired) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidenceRequired"],
        message: "Only web search decisions require web evidence",
      });
    }
  });

function parseBrainDecision(value) {
  return BrainDecisionSchema.parse(value);
}

function decisionTrace(decision) {
  return {
    intent: decision.intent,
    route: decision.route,
    confidence: decision.confidence,
    evidenceRequired: decision.evidenceRequired,
    reason: decision.reason,
  };
}

function invalidDecisionTrace() {
  return {
    intent: "unclear",
    route: "clarification",
    confidence: "low",
    evidenceRequired: false,
    reason: "invalid-decision",
  };
}

module.exports = {
  BrainDecisionSchema,
  parseBrainDecision,
  decisionTrace,
  invalidDecisionTrace,
};
