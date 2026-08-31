// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createLotteryAccountingRouter,
} = require("../lottery-accounting-api.cjs");
const SALES_ROUTE = "/lottery/sales";

function appWith(
  service,
  authMiddleware = (req, _res, next) => {
    req.adminUser = { id: "admin-1" };
    next();
  },
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/lottery",
    createLotteryAccountingRouter({ service, authMiddleware }),
  );
  return app;
}

function serviceMock() {
  return {
    createOrganization: vi.fn().mockResolvedValue({ id: "org-1" }),
    listOrganizations: vi.fn().mockResolvedValue([{ id: "org-1" }]),
    createParty: vi.fn().mockResolvedValue({ id: "party-1" }),
    updatePartyProfile: vi.fn().mockResolvedValue({ id: "party-1" }),
    createPeriod: vi.fn().mockResolvedValue({ id: "period-1" }),
    createFinancialYearPeriod: vi.fn().mockResolvedValue({ id: "period-1" }),
    recordStockMovement: vi.fn().mockResolvedValue({ id: "stock-1" }),
    recordSale: vi
      .fn()
      .mockResolvedValue({ sale: { id: "sale-1" }, ledger: [] }),
    createDailySellerDraft: vi
      .fn()
      .mockResolvedValue({ sale: { id: "sale-1", status: "DRAFT" } }),
    updateDailySellerDraft: vi
      .fn()
      .mockResolvedValue({ sale: { id: "sale-1", status: "DRAFT" } }),
    deleteDailySellerDraft: vi.fn().mockResolvedValue({ id: "sale-1" }),
    postDailySellerDraft: vi
      .fn()
      .mockResolvedValue({ sale: { id: "sale-1", status: "POSTED" } }),
    correctPostedSale: vi
      .fn()
      .mockResolvedValue({ draft: { id: "sale-2", status: "DRAFT" } }),
    recordPayment: vi.fn().mockResolvedValue({ payment: { id: "payment-1" } }),
    recordSettlement: vi.fn().mockResolvedValue({ id: "settlement-1" }),
    previewSale: vi.fn().mockReturnValue({ calculated: {}, ledger: [] }),
    getWorkspace: vi.fn().mockResolvedValue({ organization: { id: "org-1" } }),
    getVerifiedSummary: vi.fn().mockResolvedValue({ verified: true }),
    analyzeVerifiedAccounting: vi
      .fn()
      .mockResolvedValue({ summary: { verified: true }, insights: [] }),
  };
}

