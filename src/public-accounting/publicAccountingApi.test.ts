import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensurePublicAccount,
  getPublishedAccountingModel,
  getPublicAccount,
  getPublicOrganizations,
  PublicAccountingApiError,
} from "./publicAccountingApi";

const ACCESS_TOKEN = "access-token";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public Accounting API client", () => {
  it("uses a bearer token and posts the Foundation profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        account: { id: "account-1" },
        organization: { id: "org-1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await ensurePublicAccount(ACCESS_TOKEN, {
      firstName: "Ajay",
      lastName: "Saha",
      email: "ajay@example.com",
      phone: "+919999999999",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/accounting/lottery/account",
      expect.objectContaining({ method: "POST" }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toMatchObject({
      firstName: "Ajay",
      lastName: "Saha",
      email: "ajay@example.com",
      phone: "+919999999999",
    });
  });

  it("maps missing account and unpublished model to null", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(404, {
          error: { code: "FOUNDATION_ACCOUNT_NOT_FOUND" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(404, {
          error: { code: "ACCOUNTING_MODEL_NOT_PUBLISHED" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicAccount(ACCESS_TOKEN)).resolves.toBeNull();
    await expect(getPublishedAccountingModel(ACCESS_TOKEN)).resolves.toBeNull();
  });

  it("returns organizations from the authenticated public endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          organizations: [{ id: "org-1", name: "Ajay Saha" }],
        }),
      ),
    );

    await expect(getPublicOrganizations(ACCESS_TOKEN)).resolves.toEqual([
      expect.objectContaining({ id: "org-1", name: "Ajay Saha" }),
    ]);
  });

  it("preserves sanitized server error codes for the UI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(503, {
          error: { code: "ACCOUNTING_MODEL_UNAVAILABLE" },
        }),
      ),
    );

    await expect(getPublishedAccountingModel(ACCESS_TOKEN)).rejects.toMatchObject<
      Partial<PublicAccountingApiError>
    >({
      status: 503,
      code: "ACCOUNTING_MODEL_UNAVAILABLE",
    });
  });
});
