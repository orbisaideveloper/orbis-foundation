import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticatedAdminFetch = vi.hoisted(() => vi.fn());

vi.mock("../../auth/adminFetch", () => ({ authenticatedAdminFetch }));

import { lotteryAccountingClient } from "../lotteryAccountingClient";

describe("lotteryAccountingClient", () => {
  beforeEach(() => authenticatedAdminFetch.mockReset());

  it("uses authenticated Admin routes for private workspace reads and writes", async () => {
    authenticatedAdminFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ organizations: [{ id: "org-1" }] })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ workspace: { organization: { id: "org-1" } } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ calculated: {}, ledger: [] })),
      );

    await expect(lotteryAccountingClient.listOrganizations()).resolves.toEqual([
      { id: "org-1" },
    ]);
    await expect(
      lotteryAccountingClient.loadWorkspace("org 1"),
    ).resolves.toEqual({
      organization: { id: "org-1" },
    });
    await lotteryAccountingClient.previewSale({ dispatchQuantity: 1 });
    authenticatedAdminFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ organization: { id: "org-1" } })),
    );
    await lotteryAccountingClient.updateOrganizationTdsRate({
      organizationId: "org-1",
      tdsRateBps: 200,
    });

    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      1,
      "/api/admin/models/orbis-accounting-ai/modules/lottery/organizations",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      2,
      "/api/admin/models/orbis-accounting-ai/modules/lottery/workspace?organizationId=org%201",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      3,
      "/api/admin/models/orbis-accounting-ai/modules/lottery/sales/preview",
      expect.objectContaining({
        method: "POST",
        body: '{"dispatchQuantity":1}',
      }),
    );
    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      4,
      "/api/admin/models/orbis-accounting-ai/modules/lottery/settings/tds-rate",
      expect.objectContaining({
        method: "PATCH",
        body: '{"organizationId":"org-1","tdsRateBps":200}',
      }),
    );
  });

  it("does not expose server failure details", async () => {
    authenticatedAdminFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "PARTY_NOT_FOUND", detail: "private" },
        }),
        { status: 404 },
      ),
    );
    await expect(lotteryAccountingClient.createParty({})).rejects.toThrow(
      "PARTY NOT FOUND",
    );
  });
});
