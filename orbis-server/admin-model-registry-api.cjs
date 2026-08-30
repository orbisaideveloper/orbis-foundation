const express = require("express");

const ACCOUNTING_AI_MODEL_SLUG = "orbis-accounting-ai";
const ACCOUNTING_AI_MODEL_NAME = "ORBiS Accounting AI";
const MODEL_CATEGORY = "ACCOUNTING_AI";

function registryError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function initialAccountingDefinition() {
  return {
    schemaVersion: 1,
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
        lifecycle: "READY_FOR_BUILD",
        workflow: [
          "stock-receipt",
          "return",
          "sales",
          "commission",
          "tax-deduction",
          "payment",
          "settlement",
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
    if (existing) return existing;

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

  async function publishAccountingModel(actorAdminId) {
    const model = await prisma.$transaction(
      async (client) => {
        const existing = await ensureAccountingModel(client, actorAdminId);
        const currentVersion = existing.versions.find(
          (version) => version.lifecycle === "DRAFT",
        );
        if (!currentVersion) throw registryError("DRAFT_VERSION_NOT_FOUND");

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

  return { getAccountingModel, publishAccountingModel };
}

const SAFE_ERROR_CODES = new Set([
  "DRAFT_VERSION_NOT_FOUND",
  "MODEL_NOT_FOUND",
  "MODEL_REGISTRY_UNAVAILABLE",
]);

function sendRegistryError(res, error) {
  const code = SAFE_ERROR_CODES.has(error?.code)
    ? error.code
    : "MODEL_REGISTRY_UNAVAILABLE";
  const status = code === "MODEL_NOT_FOUND" ? 404 : 503;
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
      res.setHeader("Cache-Control", "no-store");
      return res.json({ models: [model] });
    } catch (error) {
      return sendRegistryError(res, error);
    }
  });

  router.post(`/${ACCOUNTING_AI_MODEL_SLUG}/publish`, async (req, res) => {
    try {
      const model = await registry.publishAccountingModel(req.adminUser?.id);
      res.setHeader("Cache-Control", "no-store");
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
