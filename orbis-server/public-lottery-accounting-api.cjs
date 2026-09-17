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
const {
  createFoundationPublicModelService,
} = require("./foundation-public-model-service.cjs");

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
  res.setHeader(CACHE_CONTROL, NO_STORE);
  return res.status(status).json({
    success: false,
    error: { category: "lottery_accounting", code },
  });
}

function organizationIdFromQuery(req) {
  const value = req.query?.organizationId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function organizationIdFromBody(req) {
  const value = req.body?.organizationId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function publicMutationPayload(body, organizationId) {
  const payload = body && typeof body === "object" ? { ...body } : {};
  for (const field of INTERNAL_ACTOR_FIELDS) delete payload[field];
  return { ...payload, organizationId };
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

  if (!validationError) {
    console.error(
      `[FOUNDATION_ACCOUNT] prepare failed: ${code || error?.name || "UNKNOWN"}`,
    );
  }

  res.setHeader(CACHE_CONTROL, NO_STORE);
  return res.status(validationError ? 400 : 503).json({
    success: false,
    error: {
      category: "foundation_account",
      code: validationError ? code : "FOUNDATION_ACCOUNT_UNAVAILABLE",
    },
  });
}

function sendPublicOrganizationError(res, error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const required =
    code.startsWith("FOUNDATION_ORGANIZATION_") &&
    code.endsWith("_REQUIRED");
  const identityNotLinked =
    code === "FOUNDATION_ORGANIZATION_IDENTITY_NOT_LINKED";

  if (!required && !identityNotLinked) {
    console.error(
      `[PUBLIC_ORGANIZATION] create failed: ${code || error?.name || "UNKNOWN"}`,
    );
  }

  const status = required ? 400 : identityNotLinked ? 409 : 503;
  const publicCode =
    required || identityNotLinked
      ? code
      : "FOUNDATION_ORGANIZATION_UNAVAILABLE";

  res.setHeader(CACHE_CONTROL, NO_STORE);
  return res.status(status).json({
    success: false,
    error: {
      category: "foundation_organization",
      code: publicCode,
    },
  });
}

function sendPublicModelError(res) {
  res.setHeader(CACHE_CONTROL, NO_STORE);
  return res.status(503).json({
    success: false,
    error: {
      category: "foundation_model",
      code: "ACCOUNTING_MODEL_UNAVAILABLE",
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
  publicModelService: suppliedPublicModelService,
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
  let publicModelService = suppliedPublicModelService || null;
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

  function getPublicModelService() {
    if (!publicModelService) {
      publicModelService = createFoundationPublicModelService({ prisma });
    }
    return publicModelService;
  }

  async function activeMembership(userId, organizationId) {
    const membership =
      await prisma.foundationAccountingOrganizationMembership.findFirst({
        where: { userId, organizationId, status: "ACTIVE" },
        include: { organization: true },
      });
    return membership?.organization?.status === "ACTIVE" ? membership : null;
  }

  async function withAccountingError(res, action) {
    try {
      return await action();
    } catch (error) {
      return sendAccountingError(res, error);
    }
  }

  async function requireActiveOrganization(req, res, organizationId) {
    if (!organizationId) {
      publicScopeError(res, "REQUIRED_FIELD", 400);
      return null;
    }
    const membership = await activeMembership(
      req.publicUser.id,
      organizationId,
    );
    if (!membership) {
      publicScopeError(res, "ORGANIZATION_NOT_FOUND", 404);
      return null;
    }
    return organizationId;
  }

  function scopedRead(req, res, reader) {
    return withAccountingError(res, async () => {
      const organizationId = await requireActiveOrganization(
        req,
        res,
        organizationIdFromQuery(req),
      );
      if (!organizationId) return undefined;
      return reader(organizationId);
    });
  }

  function scopedMutation(req, res, action, successStatus = 200) {
    return withAccountingError(res, async () => {
      const organizationId = await requireActiveOrganization(
        req,
        res,
        organizationIdFromBody(req),
      );
      if (!organizationId) return undefined;
      const payload = publicMutationPayload(req.body, organizationId);
      const actorId = `PUBLIC_USER:${req.publicUser.id}`;
      const body = await action(payload, actorId);
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res
        .status(successStatus)
        .json(sanitizePublicAccountingValue(body));
    });
  }

  router.get("/model", async (_req, res) => {
    try {
      const model = await getPublicModelService().getPublishedAccountingModel();
      res.setHeader(CACHE_CONTROL, NO_STORE);
      if (!model) {
        return res.status(404).json({
          success: false,
          error: {
            category: "foundation_model",
            code: "ACCOUNTING_MODEL_NOT_PUBLISHED",
          },
        });
      }
      return res.json({ model });
    } catch {
      return sendPublicModelError(res);
    }
  });

  router.get("/organizations", (req, res) =>
    withAccountingError(res, async () => {
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
    }),
  );

  router.post("/organizations", async (req, res) => {
    try {
      const authUser = publicAccountAuthUser(req);
      const account = await getPublicAccountService().getAccount(authUser);
      if (!account) {
        res.setHeader(CACHE_CONTROL, NO_STORE);
        return res.status(404).json({
          success: false,
          error: {
            category: "foundation_account",
            code: "FOUNDATION_ACCOUNT_NOT_FOUND",
          },
        });
      }
      const organization =
        await getPublicOrganizationService().ensureOwnerOrganization({
          authUserId: authUser.id,
          account,
          requestedName: req.body?.name,
        });
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res
        .status(201)
        .json({ organization: sanitizePublicAccountingValue(organization) });
    } catch (error) {
      return sendPublicOrganizationError(res, error);
    }
  });

  router.post("/parties", (req, res) =>
    scopedMutation(
      req,
      res,
      async (payload, actorId) => ({
        party: await service.createParty(payload, actorId),
      }),
      201,
    ),
  );

  router.patch("/parties/:partyId/profile", (req, res) =>
    scopedMutation(req, res, async (payload, actorId) => ({
      party: await service.updatePartyProfile(
        { ...payload, partyId: req.params.partyId },
        actorId,
      ),
    })),
  );

  router.patch("/settings/tds-rate", (req, res) =>
    scopedMutation(req, res, async (payload, actorId) => ({
      organization: await service.updateOrganizationTdsRate(payload, actorId),
    })),
  );

  router.patch("/settings/user-ledger-storage", (req, res) =>
    scopedMutation(req, res, async (payload, actorId) => ({
      organization: await service.updateUserLedgerStorage(payload, actorId),
    })),
  );

  router.post("/periods", (req, res) =>
    scopedMutation(
      req,
      res,
      async (payload, actorId) => ({
        period: await service.createPeriod(payload, actorId),
      }),
      201,
    ),
  );

  router.post("/periods/financial-year", (req, res) =>
    scopedMutation(
      req,
      res,
      async (payload, actorId) => ({
        period: await service.createFinancialYearPeriod(payload, actorId),
      }),
      201,
    ),
  );

  router.post("/stock-movements", (req, res) =>
    scopedMutation(
      req,
      res,
      async (payload, actorId) => ({
        movement: await service.recordStockMovement(payload, actorId),
      }),
      201,
    ),
  );

  router.post("/daily-stockist-entries", (req, res) =>
    scopedMutation(req, res, async (payload, actorId) => ({
      entry: await service.saveDailyStockistEntry(payload, actorId),
    })),
  );

  router.post("/daily-entry-clearances", (req, res) =>
    scopedMutation(
      req,
      res,
      async (payload, actorId) => ({
        clearance: await service.clearDailyEntries(payload, actorId),
      }),
      201,
    ),
  );

  router.post("/sales", (req, res) =>
    scopedMutation(
      req,
      res,
      (payload, actorId) => service.recordSale(payload, actorId),
      201,
    ),
  );

  router.post("/daily-seller-drafts", (req, res) =>
    scopedMutation(
      req,
      res,
      (payload, actorId) => service.createDailySellerDraft(payload, actorId),
      201,
    ),
  );

  router.patch("/daily-seller-drafts/:saleId", (req, res) =>
    scopedMutation(req, res, (payload, actorId) =>
      service.updateDailySellerDraft(
        { ...payload, saleId: req.params.saleId },
        actorId,
      ),
    ),
  );

  router.delete("/daily-seller-drafts/:saleId", (req, res) =>
    scopedMutation(req, res, (payload, actorId) =>
      service.deleteDailySellerDraft(
        { ...payload, saleId: req.params.saleId },
        actorId,
      ),
    ),
  );

  router.post("/daily-seller-drafts/:saleId/post", (req, res) =>
    scopedMutation(req, res, (payload, actorId) =>
      service.postDailySellerDraft(
        { ...payload, saleId: req.params.saleId },
        actorId,
      ),
    ),
  );

  router.post("/sales/:saleId/correct", (req, res) =>
    scopedMutation(
      req,
      res,
      (payload, actorId) =>
        service.correctPostedSale(
          { ...payload, saleId: req.params.saleId },
          actorId,
        ),
      201,
    ),
  );

  router.post("/sales/preview", (req, res) =>
    scopedMutation(req, res, (payload) => service.previewSale(payload)),
  );

  router.post("/expenses/categories", (req, res) =>
    scopedMutation(
      req,
      res,
      async (payload, actorId) => ({
        category: await service.createExpenseCategory(payload, actorId),
      }),
      201,
    ),
  );

  router.patch("/expenses/categories/:categoryId", (req, res) =>
    scopedMutation(req, res, async (payload, actorId) => ({
      category: await service.updateExpenseCategory(
        { ...payload, categoryId: req.params.categoryId },
        actorId,
      ),
    })),
  );

  router.post("/expenses/profiles", (req, res) =>
    scopedMutation(
      req,
      res,
      async (payload, actorId) => ({
        profile: await service.createExpenseProfile(payload, actorId),
      }),
      201,
    ),
  );

  router.patch("/expenses/profiles/:profileId", (req, res) =>
    scopedMutation(req, res, async (payload, actorId) => ({
      profile: await service.updateExpenseProfile(
        { ...payload, profileId: req.params.profileId },
        actorId,
      ),
    })),
  );

  router.post("/expenses/bills", (req, res) =>
    scopedMutation(
      req,
      res,
      async (payload, actorId) => ({
        bill: await service.recordExpenseBill(payload, actorId),
      }),
      201,
    ),
  );

  router.post("/expenses/payments", (req, res) =>
    scopedMutation(
      req,
      res,
      async (payload, actorId) => ({
        payment: await service.recordExpensePayment(payload, actorId),
      }),
      201,
    ),
  );

  router.post("/customer-bills", (req, res) =>
    scopedMutation(
      req,
      res,
      (payload, actorId) => service.recordCustomerBill(payload, actorId),
      201,
    ),
  );

  router.post("/corrections/:entityType/:entityId", (req, res) =>
    scopedMutation(
      req,
      res,
      async (payload, actorId) => ({
        correction: await service.correctAccountingTransaction(
          {
            ...payload,
            entityType: req.params.entityType,
            entityId: req.params.entityId,
          },
          actorId,
        ),
      }),
      201,
    ),
  );

  router.post("/payments", (req, res) =>
    scopedMutation(
      req,
      res,
      (payload, actorId) => service.recordPayment(payload, actorId),
      201,
    ),
  );

  router.post("/settlements", (req, res) =>
    scopedMutation(
      req,
      res,
      async (payload, actorId) => ({
        settlement: await service.recordSettlement(payload, actorId),
      }),
      201,
    ),
  );

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
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res.json({ account, organization: null });
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
