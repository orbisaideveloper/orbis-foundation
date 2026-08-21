import { describe, test, expect, vi, beforeEach } from "vitest";
import { BrainRequestGateway } from "../BrainRequestGateway";
import { IBrainCapabilityOrchestrator } from "../BrainCapabilityOrchestrator";
import { IDecisionEngine, BrainDecision } from "../DecisionEngine";
import { ITaskProcessor, TaskProcessingResult } from "../TaskProcessor";
import { IExecutionResult } from "../../execution/interfaces/IExecutionResult";

const CAP_ID = "termux.system.info";

function makeOrchestrator(result?: Partial<IExecutionResult>) {
  const requestCapability = vi.fn().mockResolvedValue({
    success: true,
    requestId: "req-1",
    runtime: "TermuxRuntime",
    output: { ok: true },
    durationMs: 5,
    ...result,
  });
  return { requestCapability } as unknown as IBrainCapabilityOrchestrator & {
    requestCapability: typeof requestCapability;
  };
}

function makeDecisionEngine(decision: BrainDecision) {
  const decide = vi.fn().mockReturnValue(decision);
  return { decide } as unknown as IDecisionEngine & { decide: typeof decide };
}

function makeTaskProcessor(result: TaskProcessingResult) {
  const process = vi.fn().mockReturnValue(result);
  return { process } as unknown as ITaskProcessor & { process: typeof process };
}

describe("TASK-015 (Part 2): BrainRequestGateway <-> DecisionEngine/TaskProcessor integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("A. A valid request invokes DecisionEngine exactly once", async () => {
    const orchestrator = makeOrchestrator();
    const decision: BrainDecision = {
      category: "CAPABILITY_EXECUTION",
      decisionCode: "CAPABILITY_EXECUTION_CANDIDATE",
      capabilityId: CAP_ID,
      reason: "ok",
    };
    const decisions = makeDecisionEngine(decision);
    const tasks = makeTaskProcessor({
      accepted: true,
      task: {
        capabilityId: CAP_ID,
        input: {},
        decisionCode: decision.decisionCode,
      },
    });

    const gateway = new BrainRequestGateway(orchestrator, decisions, tasks);
    await gateway.submit({ capabilityId: CAP_ID, input: {} });

    expect(decisions.decide).toHaveBeenCalledTimes(1);
    expect(decisions.decide).toHaveBeenCalledWith(
      expect.objectContaining({ capabilityId: CAP_ID, input: {} }),
    );
  });

  test("B. A valid request invokes TaskProcessor exactly once with the DecisionEngine result", async () => {
    const orchestrator = makeOrchestrator();
    const decision: BrainDecision = {
      category: "CAPABILITY_EXECUTION",
      decisionCode: "CAPABILITY_EXECUTION_CANDIDATE",
      capabilityId: CAP_ID,
      reason: "ok",
    };
    const decisions = makeDecisionEngine(decision);
    const tasks = makeTaskProcessor({
      accepted: true,
      task: {
        capabilityId: CAP_ID,
        input: {},
        decisionCode: decision.decisionCode,
      },
    });

    const gateway = new BrainRequestGateway(orchestrator, decisions, tasks);
    await gateway.submit({ capabilityId: CAP_ID, input: {} });

    expect(tasks.process).toHaveBeenCalledTimes(1);
    expect(tasks.process).toHaveBeenCalledWith(
      decision,
      expect.objectContaining({ capabilityId: CAP_ID }),
    );
  });

  test("C. An accepted task is forwarded to BrainCapabilityOrchestrator using the task's fields", async () => {
    const orchestrator = makeOrchestrator();
    const decision: BrainDecision = {
      category: "CAPABILITY_EXECUTION",
      decisionCode: "CAPABILITY_EXECUTION_CANDIDATE",
      capabilityId: CAP_ID,
      reason: "ok",
    };
    const decisions = makeDecisionEngine(decision);
    const options = { timeoutMs: 1234 };
    const tasks = makeTaskProcessor({
      accepted: true,
      task: {
        capabilityId: CAP_ID,
        input: { x: 1 },
        options,
        decisionCode: decision.decisionCode,
      },
    });

    const gateway = new BrainRequestGateway(orchestrator, decisions, tasks);
    await gateway.submit({ capabilityId: CAP_ID, input: {} });

    expect(orchestrator.requestCapability).toHaveBeenCalledWith(
      CAP_ID,
      { x: 1 },
      options,
    );
  });

  test("D. A TaskProcessor rejection does NOT call BrainCapabilityOrchestrator and returns success:false", async () => {
    // TASK-020: the NON_EXECUTION category was removed as dead code, so
    // this now exercises the DECISION_INVALID rejection path instead —
    // still proving a TaskProcessor rejection short-circuits before the
    // orchestrator is ever called.
    const orchestrator = makeOrchestrator();
    const decision: BrainDecision = {
      category: "INVALID",
      decisionCode: "MISSING_CAPABILITY_ID",
      capabilityId: null,
      reason: "capabilityId is missing or not a non-empty string",
    };
    const decisions = makeDecisionEngine(decision);
    const tasks = makeTaskProcessor({
      accepted: false,
      rejectionCode: "DECISION_INVALID",
      reason: "capabilityId is missing or not a non-empty string",
    });

    const gateway = new BrainRequestGateway(orchestrator, decisions, tasks);
    const result = await gateway.submit({
      capabilityId: CAP_ID,
      input: {},
    });

    expect(orchestrator.requestCapability).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("DECISION_INVALID");
  });

  test("E. BrainCapabilityOrchestrator remains the execution-routing layer: its result is returned unchanged on acceptance", async () => {
    const orchestrator = makeOrchestrator({
      success: true,
      output: { detail: "structured-output" },
    });
    const decision: BrainDecision = {
      category: "CAPABILITY_EXECUTION",
      decisionCode: "CAPABILITY_EXECUTION_CANDIDATE",
      capabilityId: CAP_ID,
      reason: "ok",
    };
    const decisions = makeDecisionEngine(decision);
    const tasks = makeTaskProcessor({
      accepted: true,
      task: {
        capabilityId: CAP_ID,
        input: {},
        decisionCode: decision.decisionCode,
      },
    });

    const gateway = new BrainRequestGateway(orchestrator, decisions, tasks);
    const result = await gateway.submit({ capabilityId: CAP_ID, input: {} });

    expect(result).toMatchObject({
      success: true,
      output: { detail: "structured-output" },
    });
  });

  test("F. Using the real (non-mocked) DecisionEngine/TaskProcessor singletons, a valid request still reaches the orchestrator", async () => {
    const orchestrator = makeOrchestrator();
    const gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({ capabilityId: CAP_ID, input: {} });

    expect(orchestrator.requestCapability).toHaveBeenCalledTimes(1);
    expect(orchestrator.requestCapability).toHaveBeenCalledWith(
      CAP_ID,
      {},
      undefined,
    );
    expect(result.success).toBe(true);
  });

  test("G. Authorization boundary remains intact: the gateway never imports execution/authorization internals", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const code = fs
      .readFileSync(path.join(__dirname, "../BrainRequestGateway.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    expect(code).not.toMatch(
      /from\s+["'][^"']*SecureExecutionAuthorizationGate["']/,
    );
    expect(code).not.toMatch(/from\s+["'][^"']*ExecutionPolicyEngine["']/);
    expect(code).not.toMatch(/from\s+["'][^"']*TermuxRuntime["']/);
  });
});
