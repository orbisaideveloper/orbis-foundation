// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createLotteryAccountingService,
} = require("../lottery-accounting-service.cjs");

describe("Lottery Accounting additive expense service", () => {
  it("creates an Expense Category without touching existing Lottery arithmetic", async () => {
    const organization = {
      id: "org-1",
      status: "ACTIVE",
      tdsRateBps: 200,
    };
    const category = {
      id: "category-1",
      organizationId: "org-1",
      name: "Salary",
      status: "ACTIVE",
      createdAt: new Date("2026-09-03T00:00:00.000Z"),
      updatedAt: new Date("2026-09-03T00:00:00.000Z"),
    };

    const client = {
      foundationAccountingOrganization: {
        findFirst: vi.fn().mockResolvedValue(organization),
      },
      foundationAccountingExpenseCategory: {
        create: vi.fn().mockResolvedValue(category),
      },
      foundationLotteryAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(client)),
    };

    const service = createLotteryAccountingService({ prisma });
    await expect(
      service.createExpenseCategory(
        { organizationId: "org-1", name: "Salary" },
        "admin-1",
      ),
    ).resolves.toMatchObject({
      id: "category-1",
      organizationId: "org-1",
      name: "Salary",
    });

    expect(client.foundationAccountingExpenseCategory.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        name: "Salary",
        status: "ACTIVE",
      },
    });
    expect(client.foundationLotteryAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        eventType: "EXPENSE_CATEGORY_CREATED",
        entityType: "EXPENSE_CATEGORY",
        entityId: "category-1",
        actorAdminId: "admin-1",
      }),
    });
  });

  it("creates an Expense Profile beneath an existing category", async () => {
    const category = {
      id: "category-1",
      organizationId: "org-1",
      name: "Salary",
      status: "ACTIVE",
    };
    const profile = {
      id: "profile-1",
      organizationId: "org-1",
      categoryId: "category-1",
      name: "Raju",
      usualAmountPaise: 720000n,
      note: "Monthly",
      status: "ACTIVE",
      createdAt: new Date("2026-09-03T00:00:00.000Z"),
      updatedAt: new Date("2026-09-03T00:00:00.000Z"),
    };

    const client = {
      foundationAccountingExpenseCategory: {
        findFirst: vi.fn().mockResolvedValue(category),
      },
      foundationAccountingExpenseProfile: {
        create: vi.fn().mockResolvedValue(profile),
      },
      foundationLotteryAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: "audit-2" }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(client)),
    };

    const service = createLotteryAccountingService({ prisma });
    await expect(
      service.createExpenseProfile(
        {
          organizationId: "org-1",
          categoryId: "category-1",
          name: "Raju",
          usualAmountPaise: "720000",
          note: "Monthly",
        },
        "admin-1",
      ),
    ).resolves.toMatchObject({
      id: "profile-1",
      name: "Raju",
      usualAmountPaise: "720000",
    });

    expect(client.foundationAccountingExpenseProfile.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        categoryId: "category-1",
        name: "Raju",
        usualAmountPaise: 720000n,
        note: "Monthly",
        status: "ACTIVE",
      },
    });
  });
});
