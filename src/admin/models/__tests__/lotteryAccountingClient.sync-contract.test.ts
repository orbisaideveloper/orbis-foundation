import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticatedAdminFetch } = vi.hoisted(() => ({
  authenticatedAdminFetch: vi.fn(),
}));

vi.mock("../../auth/adminFetch", () => ({ authenticatedAdminFetch }));

import {
  LotteryAccountingRequestError,
  lotteryAccountingClient,
} from "../lotteryAccountingClient";

describe("lotteryAccountingClient seller sync contract", () => {
  beforeEach(() => {
    authenticatedAdminFetch.mockReset();
  });

  it("preserves the server acknowledgement version on a saved seller draft", async () => {
    authenticatedAdminFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          sale: {
            id: "sale-1",
            reference: "SAL-1",
            status: "DRAFT",
            syncVersion: 4,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      lotteryAccountingClient.updateDailySellerDraft("sale-1", {
        organizationId: "org-1",
        operationId: "op-1",
        expectedVersion: 3,
      }),
    ).resolves.toEqual({
      id: "sale-1",
      reference: "SAL-1",
      status: "DRAFT",
      syncVersion: 4,
    });
  });

  it("keeps a safe conflict code and currentVersion for reconciliation", async () => {
    authenticatedAdminFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            category: "lottery_accounting",
            code: "SELLER_DRAFT_CONFLICT",
            field: "expectedVersion",
            currentVersion: 7,
          },
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    const error = await lotteryAccountingClient
      .updateDailySellerDraft("sale-1", {
        organizationId: "org-1",
        operationId: "op-2",
        expectedVersion: 6,
      })
      .catch((cause) => cause);

    expect(error).toBeInstanceOf(LotteryAccountingRequestError);
    expect(error).toMatchObject({
      code: "SELLER_DRAFT_CONFLICT",
      currentVersion: 7,
      message: "SELLER DRAFT CONFLICT",
    });
  });
});
