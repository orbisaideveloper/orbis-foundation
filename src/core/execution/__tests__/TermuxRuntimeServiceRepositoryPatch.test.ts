import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { TermuxRuntime } from "../runtimes/TermuxRuntime";
import { TermuxRuntimeService } from "../runtimes/TermuxRuntimeService";
import { RuntimeRegistry } from "../registry/RuntimeRegistry";
import { RuntimeLifecycleManager } from "../lifecycle/RuntimeLifecycleManager";

const RUNTIME_NAME = "TermuxRuntime";
const CAP_SYSTEM_INFO = "termux.system.info";
const CAP_FILE_READ = "termux.file.read";
const CAP_REPOSITORY_PATCH = "termux.repository.patch";

const PATCH_INPUT = {
  path: "src/example.ts",
  edits: [
    {
      oldText: "value = 1",
      newText: "value = 2",
    },
  ],
};

function stubConnectedFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              runtime: RUNTIME_NAME,
              platform: "android-termux",
            }),
        });
      }

      if (url.includes("/handshake")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              identity: { valid: true },
              capabilities: [
                CAP_SYSTEM_INFO,
                CAP_FILE_READ,
                CAP_REPOSITORY_PATCH,
              ],
              status: "CAPABILITIES_VERIFIED",
            }),
        });
      }

      return Promise.reject(
        new Error(`Unexpected URL in test: ${url}`),
      );
    }),
  );
}

describe("Phase 5A repository patch authorization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("registers repository patch as SENSITIVE and approval-required", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service =
      new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch();
    await service.check();

    const capability =
      registry.getCapability(CAP_REPOSITORY_PATCH);

    expect(capability).toMatchObject({
      id: CAP_REPOSITORY_PATCH,
      riskLevel: "SENSITIVE",
      requiresApproval: true,
      enabled: true,
      runtime: RUNTIME_NAME,
    });
  });

  test("never executes repository patch before explicit approval and preserves structured input after approval", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service =
      new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch();

    const executeSpy = vi
      .spyOn(TermuxRuntime.prototype, "execute")
      .mockResolvedValue({
        success: true,
        requestId: "phase5a-patch-1",
        runtime: RUNTIME_NAME,
        output: {
          path: PATCH_INPUT.path,
          editCount: 1,
          backupCreated: true,
        },
        durationMs: 1,
      });

    const pending = await service.executeCapability({
      requestId: "phase5a-patch-1",
      capability: CAP_REPOSITORY_PATCH,
      input: PATCH_INPUT,
    });

    expect(pending.success).toBe(false);
    expect(pending.approvalRequired).toBe(true);
    expect(typeof pending.approvalToken).toBe("string");
    expect(executeSpy).not.toHaveBeenCalled();

    const approved = await service.resolveApproval(
      pending.approvalToken as string,
      "APPROVE",
    );

    expect(approved.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy.mock.calls[0][0].input).toEqual(
      PATCH_INPUT,
    );
  });
});
