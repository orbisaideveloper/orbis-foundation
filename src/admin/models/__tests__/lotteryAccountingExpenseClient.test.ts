import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticatedAdminFetch = vi.hoisted(() => vi.fn());
const EXPENSE_CATEGORY_ID = "category-1";

vi.mock("../../auth/adminFetch", () => ({ authenticatedAdminFetch }));

import { lotteryAccountingClient } from "../lotteryAccountingClient";

describe("lotteryAccountingClient expense/customer additions", () => {
  beforeEach(() => authenticatedAdminFetch.mockReset());

  it("uses private Admin routes for expense master and customer bill writes", async () => {
    authenticatedAdminFetch.mockImplementation(async () =>
      new Response(JSON.stringify({ success: true })),
    );

    await lotteryAccountingClient.createExpenseCategory({
      organizationId: "org-1",
      name: "Salary",
    });
    await lotteryAccountingClient.updateExpenseCategory(EXPENSE_CATEGORY_ID, {
      organizationId: "org-1",
      name: "Staff Salary",
    });
    await lotteryAccountingClient.createExpenseProfile({
      organizationId: "org-1",
      categoryId: EXPENSE_CATEGORY_ID,
      name: "Raju",
    });
    await lotteryAccountingClient.updateExpenseProfile("profile-1", {
      organizationId: "org-1",
      categoryId: EXPENSE_CATEGORY_ID,
      name: "Raju Kumar",
    });
    await lotteryAccountingClient.recordExpenseBill({
      organizationId: "org-1",
      profileId: "profile-1",
      amountPaise: "720000",
    });
    await lotteryAccountingClient.recordExpensePayment({
      organizationId: "org-1",
      profileId: "profile-1",
      totalAmountPaise: "720000",
      cashPaise: "200000",
      bankPaise: "520000",
    });
    await lotteryAccountingClient.recordCustomerBill({
      organizationId: "org-1",
      partyId: "customer-1",
      quantity: "10",
      unitRatePaise: "1000",
    });

    const base =
      "/api/admin/models/orbis-accounting-ai/modules/lottery";

    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      1,
      `${base}/expenses/categories`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      2,
      `${base}/expenses/categories/category-1`,
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      3,
      `${base}/expenses/profiles`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      4,
      `${base}/expenses/profiles/profile-1`,
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      5,
      `${base}/expenses/bills`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      6,
      `${base}/expenses/payments`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(authenticatedAdminFetch).toHaveBeenNthCalledWith(
      7,
      `${base}/customer-bills`,
      expect.objectContaining({ method: "POST" }),
    );
  });
});
