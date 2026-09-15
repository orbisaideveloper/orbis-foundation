// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createPublicLotteryAccountingRouter,
} = require("../public-lottery-accounting-api.cjs");

const USER_ID = "auth-user-1";
const EMAIL = "user@example.test";
const PHONE = "+919876543210";
const LOCAL_ACCOUNT_ID = "foundation-local-user-1";
const ACCOUNT_ROUTE = "/lottery/account";
const ORGANIZATION_NAME = "Ajay Books";

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

function organizationServiceMock() {
  return {
    ensureOwnerOrganization: vi.fn().mockResolvedValue({
      id: "organization-1",
      name: ORGANIZATION_NAME,
      status: "ACTIVE",
    }),
  };
}

function authMiddleware(req, _res, next) {
  req.publicUser = { id: USER_ID, email: EMAIL };
  req.publicVerifiedContact = {
    email: EMAIL,
    emailVerified: false,
    phone: PHONE,
    phoneVerified: false,
  };
  next();
}

function appWith(
  publicAccountService,
  middleware = authMiddleware,
  publicOrganizationService = organizationServiceMock(),
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/lottery",
    createPublicLotteryAccountingRouter({
      prisma: prismaMock(),
      service: accountingServiceMock(),
      identityService: identityServiceMock(),
      publicAccountService,
      publicOrganizationService,
      authMiddleware: middleware,
    }),
  );
  return app;
}

function linkedAccount() {
  return {
    id: LOCAL_ACCOUNT_ID,
    firstName: "Ajay",
    lastName: "Saha",
    email: EMAIL,
    phone: PHONE,
    status: "ACTIVE",
    identityLinkStatus: "LINKED",
    orbisIdentityId: "0199f67a-1111-7000-8000-111111111111",
    orbisDisplayId: "ORB-U-ABCDEFGH",
    orbisLifecycle: "provisional",
    identityLinkReason: "no_match",
  };
}

