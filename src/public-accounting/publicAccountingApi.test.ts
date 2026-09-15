import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPublicLotteryAccountingClient,
  createPublicLotteryAccountingReadClient,
  ensurePublicAccount,
  getPublishedAccountingModel,
  getPublicAccount,
  getPublicOrganizations,
  PublicAccountingApiError,
} from "./publicAccountingApi";

const ACCESS_TOKEN = "access-token";
const ORGANIZATION_NAME = "Test Business";

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


  it("creates a bearer-authenticated write client for the signed-in public workspace", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        organization: {
          id: "org-1",
          name: ORGANIZATION_NAME,
          tdsRateBps: 200,
          userLedgerStorage: "CLOUD",
          status: "ACTIVE",
          createdAt: "2026-09-15T00:00:00.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createPublicLotteryAccountingClient(ACCESS_TOKEN);
    await expect(
      client.createOrganization({ name: ORGANIZATION_NAME }),
    ).resolves.toMatchObject({ id: "org-1", name: ORGANIZATION_NAME });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/accounting/lottery/organizations",
      expect.objectContaining({ method: "POST" }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(JSON.parse(String(init.body))).toEqual({ name: ORGANIZATION_NAME });
  });

  it("creates a bearer-authenticated read client for the real public workspace", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          organizations: [
            {
              id: "org-1",
              name: "Ajay Saha",
              tdsRateBps: 200,
              userLedgerStorage: "CLOUD",
              status: "ACTIVE",
              createdAt: "2026-09-14T00:00:00.000Z",
              updatedAt: "2026-09-14T00:00:00.000Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { workspace: { organizations: [] } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = createPublicLotteryAccountingReadClient(ACCESS_TOKEN);
    await expect(client.listOrganizations()).resolves.toEqual([
      expect.objectContaining({ id: "org-1" }),
    ]);
    await expect(client.loadWorkspace("org-1")).resolves.toEqual({
      organizations: [],
    });

    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/accounting/lottery/workspace?organizationId=org-1",
    );
    const headers = fetchMock.mock.calls[1][1].headers as Headers;
    expect(headers.get("Authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
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
