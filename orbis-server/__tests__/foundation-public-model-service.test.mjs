// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  ACCOUNTING_AI_MODEL_SLUG,
  createFoundationPublicModelService,
} = require("../foundation-public-model-service.cjs");

const PUBLISHED_AT = new Date("2026-09-13T12:00:00.000Z");

function publishedRow() {
  return {
    slug: ACCOUNTING_AI_MODEL_SLUG,
    displayName: "ORBiS Accounting AI",
    category: "ACCOUNTING_AI",
    status: "ACTIVE",
    versions: [
      {
        sequence: 3,
        lifecycle: "PUBLISHED",
        definition: {
          schemaVersion: 2,
          modules: [{ slug: "lottery", name: "Lottery Accounting" }],
        },
        publishedAt: PUBLISHED_AT,
        reviewReport: { internal: true },
        reviewedByAdminId: "admin-private",
      },
    ],
    id: "model-private-id",
  };
}

function prismaMock(result = publishedRow()) {
  return {
    foundationManagedProductModel: {
      findFirst: vi.fn().mockResolvedValue(result),
    },
  };
}

describe("Foundation public published-model resolver", () => {
  it("reads only the active Accounting model and latest PUBLISHED snapshot", async () => {
    const prisma = prismaMock();
    const service = createFoundationPublicModelService({ prisma });

    const model = await service.getPublishedAccountingModel();

    expect(prisma.foundationManagedProductModel.findFirst).toHaveBeenCalledWith({
      where: {
        slug: ACCOUNTING_AI_MODEL_SLUG,
        status: "ACTIVE",
      },
      select: {
        slug: true,
        displayName: true,
        category: true,
        status: true,
        versions: {
          where: { lifecycle: "PUBLISHED" },
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
    expect(model).toEqual({
      slug: ACCOUNTING_AI_MODEL_SLUG,
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
        publishedAt: PUBLISHED_AT,
      },
    });
    expect(JSON.stringify(model)).not.toContain("model-private-id");
    expect(JSON.stringify(model)).not.toContain("reviewReport");
    expect(JSON.stringify(model)).not.toContain("admin-private");
  });

  it("fails closed when the model has no published snapshot", async () => {
    const prisma = prismaMock({
      slug: ACCOUNTING_AI_MODEL_SLUG,
      displayName: "ORBiS Accounting AI",
      category: "ACCOUNTING_AI",
      status: "ACTIVE",
      versions: [],
    });
    const service = createFoundationPublicModelService({ prisma });

    await expect(service.getPublishedAccountingModel()).resolves.toBeNull();
  });

  it("fails closed when the active Accounting model is missing", async () => {
    const prisma = prismaMock(null);
    const service = createFoundationPublicModelService({ prisma });

    await expect(service.getPublishedAccountingModel()).resolves.toBeNull();
  });
});
