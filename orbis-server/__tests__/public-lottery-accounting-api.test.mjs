// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createPublicLotteryAccountingRouter,
} = require("../public-lottery-accounting-api.cjs");
const INTERNAL_ADMIN_ID = "internal-admin";

function prismaMock() {
  return {
    foundationAccountingOrganizationMembership: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

function serviceMock() {
  return {
    getWorkspace: vi.fn().mockResolvedValue({
      organization: { id: "org-1", name: "Owned Org" },
      sales: [{ id: "sale-1", createdByAdminId: INTERNAL_ADMIN_ID }],
      auditEvents: [{ id: "audit-1", actorAdminId: INTERNAL_ADMIN_ID }],
    }),
    getVerifiedSummary: vi
      .fn()
      .mockResolvedValue({ verified: true, organizationId: "org-1" }),
    analyzeVerifiedAccounting: vi.fn().mockResolvedValue({
      summary: { verified: true, organizationId: "org-1" },
      insights: [],
    }),
  };
}

function appWith(
  prisma,
  service,
  authMiddleware = (req, _res, next) => {
    req.publicUser = { id: "user-1", email: null };
    next();
  },
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/lottery",
    createPublicLotteryAccountingRouter({
      prisma,
      service,
      authMiddleware,
    }),
  );
  return app;
}

function membership(organizationId, status = "ACTIVE") {
  return {
    id: `membership-${organizationId}`,
    userId: "user-1",
    organizationId,
    role: "OWNER",
    status: "ACTIVE",
    createdAt: new Date("2026-09-07T00:00:00.000Z"),
    organization: {
      id: organizationId,
      name: `${organizationId} name`,
      status,
      tdsRateBps: 200,
      userLedgerStorage: "CLOUD",
    },
  };
}

describe("Lottery Accounting Public tenant API", () => {
  it("keeps every public read behind authenticated-user middleware", async () => {
    const prisma = prismaMock();
    const service = serviceMock();
    const app = appWith(prisma, service, (_req, res) =>
      res.status(401).json({ success: false }),
    );

    await request(app).get("/lottery/organizations").expect(401);
    await request(app)
      .get("/lottery/workspace?organizationId=org-1")
      .expect(401);
    await request(app)
      .get("/lottery/summary?organizationId=org-1")
      .expect(401);
    await request(app)
      .get("/lottery/analysis?organizationId=org-1")
      .expect(401);

    expect(
      prisma.foundationAccountingOrganizationMembership.findMany,
    ).not.toHaveBeenCalled();
    expect(service.getWorkspace).not.toHaveBeenCalled();
  });

  it("returns only active organizations attached to the authenticated user", async () => {
    const prisma = prismaMock();
    const service = serviceMock();
    prisma.foundationAccountingOrganizationMembership.findMany.mockResolvedValue(
      [membership("org-1"), membership("org-disabled", "DISABLED")],
    );

    const response = await request(appWith(prisma, service))
      .get("/lottery/organizations")
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.organizations).toEqual([
      expect.objectContaining({ id: "org-1" }),
    ]);
    expect(response.body.organizations).toHaveLength(1);
  });

  it("fails closed before service access when membership is missing", async () => {
    const prisma = prismaMock();
    const service = serviceMock();

    const response = await request(appWith(prisma, service))
      .get("/lottery/workspace?organizationId=other-org")
      .expect(404);

    expect(response.body.error.code).toBe("ORGANIZATION_NOT_FOUND");
    expect(service.getWorkspace).not.toHaveBeenCalled();
  });

  it("forces tenant scope, disables recurring writes and strips internal actor ids", async () => {
    const prisma = prismaMock();
    const service = serviceMock();
    prisma.foundationAccountingOrganizationMembership.findFirst.mockResolvedValue(
      membership("org-1"),
    );

    const response = await request(appWith(prisma, service))
      .get("/lottery/workspace?organizationId=org-1")
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(service.getWorkspace).toHaveBeenCalledWith(
      { organizationId: "org-1" },
      { materializeRecurringExpenses: false },
    );
    expect(JSON.stringify(response.body)).not.toContain(INTERNAL_ADMIN_ID);
    expect(response.body.workspace.sales[0]).not.toHaveProperty(
      "createdByAdminId",
    );
    expect(response.body.workspace.auditEvents[0]).not.toHaveProperty(
      "actorAdminId",
    );
  });

  it("scopes verified summary and Accounting AI analysis to the membership", async () => {
    const prisma = prismaMock();
    const service = serviceMock();
    prisma.foundationAccountingOrganizationMembership.findFirst.mockResolvedValue(
      membership("org-1"),
    );

    await request(appWith(prisma, service))
      .get(
        "/lottery/summary?organizationId=org-1&from=2026-09-01&to=2026-09-07",
      )
      .expect(200);
    await request(appWith(prisma, service))
      .get("/lottery/analysis?organizationId=org-1")
      .expect(200);

    expect(service.getVerifiedSummary).toHaveBeenCalledWith({
      organizationId: "org-1",
      from: "2026-09-01",
      to: "2026-09-07",
    });
    expect(service.analyzeVerifiedAccounting).toHaveBeenCalledWith({
      organizationId: "org-1",
      from: undefined,
      to: undefined,
    });
  });

  it("does not expose public Accounting mutation routes", async () => {
    const prisma = prismaMock();
    const service = serviceMock();

    await request(appWith(prisma, service))
      .post("/lottery/sales")
      .send({ organizationId: "org-1" })
      .expect(404);
  });
});
