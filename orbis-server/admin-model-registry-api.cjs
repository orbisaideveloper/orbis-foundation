const express = require("express");
const { runLotteryCoreVerification } = require("./lottery-accounting-core.cjs");

const ACCOUNTING_AI_MODEL_SLUG = "orbis-accounting-ai";
const ACCOUNTING_AI_MODEL_NAME = "ORBiS Accounting AI";
const MODEL_CATEGORY = "ACCOUNTING_AI";
const CACHE_CONTROL = "Cache-Control";
const NO_STORE = "no-store";

function registryError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function initialAccountingDefinition() {
  return {
    schemaVersion: 2,
    product: {
      name: ACCOUNTING_AI_MODEL_NAME,
      distribution: {
        current: "PWA_PILOT",
        future: "PLAY_STORE",
      },
    },
    releasePolicy: {
      publicResolver: "PUBLISHED_VERSION_ONLY",
      nextCurrentVersion: "COPY_OF_PUBLISHED_SNAPSHOT",
    },
    aiBoundary: {
      purpose: "ACCOUNTING_ANALYSIS_ONLY",
      dataScope: "ACTIVE_MODULE_VERIFIED_SUMMARY",
      writeAccess: "DISABLED",
      webSearch: "DISABLED",
    },
    modules: [
      {
        slug: "lottery",
        name: "Lottery Accounting",
        lifecycle: "READY_FOR_REVIEW",
        workspace: [
          "overview",
          "data-contract",
          "workflow",
          "ai-skills",
          "test-review",
          "versions",
        ],
        workflow: [
          "stock-receipt",
          "return",
          "sales",
          "commission",
          "tax-deduction",
          "payment",
          "settlement",
        ],
        dataContract: {
          moneyUnit: "PAISE",
          rateUnit: "BASIS_POINTS",
          entities: [
            "organization",
            "party",
            "accounting-period",
            "stock-movement",
            "sale",
            "payment",
            "settlement",
            "ledger-entry",
            "audit-event",
          ],
          rules: [
            "NET_TICKETS_EQUALS_DISPATCH_MINUS_RETURN",
            "COMMISSION_EQUALS_GROSS_SALES_TIMES_RATE",
            "TDS_EQUALS_COMMISSION_TIMES_RATE",
            "NET_PAYABLE_EQUALS_GROSS_MINUS_COMMISSION_MINUS_TDS",
            "LEDGER_DEBITS_EQUAL_CREDITS",
            "POSTED_FINANCIAL_ROWS_ARE_IMMUTABLE",
          ],
        },
        aiSkills: [
          {
            slug: "profit-loss",
            name: "Profit & loss explanation",
            source: "VERIFIED_PERIOD_SUMMARY",
          },
          {
            slug: "outstanding-dues",
            name: "Outstanding due analysis",
            source: "VERIFIED_PARTY_AND_PERIOD_SUMMARY",
          },
          {
            slug: "anomaly-review",
            name: "Accounting anomaly review",
            source: "DETERMINISTIC_VALIDATION_FLAGS",
          },
          {
            slug: "tax-commission",
            name: "Tax and commission explanation",
            source: "VERIFIED_SALE_CALCULATION",
          },
        ],
        aiAnalysis: "MODULE_SCOPED_VERIFIED_ACCOUNTING_DATA_ONLY",
      },
    ],
  };
}

function versionSummary(version) {
  if (!version) return null;
  return {
    id: version.id,
    sequence: version.sequence,
    lifecycle: version.lifecycle,
    definition: version.definition,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
    publishedAt: version.publishedAt,
    reviewStatus: version.reviewStatus || "NOT_RUN",
    reviewReport: version.reviewReport || null,
    reviewedAt: version.reviewedAt || null,
    reviewedByAdminId: version.reviewedByAdminId || null,
  };
}

function modelSummary(model) {
  const versions = Array.isArray(model.versions) ? model.versions : [];
  return {
    id: model.id,
    slug: model.slug,
    displayName: model.displayName,
    category: model.category,
    status: model.status,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
    currentVersion: versionSummary(
      versions.find((version) => version.lifecycle === "DRAFT"),
    ),
    publishedVersion: versionSummary(
      versions.find((version) => version.lifecycle === "PUBLISHED"),
    ),
    versionHistory: versions.map(versionSummary),
  };
}

function modelInclude() {
  return {
    versions: {
      orderBy: { sequence: "desc" },
    },
  };
}

