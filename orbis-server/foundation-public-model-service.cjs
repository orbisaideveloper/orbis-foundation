const ACCOUNTING_AI_MODEL_SLUG = "orbis-accounting-ai";
const ACTIVE = "ACTIVE";
const PUBLISHED = "PUBLISHED";

function publicPublishedVersion(version) {
  return {
    sequence: version.sequence,
    lifecycle: version.lifecycle,
    definition: version.definition,
    publishedAt: version.publishedAt,
  };
}

function publicModel(model, version) {
  return {
    slug: model.slug,
    displayName: model.displayName,
    category: model.category,
    status: model.status,
    publishedVersion: publicPublishedVersion(version),
  };
}

function createFoundationPublicModelService({ prisma } = {}) {
  if (!prisma?.foundationManagedProductModel?.findFirst) {
    throw new Error("A Prisma managed-product model reader is required.");
  }

  async function getPublishedAccountingModel() {
    const model = await prisma.foundationManagedProductModel.findFirst({
      where: {
        slug: ACCOUNTING_AI_MODEL_SLUG,
        status: ACTIVE,
      },
      select: {
        slug: true,
        displayName: true,
        category: true,
        status: true,
        versions: {
          where: { lifecycle: PUBLISHED },
          orderBy: { sequence: "desc" },
          take: 1,
          select: {
            sequence: true,
            lifecycle: true,
            definition: true,
            publishedAt: true,
          },
        },
      },
    });

    const publishedVersion = model?.versions?.[0] || null;
    return model && publishedVersion ? publicModel(model, publishedVersion) : null;
  }

  return { getPublishedAccountingModel };
}

module.exports = {
  ACCOUNTING_AI_MODEL_SLUG,
  ACTIVE,
  PUBLISHED,
  createFoundationPublicModelService,
};