describe("Foundation public account routes", () => {
  it("keeps account lookup and bootstrap behind authentication", async () => {
    const publicAccountService = {
      getAccount: vi.fn(),
      ensureAccountAndIdentity: vi.fn(),
    };
    const publicOrganizationService = organizationServiceMock();
    const blocked = (_req, res) => res.status(401).json({ success: false });
    const app = appWith(
      publicAccountService,
      blocked,
      publicOrganizationService,
    );

    await request(app).get(ACCOUNT_ROUTE).expect(401);
    await request(app).post(ACCOUNT_ROUTE).send({}).expect(401);

    expect(publicAccountService.getAccount).not.toHaveBeenCalled();
    expect(publicAccountService.ensureAccountAndIdentity).not.toHaveBeenCalled();
    expect(publicOrganizationService.ensureOwnerOrganization).not.toHaveBeenCalled();
  });

  it("returns the durable account for the authenticated user", async () => {
    const account = linkedAccount();
    const publicAccountService = {
      getAccount: vi.fn().mockResolvedValue(account),
      ensureAccountAndIdentity: vi.fn(),
    };

    const response = await request(appWith(publicAccountService))
      .get(ACCOUNT_ROUTE)
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.account).toEqual(account);
    expect(publicAccountService.getAccount).toHaveBeenCalledWith({
      id: USER_ID,
      email: EMAIL,
      phone: PHONE,
    });
  });

  it("returns a bounded not-found response before signup bootstrap", async () => {
    const publicAccountService = {
      getAccount: vi.fn().mockResolvedValue(null),
      ensureAccountAndIdentity: vi.fn(),
    };

    const response = await request(appWith(publicAccountService))
      .get(ACCOUNT_ROUTE)
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: {
        category: "foundation_account",
        code: "FOUNDATION_ACCOUNT_NOT_FOUND",
      },
    });
  });

  it("bootstraps the Foundation account without silently creating a business organization", async () => {
    const account = linkedAccount();
    const publicAccountService = {
      getAccount: vi.fn(),
      ensureAccountAndIdentity: vi.fn().mockResolvedValue(account),
    };
    const publicOrganizationService = organizationServiceMock();
    const signup = {
      firstName: "Ajay",
      lastName: "Saha",
      email: "spoof@example.test",
      phone: "+910000000000",
      phoneCountryCallingCode: "+91",
      organizationName: ORGANIZATION_NAME,
    };

    const response = await request(
      appWith(
        publicAccountService,
        authMiddleware,
        publicOrganizationService,
      ),
    )
      .post(ACCOUNT_ROUTE)
      .send(signup)
      .expect(200);

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.account).toEqual(account);
    expect(response.body.organization).toBeNull();
    expect(publicAccountService.ensureAccountAndIdentity).toHaveBeenCalledWith(
      { id: USER_ID, email: EMAIL, phone: PHONE },
      signup,
    );
    expect(
      publicOrganizationService.ensureOwnerOrganization,
    ).not.toHaveBeenCalled();
  });

  it("creates the first business organization only from the explicit authenticated route", async () => {
    const account = linkedAccount();
    const publicAccountService = {
      getAccount: vi.fn().mockResolvedValue(account),
      ensureAccountAndIdentity: vi.fn(),
    };
    const publicOrganizationService = organizationServiceMock();

    const response = await request(
      appWith(
        publicAccountService,
        authMiddleware,
        publicOrganizationService,
      ),
    )
      .post("/lottery/organizations")
      .send({ name: ORGANIZATION_NAME })
      .expect(201);

    expect(response.body.organization).toMatchObject({
      id: "organization-1",
      name: ORGANIZATION_NAME,
    });
    expect(publicOrganizationService.ensureOwnerOrganization).toHaveBeenCalledWith({
      authUserId: USER_ID,
      account,
      requestedName: ORGANIZATION_NAME,
    });
  });

  it("does not create an organization while central identity needs review", async () => {
    const account = {
      ...linkedAccount(),
      identityLinkStatus: "REVIEW_REQUIRED",
      orbisIdentityId: null,
      orbisDisplayId: null,
    };
    const publicAccountService = {
      getAccount: vi.fn(),
      ensureAccountAndIdentity: vi.fn().mockResolvedValue(account),
    };
    const publicOrganizationService = organizationServiceMock();

    const response = await request(
      appWith(
        publicAccountService,
        authMiddleware,
        publicOrganizationService,
      ),
    )
      .post(ACCOUNT_ROUTE)
      .send({ firstName: "Ajay", lastName: "Saha" })
      .expect(200);

    expect(response.body.account.identityLinkStatus).toBe("REVIEW_REQUIRED");
    expect(response.body.organization).toBeNull();
    expect(publicOrganizationService.ensureOwnerOrganization).not.toHaveBeenCalled();
  });

  it("sanitizes validation and temporary account failures", async () => {
    const required = Object.assign(new Error("private validation detail"), {
      code: "FOUNDATION_ACCOUNT_FIRST_NAME_REQUIRED",
    });
    const temporary = Object.assign(new Error("private upstream detail"), {
      code: "ORBIS_IDENTITY_TEMPORARY_FAILURE",
      retryable: true,
    });
    const publicAccountService = {
      getAccount: vi.fn(),
      ensureAccountAndIdentity: vi
        .fn()
        .mockRejectedValueOnce(required)
        .mockRejectedValueOnce(temporary),
    };
    const app = appWith(publicAccountService);

    const validation = await request(app)
      .post(ACCOUNT_ROUTE)
      .send({})
      .expect(400);
    const unavailable = await request(app)
      .post(ACCOUNT_ROUTE)
      .send({})
      .expect(503);

    expect(validation.body.error.code).toBe(
      "FOUNDATION_ACCOUNT_FIRST_NAME_REQUIRED",
    );
    expect(unavailable.body.error.code).toBe("FOUNDATION_ACCOUNT_UNAVAILABLE");
    expect(JSON.stringify(unavailable.body)).not.toContain("private upstream detail");
  });
});
