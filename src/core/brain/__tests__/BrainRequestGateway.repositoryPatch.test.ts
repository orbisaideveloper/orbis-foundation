import {
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { BrainRequestGateway } from "../BrainRequestGateway";

const CAP_REPOSITORY_PATCH = "termux.repository.patch";

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

describe("Phase 5A repository patch required context", () => {
  test("missing patch path and edits requests clarification before execution", async () => {
    const { gateway, orchestrator } =
      gatewayFixture();

    const result = await gateway.submit({
      capabilityId: CAP_REPOSITORY_PATCH,
      input: {},
    });

    expect(result.success).toBe(false);
    expect(result.clarificationRequired).toBe(true);
    expect(result.missingFields).toEqual([
      "path",
      "edits",
    ]);
    expect(
      orchestrator.requestCapability,
    ).not.toHaveBeenCalled();
  });

  test("missing edits requests clarification without consuming an approval", async () => {
    const { gateway, orchestrator } =
      gatewayFixture();

    const result = await gateway.submit({
      capabilityId: CAP_REPOSITORY_PATCH,
      input: {
        path: "src/example.ts",
      },
    });

    expect(result.success).toBe(false);
    expect(result.clarificationRequired).toBe(true);
    expect(result.missingFields).toEqual([
      "edits",
    ]);
    expect(
      orchestrator.requestCapability,
    ).not.toHaveBeenCalled();
  });
});
