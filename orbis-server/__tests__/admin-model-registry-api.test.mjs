// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  ACCOUNTING_AI_MODEL_SLUG,
  createAdminModelRegistryRouter,
  createManagedProductModelRegistry,
} = require("../admin-model-registry-api.cjs");
const MODEL_ROUTE = "/api/admin/models";

function createPrismaMock() {
  const state = { models: [], versions: [], events: [] };
  let nextId = 1;
  const timestamp = new Date("2026-08-30T00:00:00.000Z");
  const createId = (prefix) => `${prefix}-${nextId++}`;
  const versionsFor = (modelId) =>
    state.versions
      .filter((version) => version.modelId === modelId)
      .sort((left, right) => right.sequence - left.sequence);

  const client = {
    foundationManagedProductModel: {
      findUnique: async ({ where }) => {
        const model = state.models.find(
          (item) => item.id === where.id || item.slug === where.slug,
        );
        return model ? { ...model, versions: versionsFor(model.id) } : null;
      },
      create: async ({ data }) => {
        const model = {
          id: createId("model"),
          slug: data.slug,
          displayName: data.displayName,
          category: data.category,
          status: "ACTIVE",
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        state.models.push(model);
        const version = {
          id: createId("version"),
          modelId: model.id,
          sequence: data.versions.create.sequence,
          lifecycle: data.versions.create.lifecycle,
          definition: data.versions.create.definition,
          createdAt: timestamp,
          updatedAt: timestamp,
          publishedAt: null,
          reviewStatus: data.versions.create.reviewStatus || "NOT_RUN",
          reviewReport: null,
          reviewedAt: null,
          reviewedByAdminId: null,
        };
        state.versions.push(version);
        return { ...model, versions: versionsFor(model.id) };
      },
    },
    foundationManagedProductModelVersion: {
      update: async ({ where, data }) => {
        const version = state.versions.find((item) => item.id === where.id);
        Object.assign(version, data, { updatedAt: timestamp });
        return version;
      },
      create: async ({ data }) => {
        const version = {
          id: createId("version"),
          modelId: data.modelId,
          sequence: data.sequence,
          lifecycle: data.lifecycle,
          definition: data.definition,
          createdAt: timestamp,
          updatedAt: timestamp,
          publishedAt: null,
          reviewStatus: data.reviewStatus || "NOT_RUN",
          reviewReport: null,
          reviewedAt: null,
          reviewedByAdminId: null,
        };
        state.versions.push(version);
        return version;
      },
    },
    foundationManagedProductModelEvent: {
      create: async ({ data }) => {
        const event = { id: createId("event"), createdAt: timestamp, ...data };
        state.events.push(event);
        return event;
      },
    },
  };
  return {
    ...client,
    $transaction: async (operation) => operation(client),
    state,
  };
}

describe("managed product model registry", () => {
  it("creates the Accounting AI as an editable, analysis-only draft", async () => {
    const prisma = createPrismaMock();
    const registry = createManagedProductModelRegistry({ prisma });

    const model = await registry.getAccountingModel("admin-1");

    expect(model.slug).toBe(ACCOUNTING_AI_MODEL_SLUG);
    expect(model.currentVersion).toMatchObject({
      sequence: 1,
      lifecycle: "DRAFT",
    });
    expect(model.publishedVersion).toBeNull();
    expect(model.currentVersion.definition.aiBoundary).toMatchObject({
      purpose: "ACCOUNTING_ANALYSIS_ONLY",
      writeAccess: "DISABLED",
      webSearch: "DISABLED",
    });
    expect(model.currentVersion.definition).toMatchObject({ schemaVersion: 2 });
    expect(model.currentVersion.definition.modules[0]).toMatchObject({
      lifecycle: "READY_FOR_REVIEW",
      dataContract: { moneyUnit: "PAISE", rateUnit: "BASIS_POINTS" },
    });
    expect(model.currentVersion.definition.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: "lottery",
          name: "Lottery Accounting",
        }),
      ]),
    );
    expect(prisma.state.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "MODEL_CREATED" }),
      ]),
    );
  });

  it("publishes the current snapshot and opens an identical next draft", async () => {
    const prisma = createPrismaMock();
    const registry = createManagedProductModelRegistry({
      prisma,
      now: () => new Date("2026-08-30T01:00:00.000Z"),
    });
    const before = await registry.getAccountingModel("admin-1");
    const reviewed = await registry.reviewAccountingModel("admin-1");
    expect(reviewed.currentVersion.reviewStatus).toBe("PASSED");

    const after = await registry.publishAccountingModel("admin-1");

    expect(after.publishedVersion).toMatchObject({
      sequence: 1,
      lifecycle: "PUBLISHED",
    });
    expect(after.currentVersion).toMatchObject({
      sequence: 2,
      lifecycle: "DRAFT",
      reviewStatus: "NOT_RUN",
    });
    expect(after.currentVersion.definition).toEqual(
      before.currentVersion.definition,
    );
    expect(after.publishedVersion.publishedAt).toEqual(
      new Date("2026-08-30T01:00:00.000Z"),
    );
    expect(prisma.state.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "VERSION_PUBLISHED",
          metadata: expect.objectContaining({
            publishedSequence: 1,
            nextCurrentSequence: 2,
          }),
        }),
      ]),
    );
  });

  it("blocks publish until deterministic contract and core review pass", async () => {
    const prisma = createPrismaMock();
    const registry = createManagedProductModelRegistry({ prisma });
    await registry.getAccountingModel("admin-1");
    await expect(
      registry.publishAccountingModel("admin-1"),
    ).rejects.toMatchObject({
      code: "VERSION_REVIEW_REQUIRED",
    });
    expect(prisma.state.versions).toHaveLength(1);
  });

  it("upgrades the existing v1 draft definition without touching a published snapshot", async () => {
    const prisma = createPrismaMock();
    await prisma.foundationManagedProductModel.create({
      data: {
        slug: ACCOUNTING_AI_MODEL_SLUG,
        displayName: "ORBiS Accounting AI",
        category: "ACCOUNTING_AI",
        versions: {
          create: {
            sequence: 1,
            lifecycle: "DRAFT",
            definition: { schemaVersion: 1 },
          },
        },
      },
    });
    const registry = createManagedProductModelRegistry({ prisma });
    const model = await registry.getAccountingModel("admin-1");
    expect(model.currentVersion.definition.schemaVersion).toBe(2);
    expect(prisma.state.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "MODEL_DEFINITION_UPGRADED" }),
      ]),
    );
  });

  it("requires the supplied Admin middleware before exposing a model", async () => {
    const prisma = createPrismaMock();
    const app = express();
    app.use(
      MODEL_ROUTE,
      createAdminModelRegistryRouter({
        prisma,
        authMiddleware: (_req, res) => res.status(401).json({ success: false }),
      }),
    );

    await request(app).get(MODEL_ROUTE).expect(401);
    expect(prisma.state.models).toHaveLength(0);
  });

  it("exposes review and publish through Admin-only, no-store routes", async () => {
    const prisma = createPrismaMock();
    const app = express();
    app.use(express.json());
    app.use(
      MODEL_ROUTE,
      createAdminModelRegistryRouter({
        prisma,
        authMiddleware: (req, _res, next) => {
          req.adminUser = { id: "admin-1" };
          next();
        },
      }),
    );
    const review = await request(app)
      .post(`/api/admin/models/${ACCOUNTING_AI_MODEL_SLUG}/review`)
      .expect(200);
    expect(review.headers["cache-control"]).toBe("no-store");
    expect(review.body.model.currentVersion.reviewStatus).toBe("PASSED");
    await request(app)
      .post(`/api/admin/models/${ACCOUNTING_AI_MODEL_SLUG}/publish`)
      .expect(200);
  });
});
