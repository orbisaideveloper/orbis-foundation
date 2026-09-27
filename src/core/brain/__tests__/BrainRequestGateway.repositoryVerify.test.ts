import {
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { BrainRequestGateway } from "../BrainRequestGateway";

const CAP_VERIFY = "termux.repository.verify";

function gatewayFixture() {
  const orchestrator = {
    requestCapability: vi.fn(),
    resolveApproval: vi.fn(),
  };

  return {
    orchestrator,
    gateway: new BrainRequestGateway(
      orchestrator as any,
    ),
  };
}

describe("Phase 5B repository verify required context", () => {
  test("missing targets requests clarification before execution", async () => {
    const { gateway, orchestrator } =
      gatewayFixture();

    const result = await gateway.submit({
      capabilityId: CAP_VERIFY,
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.clarificationRequired).toBe(true);
    expect(result.missingFields).toEqual([
      "targets",
    ]);

    expect(
      orchestrator.requestCapability,
    ).not.toHaveBeenCalled();
  });

  test("targets are forwarded unchanged after validation", async () => {
    const { gateway, orchestrator } =
      gatewayFixture();

    orchestrator.requestCapability.mockResolvedValue({
      success: false,
      requestId: "verify-gateway-1",
      runtime: "TermuxRuntime",
      approvalRequired: true,
      durationMs: 0,
    });

    const input = {
      targets: [
        "orbis-server/__tests__/RepositoryPatchTool.test.mjs",
      ],
    };

    await gateway.submit({
      capabilityId: CAP_VERIFY,
      input,
    });

    expect(
      orchestrator.requestCapability,
    ).toHaveBeenCalledWith(
      CAP_VERIFY,
      input,
      undefined,
    );
  });
});
