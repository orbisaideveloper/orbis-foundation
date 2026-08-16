import { describe, test, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  BrainRequestGateway,
  IBrainRequestGateway,
  RawBrainRequest,
} from "../BrainRequestGateway";
import { IBrainCapabilityOrchestrator } from "../BrainCapabilityOrchestrator";
import { IExecutionResult } from "../../execution/interfaces/IExecutionResult";

const CAP_ID = "termux.system.info";
const GATEWAY_SOURCE_PATH = "../BrainRequestGateway.ts";
const ENCODING_UTF8 = "utf-8";
const REASON_INPUT_INVALID = "INPUT_INVALID";
const REASON_CAPABILITY_ID_INVALID = "CAPABILITY_ID_INVALID";

function readGatewaySource(): string {
  return fs.readFileSync(
    path.join(__dirname, GATEWAY_SOURCE_PATH),
    ENCODING_UTF8,
  );
}

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

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

describe("TASK-011: Brain Request Gateway", () => {
  let gateway: IBrainRequestGateway;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("A. Valid request calls TASK-010 exactly once", async () => {
    const orchestrator = makeOrchestrator();
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({ capabilityId: CAP_ID, input: {} });

    expect(orchestrator.requestCapability).toHaveBeenCalledTimes(1);
    expect(orchestrator.requestCapability).toHaveBeenCalledWith(
      CAP_ID,
      {},
      undefined,
    );
    expect(result.success).toBe(true);
  });

  test("B. Empty capabilityId does NOT call TASK-010", async () => {
    const orchestrator = makeOrchestrator();
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({ capabilityId: "", input: {} });

    expect(orchestrator.requestCapability).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain(REASON_CAPABILITY_ID_INVALID);
  });

  test("C. Whitespace capabilityId does NOT call TASK-010", async () => {
    const orchestrator = makeOrchestrator();
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({ capabilityId: "   ", input: {} });

    expect(orchestrator.requestCapability).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain(REASON_CAPABILITY_ID_INVALID);
  });

  test("D. Missing capabilityId does NOT call TASK-010", async () => {
    const orchestrator = makeOrchestrator();
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({ input: {} } as RawBrainRequest);

    expect(orchestrator.requestCapability).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("CAPABILITY_ID_REQUIRED");
  });

  test.each([
    ["number", 123],
    ["object", { id: CAP_ID }],
    ["array", [CAP_ID]],
    ["boolean", true],
  ])("E. capabilityId as %s does NOT call TASK-010", async (_label, value) => {
    const orchestrator = makeOrchestrator();
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({
      capabilityId: value,
      input: {},
    } as unknown as RawBrainRequest);

    expect(orchestrator.requestCapability).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain(REASON_CAPABILITY_ID_INVALID);
  });

  test("F. input = null does NOT call TASK-010", async () => {
    const orchestrator = makeOrchestrator();
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({
      capabilityId: CAP_ID,
      input: null,
    } as unknown as RawBrainRequest);

    expect(orchestrator.requestCapability).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain(REASON_INPUT_INVALID);
  });

  test("G. input = undefined uses the existing safe default and calls TASK-010", async () => {
    const orchestrator = makeOrchestrator();
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({
      capabilityId: CAP_ID,
      input: undefined,
    } as unknown as RawBrainRequest);

    expect(orchestrator.requestCapability).toHaveBeenCalledTimes(1);
    expect(orchestrator.requestCapability).toHaveBeenCalledWith(
      CAP_ID,
      {},
      undefined,
    );
    expect(result.success).toBe(true);
  });

  test("H. input = array does NOT call TASK-010", async () => {
    const orchestrator = makeOrchestrator();
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({
      capabilityId: CAP_ID,
      input: [1, 2, 3],
    } as unknown as RawBrainRequest);

    expect(orchestrator.requestCapability).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain(REASON_INPUT_INVALID);
  });

  test.each([
    ["string", "not-an-object"],
    ["number", 42],
    ["boolean", false],
  ])("I. input as %s does NOT call TASK-010", async (_label, value) => {
    const orchestrator = makeOrchestrator();
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({
      capabilityId: CAP_ID,
      input: value,
    } as unknown as RawBrainRequest);

    expect(orchestrator.requestCapability).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain(REASON_INPUT_INVALID);
  });

  test("J. A successful TASK-010 result is returned unchanged", async () => {
    const orchestrator = makeOrchestrator({
      success: true,
      output: { detail: "structured-output" },
      exitCode: 0,
    });
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({ capabilityId: CAP_ID, input: {} });

    expect(result).toMatchObject({
      success: true,
      output: { detail: "structured-output" },
      exitCode: 0,
    });
  });

  test("K. A failed TASK-010 result is returned unchanged", async () => {
    const orchestrator = makeOrchestrator({
      success: false,
      error: "AUTHORIZATION_DENY: capability disabled",
    });
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit({ capabilityId: CAP_ID, input: {} });

    expect(result.success).toBe(false);
    expect(result.error).toBe("AUTHORIZATION_DENY: capability disabled");
  });

  test("L. Gateway source contains no forbidden runtime/process patterns", () => {
    const code = stripComments(readGatewaySource());
    expect(code).not.toMatch(/from\s+["'][^"']*TermuxRuntime["']/);
    expect(code).not.toMatch(/from\s+["'][^"']*TermuxRuntimeService["']/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/require\(\s*["']child_process["']\s*\)/);
    expect(code).not.toMatch(/from\s+["']child_process["']/);
    expect(code).not.toMatch(/\bexec\s*\(/);
    expect(code).not.toMatch(/\bspawn\s*\(/);
  });

  test("M. A non-object raw request does NOT call TASK-010", async () => {
    const orchestrator = makeOrchestrator();
    gateway = new BrainRequestGateway(orchestrator);

    const result = await gateway.submit(null as unknown as RawBrainRequest);

    expect(orchestrator.requestCapability).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("BRAIN_REQUEST_INVALID");
  });

  test("N. options, when provided, is forwarded to TASK-010 unchanged", async () => {
    const orchestrator = makeOrchestrator();
    gateway = new BrainRequestGateway(orchestrator);

    const options = { timeoutMs: 5000, originatingTask: "TASK-011-test" };
    await gateway.submit({ capabilityId: CAP_ID, input: {}, options });

    expect(orchestrator.requestCapability).toHaveBeenCalledWith(
      CAP_ID,
      {},
      options,
    );
  });

  test("O. Default constructor wires the shared TASK-010 orchestrator singleton", () => {
    const defaultGateway = new BrainRequestGateway();
    expect(defaultGateway).toBeInstanceOf(BrainRequestGateway);
  });
});
