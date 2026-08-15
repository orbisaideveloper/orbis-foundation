import { describe, test, expect, vi, beforeEach } from "vitest";
import { TermuxRuntime } from "../runtimes/TermuxRuntime";
import { TermuxRuntimeService } from "../runtimes/TermuxRuntimeService";

describe("TASK-006: Termux Runtime Bridge & Capability Handshake", () => {
  let runtime: TermuxRuntime;
  let service: TermuxRuntimeService;

  beforeEach(() => {
    runtime = new TermuxRuntime();
    service = new TermuxRuntimeService();
    vi.restoreAllMocks();
  });

  test("1. Bridge Unreachable handles fetch failure gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Connection refused")),
    );

    const health = await runtime.healthCheck();
    expect(health).toBe(false);

    const handshake = await runtime.performHandshake();
    expect(handshake.reachable).toBe(false);
    expect(handshake.status).toBe("BRIDGE_UNREACHABLE");
  });

  test("2. Valid bridge connectivity and identity handshake success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/health")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ok: true,
                runtime: "TermuxRuntime",
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
                capabilities: [{ id: "termux.system.info" }],
                status: "CAPABILITIES_VERIFIED",
              }),
          });
        }
        return Promise.reject(new Error("Not found"));
      }),
    );

    const health = await runtime.healthCheck();
    expect(health).toBe(true);

    const handshake = await runtime.performHandshake();
    expect(handshake.reachable).toBe(true);
    expect(handshake.identityValid).toBe(true);
    expect(handshake.capabilities).toContain("termux.system.info");

    const status = await service.check();
    expect(status.healthy).toBe(true);
    expect(status.connected).toBe(true);
  });

  test("3. Invalid identity status is caught during handshake", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/handshake")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ok: true,
                identity: { valid: false },
                capabilities: [],
              }),
          });
        }
        return Promise.resolve({ ok: false });
      }),
    );

    const handshake = await runtime.performHandshake();
    expect(handshake.reachable).toBe(true);
    expect(handshake.identityValid).toBe(false);
    expect(handshake.status).toBe("IDENTITY_INVALID");
  });

  test("4. Unrestricted command execution is strictly denied", async () => {
    const result = await runtime.execute({
      requestId: "req-01",
      capability: "raw.shell",
      input: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("restricted under policy");
  });
});
