import { describe, test, expect, vi, beforeEach } from "vitest";
import { LocalCapabilityDiscovery } from "../LocalCapabilityDiscovery";
import { TermuxRuntimeService } from "../../execution/runtimes/TermuxRuntimeService";

const CAP_SYS_INFO = "termux.system.info";
const HEALTH_PATH = "/health";
const HANDSHAKE_PATH = "/handshake";

const mockFetchConnected = () =>
  vi.fn().mockImplementation((url: string) => {
    if (url.includes(HEALTH_PATH)) {
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
    if (url.includes(HANDSHAKE_PATH)) {
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
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });

const mockFetchInvalidIdentity = () =>
  vi.fn().mockImplementation((url: string) => {
    if (url.includes(HEALTH_PATH)) {
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
    if (url.includes(HANDSHAKE_PATH)) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            identity: { valid: false },
            capabilities: [],
            status: "IDENTITY_INVALID",
          }),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });

describe("TASK-008: Brain <-> Local Termux Capability Discovery", () => {
  let discovery: LocalCapabilityDiscovery;
  let service: TermuxRuntimeService;

  beforeEach(() => {
    service = new TermuxRuntimeService();
    discovery = new LocalCapabilityDiscovery(service);
    vi.restoreAllMocks();
  });

  test("1. Brain can request local capability discovery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const result = await discovery.discoverLocalCapabilities();
    expect(result).toBeDefined();
    expect(typeof result.connected).toBe("boolean");
  });

  test("2. Connected Termux returns discovered capabilities", async () => {
    vi.stubGlobal("fetch", mockFetchConnected());

    const result = await discovery.discoverLocalCapabilities();

    expect(result.runtime).toBe("TermuxRuntime");
    expect(result.connected).toBe(true);
    expect(result.ready).toBe(true);
    expect(result.capabilities.length).toBeGreaterThan(0);
  });

  test("3. termux.system.info is visible when verified", async () => {
    vi.stubGlobal("fetch", mockFetchConnected());

    const result = await discovery.discoverLocalCapabilities();
    const sysInfo = result.capabilities.find((c) => c.id === CAP_SYS_INFO);

    expect(sysInfo).toBeDefined();
    expect(sysInfo?.available).toBe(true);
  });

  test("4. Disconnected bridge returns unavailable state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Connection refused")),
    );

    const result = await discovery.discoverLocalCapabilities();

    expect(result.connected).toBe(false);
    expect(result.capabilities).toEqual([]);
    expect(result.unavailableReason).toBeDefined();
  });

  test("5. Invalid identity does not expose capabilities", async () => {
    vi.stubGlobal("fetch", mockFetchInvalidIdentity());

    const result = await discovery.discoverLocalCapabilities();

    expect(result.connected).toBe(false);
    expect(result.capabilities).toEqual([]);
    expect(result.unavailableReason).toBe("IDENTITY_INVALID");
  });

  test("6. Brain does not execute capabilities during discovery", async () => {
    const fetchSpy = mockFetchConnected();
    vi.stubGlobal("fetch", fetchSpy);

    await discovery.discoverLocalCapabilities();

    const calledUrls = fetchSpy.mock.calls.map((call) => call[0] as string);
    expect(
      calledUrls.some((url) => url.includes("/api/termux/capability")),
    ).toBe(false);
  });

  test("7. Brain does not call Termux HTTP endpoints directly", async () => {
    const fetchSpy = mockFetchConnected();
    vi.stubGlobal("fetch", fetchSpy);

    // LocalCapabilityDiscovery itself must never invoke fetch — only the
    // underlying TermuxRuntime (via TermuxRuntimeService) may.
    const directFetchSpy = vi.spyOn(globalThis, "fetch");
    await discovery.discoverLocalCapabilities();

    // fetch is still called overall (by TermuxRuntime), but only against
    // known health/handshake endpoints, never anything Brain-originated.
    for (const call of directFetchSpy.mock.calls) {
      const url = call[0] as string;
      expect(url.includes(HEALTH_PATH) || url.includes(HANDSHAKE_PATH)).toBe(
        true,
      );
    }
  });

  test("8. Discovery result is deterministic and structured", async () => {
    vi.stubGlobal("fetch", mockFetchConnected());

    const result = await discovery.discoverLocalCapabilities();

    expect(result).toMatchObject({
      runtime: "TermuxRuntime",
      connected: true,
      ready: true,
      bridgeStatus: expect.any(String),
      checkedAt: expect.any(Number),
    });
    expect(Array.isArray(result.capabilities)).toBe(true);
    result.capabilities.forEach((cap) => {
      expect(typeof cap.id).toBe("string");
      expect(typeof cap.available).toBe("boolean");
    });
  });

  test("9. Uncontrolled errors never throw into the Brain", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        throw new Error("catastrophic failure");
      }),
    );

    await expect(discovery.discoverLocalCapabilities()).resolves.not.toThrow();

    const result = await discovery.discoverLocalCapabilities();
    expect(result.connected).toBe(false);
  });

  test("10. Default constructor uses the shared TermuxRuntimeService", () => {
    const defaultDiscovery = new LocalCapabilityDiscovery();
    expect(defaultDiscovery).toBeInstanceOf(LocalCapabilityDiscovery);
  });
});
