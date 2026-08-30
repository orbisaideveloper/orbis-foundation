// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createLearningRouter } = require("../learning-api.cjs");
const ADMIN_AUTH_HEADER = "Authorization";
const ADMIN_TOKEN = "Bearer admin.token";
const RECORDS_PATH = "/learning/records";

function createApp(service) {
  const app = express();
  app.use(express.json());
  app.use(
    "/learning",
    createLearningRouter({
      service,
      authMiddleware: (req, res, next) =>
        req.get(ADMIN_AUTH_HEADER) === ADMIN_TOKEN
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
    await request(app).get(RECORDS_PATH).expect(401);
    await request(app).get("/learning/review-patterns").expect(401);
    const sourceText =
      "A bounded source statement that is only processed transiently.";
    const response = await request(app)
      .post("/learning/preview")
      .set(ADMIN_AUTH_HEADER, ADMIN_TOKEN)
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
    const auth = { [ADMIN_AUTH_HEADER]: ADMIN_TOKEN };
    await request(app)
      .post("/learning/approve")
      .set(auth)
      .send({ consent: true, candidate: {}, approvalToken: "token" })
      .expect(201);
    await request(app).get(RECORDS_PATH).set(auth).expect(200);
    await request(app).delete(`/learning/records/${id}`).set(auth).expect(200);
    expect(service.approve).toHaveBeenCalledTimes(1);
    expect(service.list).toHaveBeenCalledTimes(1);
    expect(service.delete).toHaveBeenCalledWith(id);
  });

  it("accepts only the service's metadata-only event result after authentication", async () => {
    const eventId = "11111111-1111-4111-8111-111111111111";
    const service = {
      preview: vi.fn(),
      approve: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
      recordEventBatch: vi.fn().mockResolvedValue({
        accepted: 1,
        duplicates: 0,
        events: [{ eventId, duplicate: false }],
      }),
    };
    const app = createApp(service);
    const body = {
      events: [
        {
          eventId,
          kind: "decision-feedback",
          occurredAt: "2026-08-29T12:00:00.000Z",
          decision: {
            intent: "live-information",
            route: "web-search",
            confidence: "high",
            evidenceRequired: true,
            reason: "time-sensitive-request",
          },
          outcome: "failed",
          feedbackCode: "missing-evidence",
        },
      ],
    };
    await request(app).post("/learning/events").send(body).expect(401);
    const response = await request(app)
      .post("/learning/events")
      .set(ADMIN_AUTH_HEADER, ADMIN_TOKEN)
      .send(body)
      .expect(202);
    expect(response.body).toEqual({
      accepted: 1,
      duplicates: 0,
      events: [{ eventId, duplicate: false }],
    });
    expect(service.recordEventBatch).toHaveBeenCalledWith(body);
    expect(JSON.stringify(response.body)).not.toContain("sourceText");
  });

  it("exposes only authenticated, metadata-only review patterns and deterministic previews", async () => {
    const pattern = {
      route: "web-search",
      intent: "live-information",
      confidence: "high",
      evidenceRequired: true,
      reason: "time-sensitive-request",
      outcome: "failed",
      feedbackCode: "missing-evidence",
    };
    const service = {
      preview: vi.fn(),
      approve: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
      listReviewPatterns: vi.fn().mockResolvedValue([
        {
          ...pattern,
          occurrences: 2,
          firstOccurredAt: "2026-08-29T12:00:00.000Z",
          lastOccurredAt: "2026-08-30T12:00:00.000Z",
        },
      ]),
      previewReviewPattern: vi.fn().mockResolvedValue({
        candidate: {
          content:
            "Time-sensitive responses require evidence-backed verification before final delivery.",
          category: "OPERATING_RULE",
          tags: ["evidence", "verification"],
        },
        approvalToken: "opaque-token",
        expiresAt: 123,
      }),
    };
    const app = createApp(service);
    const auth = { [ADMIN_AUTH_HEADER]: ADMIN_TOKEN };

    const list = await request(app)
      .get("/learning/review-patterns")
      .set(auth)
      .expect(200);
    expect(list.body.patterns).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain("sourceText");
    expect(JSON.stringify(list.body)).not.toContain("eventId");

    const preview = await request(app)
      .post("/learning/review-patterns/preview")
      .set(auth)
      .send({ consent: true, pattern })
      .expect(200);
    expect(preview.body).not.toHaveProperty("sourceText");
    expect(service.previewReviewPattern).toHaveBeenCalledWith({
      consent: true,
      pattern,
    });
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
    const auth = { [ADMIN_AUTH_HEADER]: ADMIN_TOKEN };

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
      .get(RECORDS_PATH)
      .set(auth)
      .expect(503);
    expect(records.body).toEqual({
      error: { category: "learning", code: "LEARNING_UNAVAILABLE" },
    });
  });

  it("returns a not-found response for a stale review pattern", async () => {
    const patternError = new Error("LEARNING_PATTERN_NOT_FOUND");
    patternError.code = "LEARNING_PATTERN_NOT_FOUND";
    const service = {
      preview: vi.fn(),
      approve: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
      previewReviewPattern: vi.fn().mockRejectedValue(patternError),
    };
    const app = createApp(service);
    const response = await request(app)
      .post("/learning/review-patterns/preview")
      .set(ADMIN_AUTH_HEADER, ADMIN_TOKEN)
      .send({ consent: true, pattern: {} })
      .expect(404);
    expect(response.body).toEqual({
      error: { category: "learning", code: "LEARNING_PATTERN_NOT_FOUND" },
    });
  });
});
