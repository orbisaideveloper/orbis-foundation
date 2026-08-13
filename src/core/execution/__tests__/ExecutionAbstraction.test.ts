import { DefaultExecutionPolicy } from "../interfaces/IExecutionPolicy";
import { IExecutionRequest } from "../interfaces/IExecutionRequest";
import { IExecutionResult } from "../interfaces/IExecutionResult";

describe("TASK-001: Local Execution Abstraction Foundation", () => {
  let policy: DefaultExecutionPolicy;

  beforeEach(() => {
    policy = new DefaultExecutionPolicy();
  });

  test("1. Unknown capability is denied", () => {
    const request: IExecutionRequest = {
      requestId: "req-001",
      capability: "unknown.capability",
      input: {},
    };
    expect(policy.evaluate(request)).toBe("DENY");
  });

  test("2. Raw arbitrary shell execution is denied", () => {
    const request: IExecutionRequest = {
      requestId: "req-002",
      capability: "raw_command.shell",
      input: { cmd: "rm -rf /" },
    };
    expect(policy.evaluate(request)).toBe("DENY");
  });

  test("3. Registered safe capability can pass the policy layer", () => {
    const request: IExecutionRequest = {
      requestId: "req-003",
      capability: "safe.compute",
      input: { value: 42 },
      riskLevel: "LOW",
    };
    expect(policy.evaluate(request)).toBe("ALLOW");
  });

  test("4. REQUIRE_APPROVAL is represented correctly for high risk", () => {
    const request: IExecutionRequest = {
      requestId: "req-004",
      capability: "safe.compute",
      input: {},
      riskLevel: "HIGH",
    };
    expect(policy.evaluate(request)).toBe("REQUIRE_APPROVAL");
  });

  test("5. Execution result structure works correctly", () => {
    const result: IExecutionResult = {
      success: true,
      requestId: "req-005",
      runtime: "MockRuntime",
      output: { result: 100 },
      durationMs: 15,
    };
    expect(result.success).toBe(true);
    expect(result.requestId).toBe("req-005");
    expect(result.durationMs).toBe(15);
  });
});
