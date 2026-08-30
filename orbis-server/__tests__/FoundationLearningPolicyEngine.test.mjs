// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  FoundationLearningPolicyEngine,
  hasVerifiedEvidence,
} = require("../ai/learning/FoundationLearningPolicyEngine.cjs");

const LIVE_DECISION = {
  route: "web-search",
  intent: "live-information",
  confidence: "high",
  evidenceRequired: true,
  reason: "time-sensitive-request",
};

const ACTIVE_RULE = {
  id: "rule-1",
  category: "OPERATING_RULE",
  content: "A generalized rule that must never become a provider instruction.",
  tags: ["verification", "time-sensitive", "current-sources"],
  isActive: true,
};

describe("FoundationLearningPolicyEngine", () => {
  it("applies the approved time-sensitive rule using only category and tags", async () => {
    const repository = { list: vi.fn().mockResolvedValue([ACTIVE_RULE]) };
    const engine = new FoundationLearningPolicyEngine({ repository });

    await expect(engine.evaluate(LIVE_DECISION)).resolves.toEqual({
      applied: [
        {
          code: "time-sensitive-evidence",
          label: "Evidence verification",
        },
      ],
      requireVerifiedEvidence: true,
    });
    expect(repository.list).toHaveBeenCalledWith();
  });

  it("does not execute inactive, unrelated, or non-live rules", async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        { ...ACTIVE_RULE, isActive: false },
        { ...ACTIVE_RULE, category: "GENERAL_KNOWLEDGE" },
        { ...ACTIVE_RULE, tags: ["verification", "routing"] },
      ]),
    };
    const engine = new FoundationLearningPolicyEngine({ repository });

    await expect(engine.evaluate(LIVE_DECISION)).resolves.toEqual({
      applied: [],
      requireVerifiedEvidence: false,
    });
    await expect(
      engine.evaluate({
        ...LIVE_DECISION,
        route: "brain-orchestrated-provider",
      }),
    ).resolves.toEqual({ applied: [], requireVerifiedEvidence: false });
  });

  it("also recognizes the approved missing-evidence tag pair", async () => {
    const engine = new FoundationLearningPolicyEngine({
      repository: {
        list: vi
          .fn()
          .mockResolvedValue([
            { ...ACTIVE_RULE, tags: ["evidence", "verification"] },
          ]),
      },
    });

    await expect(engine.evaluate(LIVE_DECISION)).resolves.toMatchObject({
      requireVerifiedEvidence: true,
      applied: [{ code: "time-sensitive-evidence" }],
    });
  });

  it("keeps chat available when approved-rule storage is unavailable", async () => {
    const engine = new FoundationLearningPolicyEngine({
      repository: {
        list: vi.fn().mockRejectedValue(new Error("database secret")),
      },
    });

    await expect(engine.evaluate(LIVE_DECISION)).resolves.toEqual({
      applied: [],
      requireVerifiedEvidence: false,
    });
    await expect(
      new FoundationLearningPolicyEngine().evaluate(LIVE_DECISION),
    ).resolves.toEqual({ applied: [], requireVerifiedEvidence: false });
  });

  it("requires verified sources before an applied rule can permit delivery", () => {
    expect(
      hasVerifiedEvidence({
        sources: [{ title: "Source", url: "https://example.test" }],
        verification: { status: "verified" },
      }),
    ).toBe(true);
    expect(
      hasVerifiedEvidence({
        sources: [],
        verification: { status: "verified" },
      }),
    ).toBe(false);
    expect(
      hasVerifiedEvidence({
        sources: [{ title: "Source", url: "https://example.test" }],
        verification: { status: "unverified" },
      }),
    ).toBe(false);
  });
});
