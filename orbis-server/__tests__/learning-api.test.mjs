// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createLearningRouter } = require("../learning-api.cjs");

function createApp(service) {
  const app = express();
  app.use(express.json());
  app.use(
    "/learning",
    createLearningRouter({
      service,
      authMiddleware: (req, res, next) =>
        req.get("Authorization") === "Bearer admin.token"
          ? next()
          : res.status(401).json({ error: { code: "AUTH_REQUIRED" } }),
      rateLimiter: (_req, _res, next) => next(),
    }),
  );
  return app;
}

describe("authenticated learning endpoints", () => {
  it("protects every route and never returns source chat", async () => {
    const service = {
      preview: vi.fn().mockResolvedValue({
        candidate: {
          content: "Reusable safe knowledge for Foundation operations.",
          category: "OPERATING_RULE",
          tags: ["operations"],
        },
        approvalToken: "opaque-token",
        expiresAt: 123,
      }),
      approve: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    };
    const app = createApp(service);
    await request(app).get("/learning/records").expect(401);
    const sourceText =
      "A bounded source statement that is only processed transiently.";
    const response = await request(app)
      .post("/learning/preview")
      .set("Authorization", "Bearer admin.token")
      .send({ consent: true, sourceText })
      .expect(200);
    expect(service.preview).toHaveBeenCalledWith({ consent: true, sourceText });
    expect(JSON.stringify(response.body)).not.toContain(sourceText);
  });

  it("exposes approval, list, and deletion through the service contract", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const service = {
      preview: vi.fn(),
      approve: vi.fn().mockResolvedValue({ record: { id }, duplicate: false }),
      list: vi.fn().mockResolvedValue([{ id, content: "Safe record" }]),
      delete: vi.fn().mockResolvedValue({ deleted: true }),
    };
    const app = createApp(service);
    const auth = { Authorization: "Bearer admin.token" };
    await request(app)
      .post("/learning/approve")
      .set(auth)
      .send({ consent: true, candidate: {}, approvalToken: "token" })
      .expect(201);
    await request(app).get("/learning/records").set(auth).expect(200);
    await request(app).delete(`/learning/records/${id}`).set(auth).expect(200);
    expect(service.approve).toHaveBeenCalledTimes(1);
    expect(service.list).toHaveBeenCalledTimes(1);
    expect(service.delete).toHaveBeenCalledWith(id);
  });

  it("preserves domain-specific error status and response shapes", async () => {
    const storageError = new Error("LEARNING_STORAGE_UNAVAILABLE");
    storageError.code = "LEARNING_STORAGE_UNAVAILABLE";
    const service = {
      preview: vi.fn(),
      approve: vi.fn().mockRejectedValue(storageError),
      list: vi.fn().mockRejectedValue(new Error("private provider detail")),
      delete: vi.fn(),
    };
    const app = createApp(service);
    const auth = { Authorization: "Bearer admin.token" };

    const approve = await request(app)
      .post("/learning/approve")
      .set(auth)
      .send({})
      .expect(503);
    expect(approve.body).toEqual({
      error: {
        category: "learning",
        code: "LEARNING_STORAGE_UNAVAILABLE",
      },
    });

    const records = await request(app)
      .get("/learning/records")
      .set(auth)
      .expect(503);
    expect(records.body).toEqual({
      error: { category: "learning", code: "LEARNING_UNAVAILABLE" },
    });
  });
});