describe("Lottery Accounting Admin API", () => {
  it("keeps every write and read route behind the supplied Admin middleware", async () => {
    const service = serviceMock();
    const app = appWith(service, (_req, res) =>
      res.status(401).json({ success: false }),
    );
    await request(app).post(SALES_ROUTE).send({}).expect(401);
    await request(app)
      .get("/lottery/analysis?organizationId=org-1")
      .expect(401);
    await request(app).get("/lottery/organizations").expect(401);
    await request(app)
      .get("/lottery/workspace?organizationId=org-1")
      .expect(401);
    await request(app)
      .post("/lottery/sales/preview")
      .send({ dispatchQuantity: 1 })
      .expect(401);
    await request(app)
      .post("/lottery/daily-seller-drafts")
      .send({})
      .expect(401);
    await request(app)
      .post("/lottery/daily-seller-drafts/sale-1/post")
      .send({})
      .expect(401);
    expect(service.recordSale).not.toHaveBeenCalled();
    expect(service.analyzeVerifiedAccounting).not.toHaveBeenCalled();
    expect(service.listOrganizations).not.toHaveBeenCalled();
    expect(service.getWorkspace).not.toHaveBeenCalled();
    expect(service.previewSale).not.toHaveBeenCalled();
    expect(service.createDailySellerDraft).not.toHaveBeenCalled();
  });

  it("exposes stock, sale, payment and settlement writes with the verified Admin id", async () => {
    const service = serviceMock();
    const app = appWith(service);
    await request(app)
      .post("/lottery/organizations")
      .send({ name: "Org" })
      .expect(201);
    await request(app)
      .post("/lottery/parties")
      .send({ name: "Party" })
      .expect(201);
    await request(app)
      .patch("/lottery/parties/party-1/profile")
      .send({ organizationId: "org-1" })
      .expect(200);
    await request(app)
      .post("/lottery/periods")
      .send({ label: "Period" })
      .expect(201);
    await request(app)
      .post("/lottery/periods/financial-year")
      .send({ organizationId: "org-1", financialYearStart: 2026 })
      .expect(201);
    await request(app)
      .post("/lottery/stock-movements")
      .send({ reference: "S" })
      .expect(201);
    await request(app).post(SALES_ROUTE).send({ reference: "A" }).expect(201);
    await request(app)
      .post("/lottery/daily-seller-drafts")
      .send({ organizationId: "org-1" })
      .expect(201);
    await request(app)
      .patch("/lottery/daily-seller-drafts/sale-1")
      .send({ organizationId: "org-1" })
      .expect(200);
    await request(app)
      .post("/lottery/daily-seller-drafts/sale-1/post")
      .send({ organizationId: "org-1" })
      .expect(200);
    await request(app)
      .delete("/lottery/daily-seller-drafts/sale-1")
      .send({ organizationId: "org-1" })
      .expect(200);
    await request(app)
      .post("/lottery/sales/sale-1/correct")
      .send({ organizationId: "org-1" })
      .expect(201);
    await request(app)
      .post("/lottery/payments")
      .send({ reference: "P" })
      .expect(201);
    await request(app)
      .post("/lottery/settlements")
      .send({ amountPaise: 1 })
      .expect(201);
    for (const call of [
      service.createOrganization,
      service.createParty,
      service.updatePartyProfile,
      service.createPeriod,
      service.createFinancialYearPeriod,
      service.recordStockMovement,
      service.recordSale,
      service.createDailySellerDraft,
      service.updateDailySellerDraft,
      service.postDailySellerDraft,
      service.deleteDailySellerDraft,
      service.correctPostedSale,
      service.recordPayment,
      service.recordSettlement,
    ]) {
      expect(call).toHaveBeenCalledWith(expect.any(Object), "admin-1");
    }
  });

  it("returns no-store verified summaries and analysis", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const summary = await request(app)
      .get("/lottery/summary?organizationId=org-1")
      .expect(200);
    const analysis = await request(app)
      .get("/lottery/analysis?organizationId=org-1")
      .expect(200);
    expect(summary.headers["cache-control"]).toBe("no-store");
    expect(analysis.headers["cache-control"]).toBe("no-store");
    expect(service.getVerifiedSummary).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
    );
  });

  it("returns private Admin-only workspace reads and non-persistent sale previews", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const organizations = await request(app)
      .get("/lottery/organizations")
      .expect(200);
    const workspace = await request(app)
      .get("/lottery/workspace?organizationId=org-1")
      .expect(200);
    const preview = await request(app)
      .post("/lottery/sales/preview")
      .send({ dispatchQuantity: 1 })
      .expect(200);

    expect(organizations.headers["cache-control"]).toBe("no-store");
    expect(workspace.headers["cache-control"]).toBe("no-store");
    expect(preview.headers["cache-control"]).toBe("no-store");
    expect(service.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
    );
    expect(service.previewSale).toHaveBeenCalledWith(
      expect.objectContaining({ dispatchQuantity: 1 }),
    );
  });

  it.each([
    ["PARTY_NOT_FOUND", 404],
    ["SETTLEMENT_EXCEEDS_BALANCE", 409],
    ["INVALID_INTEGER", 400],
    ["PRIVATE_DATABASE_DETAIL", 503],
  ])("maps %s to a safe HTTP response", async (code, status) => {
    const service = serviceMock();
    const error = Object.assign(new Error("database detail"), {
      code,
      field: "partyId",
    });
    service.recordSale.mockRejectedValue(error);
    const response = await request(appWith(service))
      .post(SALES_ROUTE)
      .send({})
      .expect(status);
    expect(response.body.error.code).toBe(
      status === 503 ? "LOTTERY_ACCOUNTING_UNAVAILABLE" : code,
    );
    expect(JSON.stringify(response.body)).not.toContain("database detail");
  });
});
