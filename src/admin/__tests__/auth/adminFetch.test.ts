import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("../../../core/supabase/client", () => ({
  supabase: { auth: { getSession } },
}));

import {
  AdminFetchError,
  authenticatedAdminFetch,
  checkAdminAccess,
  readAdminJson,
} from "../../auth/adminFetch";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  getSession.mockReset();
});

describe("authenticatedAdminFetch", () => {
  it("accepts only the exact backend-confirmed Admin access contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true, role: "ADMIN" }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true, role: "USER" }), {
            status: 200,
          }),
        ),
    );

    await expect(checkAdminAccess("verified-token")).resolves.toBe("ADMIN");
    await expect(checkAdminAccess("verified-token")).resolves.toBe(
      "UNAVAILABLE",
    );
  });

  it("distinguishes denied and invalid sessions while failures stay closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ code: "EMAIL_UNVERIFIED" }), {
            status: 403,
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ code: "ADMIN_AUTH_CONFIGURATION_MISSING" }),
            { status: 503 },
          ),
        )
        .mockRejectedValueOnce(new Error("provider detail")),
    );

    await expect(checkAdminAccess("unverified-token")).resolves.toBe(
      "EMAIL_UNVERIFIED",
    );
    await expect(checkAdminAccess("non-admin-token")).resolves.toBe(
      "ACCESS_DENIED",
    );
    await expect(checkAdminAccess("expired-token")).resolves.toBe(
      "INVALID_SESSION",
    );
    await expect(checkAdminAccess("missing-config-token")).resolves.toBe(
      "CONFIGURATION_MISSING",
    );
    await expect(checkAdminAccess("unavailable-token")).resolves.toBe(
      "UNAVAILABLE",
    );
    await expect(checkAdminAccess("")).resolves.toBe("INVALID_SESSION");
  });

  it("obtains the live Supabase session and sends its Bearer token", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "verified-session-token" } },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await authenticatedAdminFetch("/api/system/tree", {
      headers: { Accept: "application/json" },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer verified-session-token");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("does not call the backend without a real session", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(authenticatedAdminFetch("/api/system/tree")).rejects.toEqual(
      expect.any(AdminFetchError),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns safe server messages and rejects invalid response bodies", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: "Admin access required" }), {
            status: 403,
          }),
        )
        .mockResolvedValueOnce(new Response("not-json", { status: 502 })),
    );

    await expect(readAdminJson("/api/system/status")).rejects.toThrow(
      "Admin access required",
    );
    await expect(readAdminJson("/api/system/status")).rejects.toThrow(
      "invalid response",
    );
  });
});
