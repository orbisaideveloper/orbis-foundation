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
    authenticatedAdminFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sale: { id: "draft-1", reference: "SAL-1", status: "DRAFT" },
        }),
      ),
    );
    await expect(
      lotteryAccountingClient.saveDailySellerDraft({ organizationId: "org-1" }),
    ).resolves.toEqual({ id: "draft-1", reference: "SAL-1", status: "DRAFT" });

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
    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      5,
      "/api/admin/models/orbis-accounting-ai/modules/lottery/daily-seller-drafts",
      expect.objectContaining({
        method: "POST",
        body: '{"organizationId":"org-1"}',
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

  it("uses the private Admin route for the future user storage policy", async () => {
    authenticatedAdminFetch.mockResolvedValue(
      new Response(JSON.stringify({ organization: { id: "org-1" } })),
    );
    await lotteryAccountingClient.updateUserLedgerStorage({
      organizationId: "org-1",
      userLedgerStorage: "DEVICE",
    });
    expect(authenticatedAdminFetch).toHaveBeenCalledWith(
      "/api/admin/models/orbis-accounting-ai/modules/lottery/settings/user-ledger-storage",
      expect.objectContaining({
        method: "PATCH",
        body: '{"organizationId":"org-1","userLedgerStorage":"DEVICE"}',
      }),
    );
  });

  it("saves the simple stockist daily grid through the private Admin API", async () => {
    authenticatedAdminFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          entry: {
            partyId: "stockist-1",
            occurredAt: "2026-09-01T00:00:00.000Z",
          },
        }),
      ),
    );
    await lotteryAccountingClient.saveDailyStockistEntry({
      organizationId: "org-1",
      partyId: "stockist-1",
      purchaseQuantity: "7000",
      morningReturnQuantity: "2000",
    });
    expect(authenticatedAdminFetch).toHaveBeenCalledWith(
      "/api/admin/models/orbis-accounting-ai/modules/lottery/daily-stockist-entries",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"purchaseQuantity":"7000"'),
      }),
    );
  });
});