function createManagedProductModelRegistry({ prisma, now = () => new Date() }) {
  if (!prisma) throw new Error("A Prisma client is required.");

  async function ensureAccountingModel(client, actorAdminId) {
    const existing = await client.foundationManagedProductModel.findUnique({
      where: { slug: ACCOUNTING_AI_MODEL_SLUG },
      include: modelInclude(),
    });
    if (existing) {
      const draft = existing.versions.find(
        (version) => version.lifecycle === "DRAFT",
      );
      if ((draft?.definition?.schemaVersion || 0) < 2) {
        await client.foundationManagedProductModelVersion.update({
          where: { id: draft.id },
          data: {
            definition: initialAccountingDefinition(),
            reviewStatus: "NOT_RUN",
            reviewReport: null,
            reviewedAt: null,
            reviewedByAdminId: null,
          },
        });
        await client.foundationManagedProductModelEvent.create({
          data: {
            modelId: existing.id,
            modelVersionId: draft.id,
            action: "MODEL_DEFINITION_UPGRADED",
            actorAdminId,
            metadata: {
              fromSchemaVersion: draft.definition?.schemaVersion || 1,
              toSchemaVersion: 2,
            },
          },
        });
        return client.foundationManagedProductModel.findUnique({
          where: { id: existing.id },
          include: modelInclude(),
        });
      }
      return existing;
    }

    const model = await client.foundationManagedProductModel.create({
      data: {
        slug: ACCOUNTING_AI_MODEL_SLUG,
        displayName: ACCOUNTING_AI_MODEL_NAME,
        category: MODEL_CATEGORY,
        versions: {
          create: {
            sequence: 1,
            lifecycle: "DRAFT",
            definition: initialAccountingDefinition(),
          },
        },
      },
      include: modelInclude(),
    });

    const firstVersion = model.versions.find(
      (version) => version.lifecycle === "DRAFT",
    );
    await client.foundationManagedProductModelEvent.create({
      data: {
        modelId: model.id,
        modelVersionId: firstVersion?.id || null,
        action: "MODEL_CREATED",
        actorAdminId,
        metadata: { source: "ADMIN_MODEL_REGISTRY_BOOTSTRAP" },
      },
    });
    return model;
  }

  async function getAccountingModel(actorAdminId) {
    const model = await prisma.$transaction((client) =>
      ensureAccountingModel(client, actorAdminId),
    );
    return modelSummary(model);
  }

  async function currentDraft(client, actorAdminId) {
    const existing = await ensureAccountingModel(client, actorAdminId);
    const version = existing.versions.find(
      (candidate) => candidate.lifecycle === "DRAFT",
    );
    if (!version) throw registryError("DRAFT_VERSION_NOT_FOUND");
    return { existing, currentVersion: version };
  }

  async function publishAccountingModel(actorAdminId) {
    const model = await prisma.$transaction(
      async (client) => {
        const { existing, currentVersion } = await currentDraft(
          client,
          actorAdminId,
        );
        if (currentVersion.reviewStatus !== "PASSED") {
          throw registryError("VERSION_REVIEW_REQUIRED");
        }

        const previousPublished = existing.versions.find(
          (version) => version.lifecycle === "PUBLISHED",
        );
        if (previousPublished) {
          await client.foundationManagedProductModelVersion.update({
            where: { id: previousPublished.id },
            data: { lifecycle: "ARCHIVED" },
          });
        }

        const publishedAt = now();
        const publishedVersion =
          await client.foundationManagedProductModelVersion.update({
            where: { id: currentVersion.id },
            data: { lifecycle: "PUBLISHED", publishedAt },
          });
        const nextCurrentVersion =
          await client.foundationManagedProductModelVersion.create({
            data: {
              modelId: existing.id,
              sequence: currentVersion.sequence + 1,
              lifecycle: "DRAFT",
              definition: currentVersion.definition,
              reviewStatus: "NOT_RUN",
            },
          });

        await client.foundationManagedProductModelEvent.create({
          data: {
            modelId: existing.id,
            modelVersionId: publishedVersion.id,
            action: "VERSION_PUBLISHED",
            actorAdminId,
            metadata: {
              publishedSequence: publishedVersion.sequence,
              nextCurrentSequence: nextCurrentVersion.sequence,
              previousPublishedSequence: previousPublished?.sequence || null,
            },
          },
        });

        return client.foundationManagedProductModel.findUnique({
          where: { id: existing.id },
          include: modelInclude(),
        });
      },
      { isolationLevel: "Serializable" },
    );
    if (!model) throw registryError("MODEL_NOT_FOUND");
    return modelSummary(model);
  }

  async function reviewAccountingModel(actorAdminId) {
    const model = await prisma.$transaction(async (client) => {
      const { existing, currentVersion } = await currentDraft(
        client,
        actorAdminId,
      );
      const definition = currentVersion.definition;
      const lottery = definition?.modules?.find(
        (module) => module.slug === "lottery",
      );
      const core = runLotteryCoreVerification();
      const contractChecks = [
        { name: "schema version", passed: definition?.schemaVersion === 2 },
        {
          name: "published-only resolver",
          passed:
            definition?.releasePolicy?.publicResolver ===
            "PUBLISHED_VERSION_ONLY",
        },
        {
          name: "AI write disabled",
          passed: definition?.aiBoundary?.writeAccess === "DISABLED",
        },
        {
          name: "AI web search disabled",
          passed: definition?.aiBoundary?.webSearch === "DISABLED",
        },
        {
          name: "Lottery workflow complete",
          passed: lottery?.workflow?.length === 7,
        },
        {
          name: "Lottery data entities complete",
          passed: lottery?.dataContract?.entities?.length === 9,
        },
        {
          name: "Lottery AI skills complete",
          passed: lottery?.aiSkills?.length === 4,
        },
      ];
      const status =
        core.status === "PASSED" &&
        contractChecks.every((check) => check.passed)
          ? "PASSED"
          : "FAILED";
      const reviewedAt = now();
      const reviewReport = {
        status,
        contractChecks,
        coreChecks: core.checks,
        canonicalSummary: core.canonicalSummary,
      };
      await client.foundationManagedProductModelVersion.update({
        where: { id: currentVersion.id },
        data: {
          reviewStatus: status,
          reviewReport,
          reviewedAt,
          reviewedByAdminId: actorAdminId,
        },
      });
      await client.foundationManagedProductModelEvent.create({
        data: {
          modelId: existing.id,
          modelVersionId: currentVersion.id,
          action: "VERSION_REVIEWED",
          actorAdminId,
          metadata: {
            reviewStatus: status,
            checkCount: contractChecks.length + core.checks.length,
          },
        },
      });
      return client.foundationManagedProductModel.findUnique({
        where: { id: existing.id },
        include: modelInclude(),
      });
    });
    if (!model) throw registryError("MODEL_NOT_FOUND");
    return modelSummary(model);
  }

  return {
    getAccountingModel,
    publishAccountingModel,
    reviewAccountingModel,
  };
}

