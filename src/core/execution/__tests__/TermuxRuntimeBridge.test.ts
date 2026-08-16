import { describe, test, expect, vi, beforeEach } from "vitest";
import { TermuxRuntime } from "../runtimes/TermuxRuntime";
import { TermuxRuntimeService } from "../runtimes/TermuxRuntimeService";

const CAP_SYS_INFO = "termux.system.info";

describe("TASK-006 & TASK-007: Termux Runtime Bridge & Controlled Execution", () => {
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
                capabilities: [{ id: CAP_SYS_INFO }],
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
    expect(handshake.capabilities).toContain(CAP_SYS_INFO);

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

  test("4. Unsupported capability is rejected cleanly", async () => {
    const result = await runtime.execute({
      requestId: "req-01",
      capability: "unsupported.cap",
      input: {},
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("is not supported");
  });

  test("5. Successful system info capability execution returns structured result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/capability")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                capability: CAP_SYS_INFO,
                runtime: "TermuxRuntime",
                data: {
                  platform: "ANDROID-TERMUX",
                  architecture: "arm64",
                  nodeVersion: "v18.0.0",
                },
              }),
          });
        }
        return Promise.resolve({ ok: true });
      }),
    );

    const result = await runtime.execute({
      requestId: "req-02",
      capability: CAP_SYS_INFO,
      input: {},
    });
    expect(result.success).toBe(true);
    expect(result.requestId).toBe("req-02");
    expect(result.output).toBeDefined();
    expect(result.output?.platform).toBe("ANDROID-TERMUX");
  });

  test("6. TASK-014: defaults to port 3000 when PORT env var is unset", async () => {
    const originalPort = process.env.PORT;
    delete process.env.PORT;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const freshRuntime = new TermuxRuntime();
    await freshRuntime.healthCheck();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/health",
      expect.anything(),
    );

    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }
  });

  test("7. TASK-014: uses process.env.PORT when set, matching bridge.cjs's own derivation", async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = "3002";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          identity: { valid: true },
          capabilities: [],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const freshRuntime = new TermuxRuntime();
    await freshRuntime.performHandshake();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3002/api/termux/handshake",
      expect.anything(),
    );

    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }
  });
});
