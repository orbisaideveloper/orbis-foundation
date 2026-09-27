// @vitest-environment node

import { createRequire } from "node:module";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

const require = createRequire(import.meta.url);

const {
  AIChatService,
} = require("../ai/AIChatService.cjs");

const PATCH_CAPABILITY =
  "termux.repository.patch";
const VERIFY_CAPABILITY =
  "termux.repository.verify";

const EXAMPLE_SOURCE_PATH = "src/example.ts";

const PATCH_TOKEN =
  "test-patch-token-value-1234567890";
const VERIFY_TOKEN =
  "test-verify-token-value-1234567890";

const PROVIDER = {
  name: "Hugging Face",
  type: "cloud",
  model: "coder-model",
  routing: {
    task: "coding",
    registryModelId: "coder-model",
    codename: "Forge",
    source: "model-registry",
    attempts: [],
  },
};

describe("Phase 5C AIChatService repository capability flow", () => {
  it("keeps patch and verification behind two separate explicit approvals", async () => {
    const agentLoop = {
      run: vi.fn().mockResolvedValue({
        content:
          "Repository capability request prepared.",
        provider: PROVIDER,
        agent: {
          task: "coding",
          status: "capability-requested",
          iterations: 1,
          toolBudget: 3,
          tools: [],
        },
        capabilityRequest: {
          capabilityId: PATCH_CAPABILITY,
          input: {
            path: EXAMPLE_SOURCE_PATH,
            edits: [
              {
                oldText: "old",
                newText: "new",
              },
            ],
          },
          followUpVerification: {
            targets: [
              "src/example.test.ts",
            ],
          },
        },
      }),
    };

    const gateway = {
      submit: vi
        .fn()
        .mockResolvedValueOnce({
          success: false,
          requestId: "patch-request",
          runtime: "TermuxRuntime",
          error:
            "AUTHORIZATION_REQUIRE_APPROVAL: Action requires explicit approval",
          approvalRequired: true,
          approvalToken: PATCH_TOKEN,
          durationMs: 0,
        })
        .mockResolvedValueOnce({
          success: false,
          requestId: "verify-request",
          runtime: "TermuxRuntime",
          error:
            "AUTHORIZATION_REQUIRE_APPROVAL: Action requires explicit approval",
          approvalRequired: true,
          approvalToken: VERIFY_TOKEN,
          durationMs: 0,
        }),

      submitApproval: vi
        .fn()
        .mockImplementation(
          async (token, decision) => {
            if (
              token === PATCH_TOKEN &&
              decision === "APPROVE"
            ) {
              return {
                success: true,
                requestId: "patch-approved",
                runtime: "TermuxRuntime",
                output: {
                  path: EXAMPLE_SOURCE_PATH,
                  editCount: 1,
                },
                metadata: {
                  capabilityId:
                    PATCH_CAPABILITY,
                },
                durationMs: 1,
              };
            }

            if (
              token === VERIFY_TOKEN &&
              decision === "APPROVE"
            ) {
              return {
                success: true,
                requestId: "verify-approved",
                runtime: "TermuxRuntime",
                output: {
                  passed: true,
                  targetCount: 1,
                },
                metadata: {
                  capabilityId:
                    VERIFY_CAPABILITY,
                },
                durationMs: 1,
              };
            }

            throw new Error(
              "Unexpected approval in Phase 5C test",
            );
          },
        ),
    };

    const service = new AIChatService({
      orchestrator: {
        orchestrate: vi.fn(),
      },
      agentLoop,
      brainGatewayLoader: () => gateway,
    });

    const patchRequest =
      await service.executeProviderFallback(
        [
          {
            role: "user",
            content:
              "Fix src/example.ts and test it",
          },
        ],
        null,
        "Fix src/example.ts and test it",
      );

    expect(gateway.submit).toHaveBeenNthCalledWith(
      1,
      {
        capabilityId: PATCH_CAPABILITY,
        input: {
          path: EXAMPLE_SOURCE_PATH,
          edits: [
            {
              oldText: "old",
              newText: "new",
            },
          ],
        },
      },
    );

    expect(
      patchRequest.execution,
    ).toMatchObject({
      capabilityId: PATCH_CAPABILITY,
      approvalRequired: true,
    });

    expect(patchRequest.provider).toEqual(
      PROVIDER,
    );

    expect(
      patchRequest.message.content,
    ).toContain(PATCH_TOKEN);

    const afterPatchApproval =
      await service.tryApprovalRequest(
        `APPROVE ${PATCH_TOKEN}`,
      );

    expect(
      gateway.submitApproval,
    ).toHaveBeenCalledTimes(1);

    expect(gateway.submit).toHaveBeenNthCalledWith(
      2,
      {
        capabilityId: VERIFY_CAPABILITY,
        input: {
          targets: [
            "src/example.test.ts",
          ],
        },
      },
    );

    expect(
      afterPatchApproval.execution,
    ).toMatchObject({
      capabilityId: VERIFY_CAPABILITY,
      approvalRequired: true,
    });

    expect(
      afterPatchApproval.message.content,
    ).toContain(VERIFY_TOKEN);

    // Verification has only been REQUESTED here.
    // Its runtime execution still needs the second
    // explicit human approval.
    expect(
      gateway.submitApproval,
    ).toHaveBeenCalledTimes(1);

    const afterVerifyApproval =
      await service.tryApprovalRequest(
        `APPROVE ${VERIFY_TOKEN}`,
      );

    expect(
      gateway.submitApproval,
    ).toHaveBeenCalledTimes(2);

    expect(
      afterVerifyApproval.message.content,
    ).toBeTruthy();
  });
});
