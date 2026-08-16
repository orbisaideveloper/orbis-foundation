import { describe, test, expect } from "vitest";
import { DecisionEngine, NormalizedBrainRequest } from "../DecisionEngine";

const CAP_ID = "termux.system.info";
const NON_EXECUTION_CAP_ID = "brain.reasoning.summarize";

describe("TASK-015 (Part 2): DecisionEngine", () => {
  const engine = new DecisionEngine();

  test("A. A capability-execution candidate is classified as CAPABILITY_EXECUTION", () => {
    const request: NormalizedBrainRequest = { capabilityId: CAP_ID, input: {} };

    const decision = engine.decide(request);

    expect(decision.category).toBe("CAPABILITY_EXECUTION");
    expect(decision.decisionCode).toBe("CAPABILITY_EXECUTION_CANDIDATE");
    expect(decision.capabilityId).toBe(CAP_ID);
  });

  test("B. A reserved non-execution capabilityId is classified as NON_EXECUTION", () => {
    const request: NormalizedBrainRequest = {
      capabilityId: NON_EXECUTION_CAP_ID,
      input: {},
    };

    const decision = engine.decide(request);

    expect(decision.category).toBe("NON_EXECUTION");
    expect(decision.decisionCode).toBe("NON_EXECUTION_REQUEST");
    expect(decision.capabilityId).toBe(NON_EXECUTION_CAP_ID);
  });

  test.each([
    ["empty string", ""],
    ["whitespace", "   "],
    ["null", null],
    ["undefined", undefined],
    ["number", 123],
    ["object", { id: CAP_ID }],
  ])(
    "C. Invalid capabilityId (%s) is classified as INVALID",
    (_label, value) => {
      const request = {
        capabilityId: value,
        input: {},
      } as unknown as NormalizedBrainRequest;

      const decision = engine.decide(request);

      expect(decision.category).toBe("INVALID");
      expect(decision.decisionCode).toBe("MISSING_CAPABILITY_ID");
      expect(decision.capabilityId).toBeNull();
    },
  );

  test("D. Deterministic: the same input always produces an equal decision", () => {
    const request: NormalizedBrainRequest = {
      capabilityId: CAP_ID,
      input: { foo: "bar" },
      requestId: "req-fixed-1",
    };

    const first = engine.decide(request);
    const second = engine.decide(request);

    expect(first).toEqual(second);
  });

  test("E. requestId is preserved on the decision when present", () => {
    const request: NormalizedBrainRequest = {
      capabilityId: CAP_ID,
      input: {},
      requestId: "req-42",
    };

    const decision = engine.decide(request);

    expect(decision.requestId).toBe("req-42");
  });

  test("F. No side effects: the input request object is not mutated", () => {
    const request: NormalizedBrainRequest = {
      capabilityId: CAP_ID,
      input: { a: 1 },
      requestId: "req-immutable",
    };
    const snapshot = JSON.parse(JSON.stringify(request));

    engine.decide(request);

    expect(request).toEqual(snapshot);
  });

  test("G. Decision Engine source contains no forbidden runtime/process/network patterns", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const code = fs
      .readFileSync(path.join(__dirname, "../DecisionEngine.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    expect(code).not.toMatch(/from\s+["'][^"']*TermuxRuntime["']/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/require\(\s*["']child_process["']\s*\)/);
    expect(code).not.toMatch(/\bexec(Sync)?\s*\(/);
    expect(code).not.toMatch(/\bspawn(Sync)?\s*\(/);
  });
});
