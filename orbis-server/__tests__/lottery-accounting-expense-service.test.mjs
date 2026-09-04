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
      scheduleType: "MONTHLY",
      recurringStartsAt: new Date("2026-09-03T00:00:00.000Z"),
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
          scheduleType: "MONTHLY",
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
        scheduleType: "MONTHLY",
        recurringStartsAt: expect.any(Date),
        note: "Monthly",
        status: "ACTIVE",
      },
    });
  });
  it("materializes a monthly due and accepts a partial payment against it", async () => {
    const now = new Date("2026-09-04T04:00:00.000Z");
    const profile = {
      id: "profile-monthly",
      organizationId: "org-1",
      categoryId: "home",
      name: "Deepa",
      usualAmountPaise: 1_800_000n,
      scheduleType: "MONTHLY",
      recurringStartsAt: new Date("2026-09-01T00:00:00.000Z"),
      note: null,
      status: "ACTIVE",
    };
    const bills = [];
    const payments = [];
    const client = {
      foundationAccountingExpenseProfile: {
        findFirst: vi.fn().mockResolvedValue(profile),
        findMany: vi.fn().mockResolvedValue([profile]),
      },
      foundationAccountingExpenseBill: {
        findMany: vi.fn().mockImplementation(async () => [...bills]),
        create: vi.fn().mockImplementation(async ({ data }) => {
          const row = { id: "bill-monthly", createdAt: now, ...data };
          bills.push(row);
          return row;
        }),
      },
      foundationAccountingExpensePayment: {
        findMany: vi.fn().mockImplementation(async () => [...payments]),
        create: vi.fn().mockImplementation(async ({ data }) => {
          const row = { id: "expense-payment-1", createdAt: now, ...data };
          payments.push(row);
          return row;
        }),
      },
      foundationLotteryPayment: {
        findMany: vi.fn().mockResolvedValue([
          {
            direction: "RECEIPT",
            methodSplit: { cashPaise: "1800000", bankPaise: "0" },
            occurredAt: now,
            status: "POSTED",
          },
        ]),
      },
      foundationLotteryDocumentSequence: {
        upsert: vi.fn().mockResolvedValue({ nextValue: 2 }),
      },
      foundationLotteryLedgerEntry: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      foundationLotteryAuditEvent: {
        create: vi.fn().mockResolvedValue({ id: "audit-monthly" }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(client)),
    };

    const service = createLotteryAccountingService({
      prisma,
      now: () => now,
    });
    const payment = await service.recordExpensePayment(
      {
        organizationId: "org-1",
        profileId: profile.id,
        occurredAt: "2026-09-04T04:00:00.000Z",
        totalAmountPaise: "100000",
        cashPaise: "100000",
        bankPaise: "0",
      },
      "admin-1",
    );

    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({
      profileId: profile.id,
      amountPaise: 1_800_000n,
      billingMonth: "2026-09",
    });
    expect(payment).toMatchObject({
      profileId: profile.id,
      totalAmountPaise: "100000",
    });
  });

});
