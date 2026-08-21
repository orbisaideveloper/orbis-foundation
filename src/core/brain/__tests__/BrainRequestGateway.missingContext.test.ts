import { describe, test, expect, vi, beforeEach } from "vitest";
import { BrainRequestGateway } from "../BrainRequestGateway";
import { IBrainCapabilityOrchestrator } from "../BrainCapabilityOrchestrator";
import { IExecutionResult } from "../../execution/interfaces/IExecutionResult";

/**
 * TASK-020 (Part 1) — Conversational Missing Context Detection.
 *
 * termux.file.read is the only capability with a declared required-input
 * field today (see BrainRequestGateway's CAPABILITY_REQUIRED_CONTEXT).
 * These tests prove:
 *   - a request missing that field never reaches DecisionEngine/
 *     TaskProcessor/BrainCapabilityOrchestrator at all,
 *   - the returned result is a Clarification Request
 *     (clarificationRequired: true, missingFields: [...]) rather than a
 *     generic validation failure,
 *   - a capability with no declared requirement (termux.system.info) is
 *     completely unaffected,
 *   - once the required field is present, the request proceeds exactly
 *     as before (no behavior change for already-complete requests).
 */

const CAP_FILE_READ = "termux.file.read";
const CAP_SYSTEM_INFO = "termux.system.info";

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

describe("TASK-020 (Part 1): BrainRequestGateway Missing Context Detection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("A. termux.file.read with input:{} returns a Clarification Request and never calls the orchestrator", async () => {
    const orchestrator = makeOrchestrator();
    const gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({
      capabilityId: CAP_FILE_READ,
      input: {},
    });

    expect(orchestrator.requestCapability).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.clarificationRequired).toBe(true);
    expect(result.missingFields).toEqual(["path"]);
    expect(result.error).toContain("MISSING_CONTEXT");
  });

  test("B. termux.file.read with an empty-string path is still treated as missing context", async () => {
    const orchestrator = makeOrchestrator();
    const gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({
      capabilityId: CAP_FILE_READ,
      input: { path: "   " },
    });

    expect(orchestrator.requestCapability).not.toHaveBeenCalled();
    expect(result.clarificationRequired).toBe(true);
    expect(result.missingFields).toEqual(["path"]);
  });

  test("C. termux.file.read with a real path proceeds exactly as before (no clarification, orchestrator called)", async () => {
    const orchestrator = makeOrchestrator();
    const gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({
      capabilityId: CAP_FILE_READ,
      input: { path: "package.json" },
    });

    expect(orchestrator.requestCapability).toHaveBeenCalledTimes(1);
    expect(orchestrator.requestCapability).toHaveBeenCalledWith(
      CAP_FILE_READ,
      { path: "package.json" },
      undefined,
    );
    expect(result.clarificationRequired).toBeUndefined();
    expect(result.success).toBe(true);
  });

  test("D. termux.system.info (no declared required context) is completely unaffected", async () => {
    const orchestrator = makeOrchestrator();
    const gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({
      capabilityId: CAP_SYSTEM_INFO,
      input: {},
    });

    expect(orchestrator.requestCapability).toHaveBeenCalledTimes(1);
    expect(result.clarificationRequired).toBeUndefined();
    expect(result.success).toBe(true);
  });

  test("E. An unrelated, unregistered capabilityId with no declared required context is not blocked by this check", async () => {
    const orchestrator = makeOrchestrator({
      success: false,
      error: "CAPABILITY_NOT_DISCOVERABLE",
    });
    const gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({
      capabilityId: "some.other.capability",
      input: {},
    });

    // Missing-context detection only applies to capabilities with a
    // declared requirement; everything else still reaches the
    // orchestrator exactly as before this task.
    expect(orchestrator.requestCapability).toHaveBeenCalledTimes(1);
    expect(result.clarificationRequired).toBeUndefined();
    expect(result.error).toBe("CAPABILITY_NOT_DISCOVERABLE");
  });
});
