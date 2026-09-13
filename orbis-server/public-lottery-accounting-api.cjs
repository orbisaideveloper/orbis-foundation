const express = require("express");
const {
  createLotteryAccountingService,
} = require("./lottery-accounting-service.cjs");
const { sendAccountingError } = require("./lottery-accounting-api.cjs");
const {
  createAccountingIdentityService,
} = require("./accounting-identity-service.cjs");
const {
  createFoundationPublicAccountRepository,
} = require("./foundation-public-account-repository.cjs");
const {
  createFoundationPublicAccountService,
} = require("./foundation-public-account-service.cjs");
const {
  createFoundationPublicOrganizationService,
} = require("./foundation-public-organization-service.cjs");

const CACHE_CONTROL = "Cache-Control";
const NO_STORE = "no-store";
const INTERNAL_ACTOR_FIELDS = new Set([
  "actorAdminId",
  "createdByAdminId",
  "updatedByAdminId",
  "reviewedByAdminId",
]);

function sanitizePublicAccountingValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizePublicAccountingValue);
  }
  if (!value || typeof value !== "object" || value instanceof Date) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !INTERNAL_ACTOR_FIELDS.has(key))
      .map(([key, item]) => [key, sanitizePublicAccountingValue(item)]),
  );
}

function publicScopeError(res, code, status) {
  return res.status(status).json({
    success: false,
    error: { category: "lottery_accounting", code },
  });
}

