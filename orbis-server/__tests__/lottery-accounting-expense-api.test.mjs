// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createLotteryAccountingRouter,
} = require("../lottery-accounting-api.cjs");

function appWith(service) {
  const app = express();
  app.use(express.json());
  app.use(
    "/lottery",
    createLotteryAccountingRouter({
      service,
      authMiddleware: (req, _res, next) => {
        req.adminUser = { id: "admin-1" };
        next();
      },
    }),
  );
  return app;
}

describe("Lottery Accounting expense/customer Admin routes", () => {
  it("routes additive masters, expense books and customer bill writes with the Admin id", async () => {
    const service = {
      createExpenseCategory: vi.fn().mockResolvedValue({ id: "category-1" }),
      updateExpenseCategory: vi.fn().mockResolvedValue({ id: "category-1" }),
      createExpenseProfile: vi.fn().mockResolvedValue({ id: "profile-1" }),
      updateExpenseProfile: vi.fn().mockResolvedValue({ id: "profile-1" }),
      recordExpenseBill: vi.fn().mockResolvedValue({ id: "bill-1" }),
      recordExpensePayment: vi.fn().mockResolvedValue({ id: "expense-pay-1" }),
      recordCustomerBill: vi.fn().mockResolvedValue({
        bill: { id: "customer-bill-1" },
        payment: null,
      }),
    };
    const app = appWith(service);

    await request(app)
      .post("/lottery/expenses/categories")
      .send({ organizationId: "org-1", name: "Salary" })
      .expect(201);
    expect(service.createExpenseCategory).toHaveBeenCalledWith(
      { organizationId: "org-1", name: "Salary" },
      "admin-1",
    );

    await request(app)
      .patch("/lottery/expenses/categories/category-1")
      .send({ organizationId: "org-1", name: "Staff Salary" })
      .expect(200);
    expect(service.updateExpenseCategory).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        name: "Staff Salary",
        categoryId: "category-1",
      },
      "admin-1",
    );

    await request(app)
      .post("/lottery/expenses/profiles")
      .send({
        organizationId: "org-1",
        categoryId: "category-1",
        name: "Raju",
      })
      .expect(201);
    expect(service.createExpenseProfile).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        categoryId: "category-1",
        name: "Raju",
      },
      "admin-1",
    );

    await request(app)
      .patch("/lottery/expenses/profiles/profile-1")
      .send({
        organizationId: "org-1",
        categoryId: "category-1",
        name: "Raju Kumar",
      })
      .expect(200);
    expect(service.updateExpenseProfile).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        categoryId: "category-1",
        name: "Raju Kumar",
        profileId: "profile-1",
      },
      "admin-1",
    );

    await request(app)
      .post("/lottery/expenses/bills")
      .send({
        organizationId: "org-1",
        profileId: "profile-1",
        amountPaise: "720000",
      })
      .expect(201);
    expect(service.recordExpenseBill).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        profileId: "profile-1",
        amountPaise: "720000",
      },
      "admin-1",
    );

    await request(app)
      .post("/lottery/expenses/payments")
      .send({
        organizationId: "org-1",
        profileId: "profile-1",
        totalAmountPaise: "720000",
        cashPaise: "200000",
        bankPaise: "520000",
      })
      .expect(201);
    expect(service.recordExpensePayment).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        profileId: "profile-1",
        totalAmountPaise: "720000",
        cashPaise: "200000",
        bankPaise: "520000",
      },
      "admin-1",
    );

    await request(app)
      .post("/lottery/customer-bills")
      .send({
        organizationId: "org-1",
        partyId: "customer-1",
        quantity: "10",
        unitRatePaise: "1000",
      })
      .expect(201);
    expect(service.recordCustomerBill).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        partyId: "customer-1",
        quantity: "10",
        unitRatePaise: "1000",
      },
      "admin-1",
    );
  });

  it("keeps every new write behind the supplied Admin middleware", async () => {
    const service = {
      createExpenseCategory: vi.fn(),
      updateExpenseCategory: vi.fn(),
      createExpenseProfile: vi.fn(),
      updateExpenseProfile: vi.fn(),
      recordExpenseBill: vi.fn(),
      recordExpensePayment: vi.fn(),
      recordCustomerBill: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    app.use(
      "/lottery",
      createLotteryAccountingRouter({
        service,
        authMiddleware: (_req, res) =>
          res.status(401).json({ success: false }),
      }),
    );

    await request(app)
      .post("/lottery/expenses/categories")
      .send({})
      .expect(401);
    await request(app).post("/lottery/customer-bills").send({}).expect(401);
    expect(service.createExpenseCategory).not.toHaveBeenCalled();
    expect(service.recordCustomerBill).not.toHaveBeenCalled();
  });
});
