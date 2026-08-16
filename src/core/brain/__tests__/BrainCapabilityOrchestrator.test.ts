import { describe, test, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  BrainCapabilityOrchestrator,
  IBrainCapabilityOrchestrator,
} from "../BrainCapabilityOrchestrator";
import { ILocalCapabilityDiscovery } from "../LocalCapabilityDiscovery";
import { IControlledCapabilityExecution } from "../ControlledCapabilityExecution";
import { IExecutionResult } from "../../execution/interfaces/IExecutionResult";

const CAP_ID = "termux.system.info";
const RUNTIME_NAME = "TermuxRuntime";
const ORCHESTRATOR_SOURCE_PATH = "../BrainCapabilityOrchestrator.ts";
const ENCODING_UTF8 = "utf-8";
const REASON_NOT_DISCOVERABLE = "CAPABILITY_NOT_DISCOVERABLE";

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readOrchestratorSource(): string {
  return fs.readFileSync(
    path.join(__dirname, ORCHESTRATOR_SOURCE_PATH),
    ENCODING_UTF8,
  );
}

function makeDiscovery(
  overrides: Partial<
    Awaited<ReturnType<ILocalCapabilityDiscovery["discoverLocalCapabilities"]>>
  > = {},
): ILocalCapabilityDiscovery {
  return {
    discoverLocalCapabilities: vi.fn().mockResolvedValue({
      runtime: RUNTIME_NAME,
      connected: true,
      ready: true,
      bridgeStatus: "CAPABILITIES_VERIFIED",
      capabilities: [{ id: CAP_ID, available: true }],
      checkedAt: Date.now(),
      ...overrides,
    }),
  };
}

function makeExecution(result?: Partial<IExecutionResult>) {
  const execute = vi.fn().mockResolvedValue({
    success: true,
    requestId: "req-1",
    runtime: RUNTIME_NAME,
    output: { ok: true },
    durationMs: 12,
    ...result,
  });

  return { execute } as unknown as IControlledCapabilityExecution & {
    execute: typeof execute;
  };
}

describe("TASK-010: Brain Capability Orchestrator", () => {
  let orchestrator: IBrainCapabilityOrchestrator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("1. Discoverable capability proceeds to execution", async () => {
    const discovery = makeDiscovery();
    const execution = makeExecution();

    orchestrator = new BrainCapabilityOrchestrator(discovery, execution);

    const result = await orchestrator.requestCapability(CAP_ID, {});

    expect(execution.execute).toHaveBeenCalledTimes(1);
    expect(execution.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: CAP_ID,
        requestedRuntime: RUNTIME_NAME,
      }),
    );
    expect(result.success).toBe(true);
  });

  test("2. Unknown capability does NOT call execution.execute()", async () => {
    const discovery = makeDiscovery();
    const execution = makeExecution();

    orchestrator = new BrainCapabilityOrchestrator(discovery, execution);

    const result = await orchestrator.requestCapability(
      "termux.unknown.capability",
      {},
    );

    expect(execution.execute).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain(REASON_NOT_DISCOVERABLE);
  });

  test("3. Disconnected/unready discovery does NOT call execution.execute()", async () => {
    const discovery = makeDiscovery({
      connected: false,
      ready: false,
      capabilities: [],
      unavailableReason: "BRIDGE_UNREACHABLE",
    });

    const execution = makeExecution();

    orchestrator = new BrainCapabilityOrchestrator(discovery, execution);

    const result = await orchestrator.requestCapability(CAP_ID, {});

    expect(execution.execute).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("DISCOVERY_UNAVAILABLE");
  });

  test("3b. Empty capability id does NOT call discovery or execution", async () => {
    const discovery = makeDiscovery();
    const execution = makeExecution();

    orchestrator = new BrainCapabilityOrchestrator(discovery, execution);

    const result = await orchestrator.requestCapability("", {});

    expect((discovery.discoverLocalCapabilities as any).mock.calls.length).toBe(
      0,
    );
    expect(execution.execute).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("CAPABILITY_ID_REQUIRED");
  });

  test("4. Existing IExecutionResult information is preserved", async () => {
    const discovery = makeDiscovery();
    const execution = makeExecution({
      success: true,
      output: { detail: "structured-output" },
      exitCode: 0,
      metadata: { source: "termux" },
    });

    orchestrator = new BrainCapabilityOrchestrator(discovery, execution);

    const result = await orchestrator.requestCapability(CAP_ID, {});

    expect(result).toMatchObject({
      success: true,
      output: { detail: "structured-output" },
      exitCode: 0,
      metadata: { source: "termux" },
    });
  });

  test("5. Orchestrator has no direct Termux runtime import", () => {
    const code = stripComments(readOrchestratorSource());

    expect(code).not.toMatch(/from\s+["'][^"']*TermuxRuntime["']/);
    expect(code).not.toMatch(/from\s+["'][^"']*TermuxRuntimeService["']/);
  });

  test("6. Orchestrator performs no direct HTTP/fetch execution", () => {
    const code = stripComments(readOrchestratorSource());

    expect(code).not.toMatch(/\bfetch\s*\(/);
  });

  test("7. Orchestrator contains no child_process/exec/spawn/shell path", () => {
    const code = stripComments(readOrchestratorSource());

    expect(code).not.toMatch(/require\(\s*["']child_process["']\s*\)/);
    expect(code).not.toMatch(/from\s+["']child_process["']/);
    expect(code).not.toMatch(/\bexec\s*\(/);
    expect(code).not.toMatch(/\bspawn\s*\(/);
  });

  test("8. Propagates a failed execution result unchanged", async () => {
    const discovery = makeDiscovery();
    const execution = makeExecution({
      success: false,
      error: "AUTHORIZATION_DENY: capability disabled",
    });

    orchestrator = new BrainCapabilityOrchestrator(discovery, execution);

    const result = await orchestrator.requestCapability(CAP_ID, {});

    expect(result.success).toBe(false);
    expect(result.error).toBe("AUTHORIZATION_DENY: capability disabled");
  });

  test("9. Default constructor wires the shared discovery/execution singletons", () => {
    const defaultOrchestrator = new BrainCapabilityOrchestrator();

    expect(defaultOrchestrator).toBeInstanceOf(BrainCapabilityOrchestrator);
  });

  test("10. A capability present but marked unavailable is not discoverable", async () => {
    const discovery = makeDiscovery({
      capabilities: [{ id: CAP_ID, available: false }],
    });

    const execution = makeExecution();

    orchestrator = new BrainCapabilityOrchestrator(discovery, execution);

    const result = await orchestrator.requestCapability(CAP_ID, {});

    expect(execution.execute).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain(REASON_NOT_DISCOVERABLE);
  });
});
