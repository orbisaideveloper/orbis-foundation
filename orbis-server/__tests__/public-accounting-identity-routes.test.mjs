// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const VERIFIED_EMAIL = "rahul@example.com";
const {
  createPublicLotteryAccountingRouter,
} = require("../public-lottery-accounting-api.cjs");

describe("Accounting public identity routes", () => {
  it("adds narrow identity/claim routes without opening financial writes", async () => {
    const prisma = {
      foundationAccountingOrganizationMembership: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = {
      getWorkspace: vi.fn(),
      getVerifiedSummary: vi.fn(),
      analyzeVerifiedAccounting: vi.fn(),
    };
    const identityService = {
      getGlobalIdentity: vi
        .fn()
        .mockResolvedValue({ userId: "user-1", orbisId: "ORB-1" }),
      ensureGlobalIdentity: vi
        .fn()
        .mockResolvedValue({ userId: "user-1", orbisId: "ORB-1" }),
      listClaimCandidates: vi.fn().mockResolvedValue([]),
      claimParty: vi.fn().mockResolvedValue({
        identity: { userId: "user-1", orbisId: "ORB-1" },
        relationship: { claimId: "claim-1" },
      }),
      listRelationships: vi.fn().mockResolvedValue({
        identity: { userId: "user-1", orbisId: "ORB-1" },
        relationships: [],
      }),
    };
    const authMiddleware = (req, _res, next) => {
      req.publicUser = { id: "user-1", email: VERIFIED_EMAIL };
      req.publicVerifiedContact = {
        email: VERIFIED_EMAIL,
        emailVerified: true,
        phone: null,
        phoneVerified: false,
      };
      next();
    };
    const app = express();
    app.use(express.json());
    app.use(
      "/lottery",
      createPublicLotteryAccountingRouter({
        prisma,
        service,
        identityService,
        authMiddleware,
      }),
    );

    await request(app).get("/lottery/identity").expect(200);
    await request(app).post("/lottery/identity").expect(201);
    await request(app)
      .get("/lottery/identity/claim-candidates")
      .expect(200);
    await request(app)
      .post("/lottery/identity/claims")
      .send({ partyCode: "party-code-1" })
      .expect(201);
    await request(app)
      .get("/lottery/identity/relationships")
      .expect(200);

    expect(identityService.claimParty).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
        email: VERIFIED_EMAIL,
        emailVerified: true,
      }),
      { partyCode: "party-code-1" },
    );

    await request(app)
      .post("/lottery/sales")
      .send({ organizationId: "org-1" })
      .expect(404);
  });
});