function organizationIdFromQuery(req) {
  const value = req.query?.organizationId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function publicAccountAuthUser(req) {
  return {
    id: req.publicUser.id,
    email: req.publicVerifiedContact?.email || req.publicUser.email || null,
    phone: req.publicVerifiedContact?.phone || null,
  };
}

function sendPublicAccountError(res, error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const validationError =
    code.startsWith("FOUNDATION_ACCOUNT_") && code.endsWith("_REQUIRED");
  res.setHeader(CACHE_CONTROL, NO_STORE);
  return res.status(validationError ? 400 : 503).json({
    success: false,
    error: {
      category: "foundation_account",
      code: validationError ? code : "FOUNDATION_ACCOUNT_UNAVAILABLE",
    },
  });
}

function createPublicLotteryAccountingRouter({
  prisma,
  authMiddleware,
  service: suppliedService,
  identityService: suppliedIdentityService,
  publicAccountService: suppliedPublicAccountService,
  publicOrganizationService: suppliedPublicOrganizationService,
}) {
  if (!prisma) throw new Error("A Prisma client is required.");
  if (typeof authMiddleware !== "function") {
    throw new Error("Public authentication middleware is required.");
  }

  const router = express.Router();
  const service = suppliedService || createLotteryAccountingService({ prisma });
  const identityService =
    suppliedIdentityService || createAccountingIdentityService({ prisma });
  let publicAccountService = suppliedPublicAccountService || null;
  let publicOrganizationService = suppliedPublicOrganizationService || null;
  router.use(authMiddleware);

  function getPublicAccountService() {
    if (!publicAccountService) {
      const repository = createFoundationPublicAccountRepository({ prisma });
      publicAccountService = createFoundationPublicAccountService({ repository });
    }
    return publicAccountService;
  }

  function getPublicOrganizationService() {
    if (!publicOrganizationService) {
      publicOrganizationService = createFoundationPublicOrganizationService({
        prisma,
      });
    }
    return publicOrganizationService;
  }

  async function activeMembership(userId, organizationId) {
    const membership =
      await prisma.foundationAccountingOrganizationMembership.findFirst({
        where: { userId, organizationId, status: "ACTIVE" },
        include: { organization: true },
      });
    return membership?.organization?.status === "ACTIVE" ? membership : null;
  }

  async function scopedRead(req, res, reader) {
    const organizationId = organizationIdFromQuery(req);
    if (!organizationId) {
      return publicScopeError(res, "REQUIRED_FIELD", 400);
    }
    try {
      const membership = await activeMembership(
        req.publicUser.id,
        organizationId,
      );
      if (!membership) {
        return publicScopeError(res, "ORGANIZATION_NOT_FOUND", 404);
      }
      return await reader(organizationId);
    } catch (error) {
      return sendAccountingError(res, error);
    }
  }

  router.get("/organizations", async (req, res) => {
    try {
      const memberships =
        await prisma.foundationAccountingOrganizationMembership.findMany({
          where: { userId: req.publicUser.id, status: "ACTIVE" },
          include: { organization: true },
          orderBy: { createdAt: "asc" },
        });
      const organizations = memberships
        .map((membership) => membership.organization)
        .filter((organization) => organization?.status === "ACTIVE")
        .map(sanitizePublicAccountingValue);
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res.json({ organizations });
    } catch (error) {
      return sendAccountingError(res, error);
    }
  });

  router.get("/workspace", (req, res) =>
    scopedRead(req, res, async (organizationId) => {
      const workspace = await service.getWorkspace(
        { organizationId },
        { materializeRecurringExpenses: false },
      );
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res.json({
        workspace: sanitizePublicAccountingValue(workspace),
      });
    }),
  );

  router.get("/summary", (req, res) =>
    scopedRead(req, res, async (organizationId) => {
      const summary = await service.getVerifiedSummary({
        organizationId,
        from: req.query?.from,
        to: req.query?.to,
      });
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res.json({ summary: sanitizePublicAccountingValue(summary) });
    }),
  );

  router.get("/analysis", (req, res) =>
    scopedRead(req, res, async (organizationId) => {
      const result = await service.analyzeVerifiedAccounting({
        organizationId,
        from: req.query?.from,
        to: req.query?.to,
      });
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res.json(sanitizePublicAccountingValue(result));
    }),
  );

  router.get("/account", async (req, res) => {
    try {
      const account = await getPublicAccountService().getAccount(
        publicAccountAuthUser(req),
      );
      res.setHeader(CACHE_CONTROL, NO_STORE);
      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            category: "foundation_account",
            code: "FOUNDATION_ACCOUNT_NOT_FOUND",
          },
        });
      }
      return res.json({ account });
    } catch (error) {
      return sendPublicAccountError(res, error);
    }
  });

  router.post("/account", async (req, res) => {
    try {
      const authUser = publicAccountAuthUser(req);
      const account = await getPublicAccountService().ensureAccountAndIdentity(
        authUser,
        req.body,
      );
      const organization =
        account.identityLinkStatus === "LINKED"
          ? await getPublicOrganizationService().ensureOwnerOrganization({
              authUserId: authUser.id,
              account,
              requestedName: req.body?.organizationName,
            })
          : null;
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res.json({ account, organization });
    } catch (error) {
      return sendPublicAccountError(res, error);
    }
  });

  function publicIdentityContext(req) {
    return {
      ...req.publicUser,
      ...(req.publicVerifiedContact || {}),
    };
  }

  function sendIdentityError(res, error) {
    const statusByCode = {
      PARTY_CLAIM_NOT_FOUND: 404,
      PARTY_ALREADY_CLAIMED: 409,
      REQUIRED_FIELD: 400,
      VERIFIED_CONTACT_REQUIRED: 400,
    };
    const status = statusByCode[error?.code] || 503;
    const code =
      status === 503 ? "LOTTERY_ACCOUNTING_UNAVAILABLE" : error.code;
    res.setHeader(CACHE_CONTROL, NO_STORE);
    return res.status(status).json({
      success: false,
      error: {
        category: "lottery_accounting",
        code,
        ...(error?.field ? { field: error.field } : {}),
      },
    });
  }

  async function identityAction(res, action, successStatus = 200) {
    try {
      const result = await action();
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res.status(successStatus).json(result);
    } catch (error) {
      return sendIdentityError(res, error);
    }
  }

  router.get("/identity", (req, res) =>
    identityAction(res, async () => ({
      identity: await identityService.getGlobalIdentity(
        publicIdentityContext(req),
      ),
    })),
  );

  router.post("/identity", (req, res) =>
    identityAction(
      res,
      async () => ({
        identity: await identityService.ensureGlobalIdentity(
          publicIdentityContext(req),
        ),
      }),
      201,
    ),
  );

  router.get("/identity/claim-candidates", (req, res) =>
    identityAction(res, async () => ({
      candidates: await identityService.listClaimCandidates(
        publicIdentityContext(req),
      ),
    })),
  );

  router.post("/identity/claims", (req, res) =>
    identityAction(
      res,
      () =>
        identityService.claimParty(
          publicIdentityContext(req),
          req.body,
        ),
      201,
    ),
  );

  router.get("/identity/relationships", (req, res) =>
    identityAction(
      res,
      () =>
        identityService.listRelationships(
          publicIdentityContext(req),
        ),
    ),
  );

  return router;
}

module.exports = {
  createPublicLotteryAccountingRouter,
  sanitizePublicAccountingValue,
};
