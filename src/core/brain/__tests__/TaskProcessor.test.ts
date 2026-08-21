import { describe, test, expect } from "vitest";
import { TaskProcessor } from "../TaskProcessor";
import { BrainDecision, NormalizedBrainRequest } from "../DecisionEngine";

const CAP_ID_FORMER_NON_EXECUTION = "brain.reasoning.summarize";
const CAP_ID = "termux.system.info";
const REQ_ID_1 = "req-1";
const REQ_ID_PRESERVE_ME = "req-preserve-me";
const REQ_ID_REJECTED = "req-rejected";
const DECISION_CODE_CAPABILITY_EXECUTION_CANDIDATE =
  "CAPABILITY_EXECUTION_CANDIDATE";
const DECISION_CODE_MISSING_CAPABILITY_ID = "MISSING_CAPABILITY_ID";

function makeRequest(
  overrides: Partial<NormalizedBrainRequest> = {},
): NormalizedBrainRequest {
  return { capabilityId: CAP_ID, input: {}, ...overrides };
}

function makeDecision(overrides: Partial<BrainDecision> = {}): BrainDecision {
  return {
    category: "CAPABILITY_EXECUTION",
    decisionCode: DECISION_CODE_CAPABILITY_EXECUTION_CANDIDATE,
    capabilityId: CAP_ID,
    reason: "capabilityId is eligible for capability execution",
    ...overrides,
  };
}

describe("TASK-015 (Part 2): TaskProcessor", () => {
  const processor = new TaskProcessor();

  test("A. A valid CAPABILITY_EXECUTION decision produces an accepted task", () => {
    const request = makeRequest({ input: { a: 1 }, requestId: REQ_ID_1 });
    const decision = makeDecision({ requestId: REQ_ID_1 });

    const result = processor.process(decision, request);

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.task.capabilityId).toBe(CAP_ID);
      expect(result.task.input).toEqual({ a: 1 });
      expect(result.task.requestId).toBe(REQ_ID_1);
      expect(result.task.decisionCode).toBe(
        DECISION_CODE_CAPABILITY_EXECUTION_CANDIDATE,
      );
    }
  });

  test("B. An INVALID decision is rejected cleanly with DECISION_INVALID", () => {
    const decision = makeDecision({
      category: "INVALID",
      decisionCode: DECISION_CODE_MISSING_CAPABILITY_ID,
      capabilityId: null,
      reason: "capabilityId is missing or not a non-empty string",
    });

    const result = processor.process(decision, makeRequest());

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.rejectionCode).toBe("DECISION_INVALID");
    }
  });

  test("C. TASK-020: a formerly-reserved capabilityId is accepted like any other CAPABILITY_EXECUTION decision", () => {
    // The NON_EXECUTION category was removed as dead code (nothing ever
    // produced it). DecisionEngine now classifies this capabilityId as a
    // normal CAPABILITY_EXECUTION candidate, so TaskProcessor must accept
    // it exactly like test A — no special-casing left anywhere.
    const decision = makeDecision({
      capabilityId: CAP_ID_FORMER_NON_EXECUTION,
    });
    const request = makeRequest({ capabilityId: CAP_ID_FORMER_NON_EXECUTION });

    const result = processor.process(decision, request);

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.task.capabilityId).toBe(CAP_ID_FORMER_NON_EXECUTION);
    }
  });

  test("D. requestId is preserved through to the accepted task", () => {
    const decision = makeDecision({ requestId: REQ_ID_PRESERVE_ME });
    const request = makeRequest({ requestId: REQ_ID_PRESERVE_ME });

    const result = processor.process(decision, request);

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.task.requestId).toBe(REQ_ID_PRESERVE_ME);
    }
  });

  test("E. requestId is preserved through to a rejection", () => {
    const decision = makeDecision({
      category: "INVALID",
      decisionCode: DECISION_CODE_MISSING_CAPABILITY_ID,
      capabilityId: null,
      requestId: REQ_ID_REJECTED,
    });

    const result = processor.process(decision, makeRequest());

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.requestId).toBe(REQ_ID_REJECTED);
    }
  });

  test("F. capability information (options) is preserved where applicable", () => {
    const options = { timeoutMs: 5000, originatingTask: "TASK-015-test" };
    const request = makeRequest({ options });
    const decision = makeDecision();

    const result = processor.process(decision, request);

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.task.options).toEqual(options);
    }
  });

  test("G. A CAPABILITY_EXECUTION decision with a null capabilityId is rejected (defensive)", () => {
    const decision = makeDecision({ capabilityId: null });

    const result = processor.process(decision, makeRequest());

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.rejectionCode).toBe("CAPABILITY_ID_MISSING");
    }
  });

  test("H. No execution performed: TaskProcessor never calls fetch/child_process/TermuxRuntime", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const code = fs
      .readFileSync(path.join(__dirname, "../TaskProcessor.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    expect(code).not.toMatch(/from\s+["'][^"']*TermuxRuntime["']/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/require\(\s*["']child_process["']\s*\)/);
    expect(code).not.toMatch(/\bexec(Sync)?\s*\(/);
    expect(code).not.toMatch(/\bspawn(Sync)?\s*\(/);
  });
});
