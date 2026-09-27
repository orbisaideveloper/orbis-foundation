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
const CAP_PATCH = "termux.repository.patch";
const CAP_VERIFY = "termux.repository.verify";

const VERIFY_INPUT = {
  targets: [
    "orbis-server/__tests__/RepositoryPatchTool.test.mjs",
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
                CAP_PATCH,
                CAP_VERIFY,
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

describe("Phase 5B repository verify authorization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("registers repository verify as SENSITIVE and approval-required", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service =
      new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch();
    await service.check();

    expect(
      registry.getCapability(CAP_VERIFY),
    ).toMatchObject({
      id: CAP_VERIFY,
      riskLevel: "SENSITIVE",
      requiresApproval: true,
      enabled: true,
      runtime: RUNTIME_NAME,
    });
  });

  test("does not execute verification before explicit approval", async () => {
    const registry = new RuntimeRegistry();
    const lifecycle = new RuntimeLifecycleManager();
    const service =
      new TermuxRuntimeService(registry, lifecycle);

    stubConnectedFetch();

    const executeSpy = vi
      .spyOn(TermuxRuntime.prototype, "execute")
      .mockResolvedValue({
        success: true,
        requestId: "phase5b-verify-1",
        runtime: RUNTIME_NAME,
        output: {
          passed: true,
          exitCode: 0,
          targetCount: 1,
          outputExposed: false,
        },
        durationMs: 1,
      });

    const pending = await service.executeCapability({
      requestId: "phase5b-verify-1",
      capability: CAP_VERIFY,
      input: VERIFY_INPUT,
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
    expect(
      executeSpy.mock.calls[0][0].input,
    ).toEqual(VERIFY_INPUT);
  });
});
