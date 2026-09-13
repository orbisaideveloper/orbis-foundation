// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createPublicLotteryAccountingRouter,
} = require("../public-lottery-accounting-api.cjs");

const MODEL_ROUTE = "/lottery/model";

function prismaMock() {
  return {
    foundationAccountingOrganizationMembership: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

function accountingServiceMock() {
  return {
    getWorkspace: vi.fn(),
    getVerifiedSummary: vi.fn(),
    analyzeVerifiedAccounting: vi.fn(),
  };
}

function identityServiceMock() {
  return {
    getGlobalIdentity: vi.fn(),
    ensureGlobalIdentity: vi.fn(),
    listClaimCandidates: vi.fn(),
    claimParty: vi.fn(),
    listRelationships: vi.fn(),
  };
}

function publishedModel() {
  return {
    slug: "orbis-accounting-ai",
    displayName: "ORBiS Accounting AI",
    category: "ACCOUNTING_AI",
    status: "ACTIVE",
    publishedVersion: {
      sequence: 3,
      lifecycle: "PUBLISHED",
      definition: {
        schemaVersion: 2,
        modules: [{ slug: "lottery", name: "Lottery Accounting" }],
      },
      publishedAt: "2026-09-13T12:00:00.000Z",
    },
  };
}

function appWith(
  publicModelService,
  authMiddleware = (req, _res, next) => {
    req.publicUser = { id: "user-1", email: "user@example.test" };
    next();
  },
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/lottery",
    createPublicLotteryAccountingRouter({
      prisma: prismaMock(),
      service: accountingServiceMock(),
      identityService: identityServiceMock(),
      publicModelService,
      authMiddleware,
    }),
  );
  return app;
}

describe("Foundation public Accounting model route", () => {
  it("keeps the published-model resolver behind public authentication", async () => {
    const publicModelService = {
      getPublishedAccountingModel: vi.fn(),
    };
    const app = appWith(publicModelService, (_req, res) =>
      res.status(401).json({ success: false }),
    );

    await request(app).get(MODEL_ROUTE).expect(401);
    expect(publicModelService.getPublishedAccountingModel).not.toHaveBeenCalled();
  });

  it("returns only the published public model with no-store caching", async () => {
    const model = publishedModel();
    const publicModelService = {
      getPublishedAccountingModel: vi.fn().mockResolvedValue(model),
    };

    const response = await request(appWith(publicModelService))
      .get(MODEL_ROUTE)
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({ model });
    expect(JSON.stringify(response.body)).not.toContain("DRAFT");
    expect(JSON.stringify(response.body)).not.toContain("reviewReport");
    expect(JSON.stringify(response.body)).not.toContain("reviewedByAdminId");
  });

  it("fails closed when no Accounting model is published", async () => {
    const publicModelService = {
      getPublishedAccountingModel: vi.fn().mockResolvedValue(null),
    };

    const response = await request(appWith(publicModelService))
      .get(MODEL_ROUTE)
      .expect(404);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      success: false,
      error: {
        category: "foundation_model",
        code: "ACCOUNTING_MODEL_NOT_PUBLISHED",
      },
    });
  });

  it("sanitizes resolver failures without leaking private details", async () => {
    const publicModelService = {
      getPublishedAccountingModel: vi
        .fn()
        .mockRejectedValue(new Error("private database detail")),
    };

    const response = await request(appWith(publicModelService))
      .get(MODEL_ROUTE)
      .expect(503);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.error.code).toBe("ACCOUNTING_MODEL_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("private database detail");
  });
});
