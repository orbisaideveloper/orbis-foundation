// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createChatRateLimiter,
  validateChatPayload,
} = require("../chat-api-security.cjs");
const { createAdminAuthMiddleware } = require("../admin-auth.cjs");

describe("chat API validation and rate limiting", () => {
  it("rejects unsupported attachments and oversized or invalid messages", () => {
    expect(
      validateChatPayload({
        messages: [{ role: "user", content: "hello" }],
        attachments: [],
      }),
    ).toEqual({ valid: false, code: "ATTACHMENTS_UNSUPPORTED" });
    expect(
      validateChatPayload({
        messages: [{ role: "user", content: "x".repeat(16_001) }],
      }),
    ).toEqual({ valid: false, code: "CHAT_INPUT_INVALID" });
    expect(
      validateChatPayload({
        messages: [{ role: "user", content: "hello" }],
        learningConsent: true,
      }),
    ).toEqual({ valid: false, code: "CHAT_INPUT_INVALID" });
    expect(
      validateChatPayload({
        messages: [{ role: "user", content: "কলকাতা" }],
        pendingClarification: {
          kind: "weather-location",
          originalRequest: "আজকের weather বলো",
          createdAt: 1,
          expiresAt: 2,
        },
      }),
    ).toEqual({ valid: true });
  });

  it("requires a verified Admin identity before applying the per-user limit", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "admin-1",
          email: "admin@example.test",
          email_confirmed_at: "2026-08-24T00:00:00.000Z",
          app_metadata: { role: "admin" },
        },
      },
      error: null,
    });
    const app = express();
    app.use(express.json());
    app.post(
      "/chat",
      createAdminAuthMiddleware({
        createClient: () => ({ auth: { getUser } }),
      }),
      createChatRateLimiter({ maxRequests: 1 }),
      (_req, res) => res.json({ ok: true }),
    );

    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_ANON_KEY;
    process.env.SUPABASE_URL = "configured-endpoint";
    process.env.SUPABASE_ANON_KEY = "configured-public-key";
    try {
      expect((await request(app).post("/chat")).status).toBe(401);
      expect(
        (
          await request(app)
            .post("/chat")
            .set("Authorization", "Bearer valid.token")
        ).status,
      ).toBe(200);
      const limited = await request(app)
        .post("/chat")
        .set("Authorization", "Bearer valid.token");
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe("CHAT_RATE_LIMITED");
    } finally {
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY;
      else process.env.SUPABASE_ANON_KEY = originalKey;
    }
  });
});