const SAFE_ERROR_CODES = new Set([
  "DRAFT_VERSION_NOT_FOUND",
  "MODEL_NOT_FOUND",
  "MODEL_REGISTRY_UNAVAILABLE",
  "VERSION_REVIEW_REQUIRED",
]);

function sendRegistryError(res, error) {
  const code = SAFE_ERROR_CODES.has(error?.code)
    ? error.code
    : "MODEL_REGISTRY_UNAVAILABLE";
  const status =
    code === "MODEL_NOT_FOUND"
      ? 404
      : code === "VERSION_REVIEW_REQUIRED"
        ? 409
        : 503;
  return res.status(status).json({
    success: false,
    error: { category: "admin_model_registry", code },
  });
}

function createAdminModelRegistryRouter({ prisma, authMiddleware }) {
  const router = express.Router();
  const registry = createManagedProductModelRegistry({ prisma });
  router.use(authMiddleware);

  router.get("/", async (req, res) => {
    try {
      const model = await registry.getAccountingModel(req.adminUser?.id);
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res.json({ models: [model] });
    } catch (error) {
      return sendRegistryError(res, error);
    }
  });

  router.post(`/${ACCOUNTING_AI_MODEL_SLUG}/publish`, async (req, res) => {
    try {
      const model = await registry.publishAccountingModel(req.adminUser?.id);
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res.json({ model });
    } catch (error) {
      return sendRegistryError(res, error);
    }
  });

  router.post(`/${ACCOUNTING_AI_MODEL_SLUG}/review`, async (req, res) => {
    try {
      const model = await registry.reviewAccountingModel(req.adminUser?.id);
      res.setHeader(CACHE_CONTROL, NO_STORE);
      return res.json({ model });
    } catch (error) {
      return sendRegistryError(res, error);
    }
  });

  return router;
}

module.exports = {
  ACCOUNTING_AI_MODEL_NAME,
  ACCOUNTING_AI_MODEL_SLUG,
  createAdminModelRegistryRouter,
  createManagedProductModelRegistry,
  initialAccountingDefinition,
  modelSummary,
};
