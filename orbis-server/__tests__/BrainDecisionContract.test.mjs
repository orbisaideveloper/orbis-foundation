// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  BrainDecisionSchema,
  decisionTrace,
} = require("../ai/brain/BrainDecisionContract.cjs");

describe("BrainDecisionContract", () => {
  it("accepts a complete evidence-required web decision", () => {
    const decision = BrainDecisionSchema.parse({
      route: "web-search",
      capabilityId: "web.search.tavily",
      brainDecision: "live-web-search",
      intent: "live-information",
      confidence: "high",
      evidenceRequired: true,
      reason: "time-sensitive-request",
    });

    expect(decisionTrace(decision)).toEqual({
      intent: "live-information",
      route: "web-search",
      confidence: "high",
      evidenceRequired: true,
      reason: "time-sensitive-request",
    });
  });

  it("rejects web decisions that try to bypass evidence", () => {
    const result = BrainDecisionSchema.safeParse({
      route: "web-search",
      capabilityId: "web.search.tavily",
      brainDecision: "live-web-search",
      intent: "live-information",
      confidence: "high",
      evidenceRequired: false,
      reason: "time-sensitive-request",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown routes and unexpected decision fields", () => {
    expect(
      BrainDecisionSchema.safeParse({
        route: "invented-tool",
        capabilityId: null,
        brainDecision: "invented",
        intent: "general-conversation",
        confidence: "high",
        evidenceRequired: false,
        reason: "provider-reasoning",
      }).success,
    ).toBe(false);
    expect(
      BrainDecisionSchema.safeParse({
        route: "brain-orchestrated-provider",
        capabilityId: "provider.chat",
        brainDecision: "general-conversation",
        intent: "general-conversation",
        confidence: "medium",
        evidenceRequired: false,
        reason: "provider-reasoning",
        rawUserMessage: "must never enter a decision trace",
      }).success,
    ).toBe(false);
  });
});
