// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const VERIFIED_EMAIL = "rahul@example.com";
const {
  createAuthenticatedUserMiddleware,
} = require("../admin-auth.cjs");

beforeEach(() => {
  process.env.SUPABASE_URL = "configured-endpoint";
  process.env.SUPABASE_ANON_KEY = "configured-public-client-value";
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  vi.restoreAllMocks();
});

describe("Accounting public verified-contact context", () => {
  it("keeps the existing publicUser contract and adds verification metadata", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: VERIFIED_EMAIL,
          email_confirmed_at: "2026-09-07T00:00:00.000Z",
          phone: null,
          phone_confirmed_at: null,
        },
      },
      error: null,
    });
    const createClient = vi.fn(() => ({ auth: { getUser } }));
    const app = express();
    app.get(
      "/user",
      createAuthenticatedUserMiddleware({ createClient }),
      (req, res) =>
        res.json({
          publicUser: req.publicUser,
          verifiedContact: req.publicVerifiedContact,
        }),
    );

    const response = await request(app)
      .get("/user")
      .set("Authorization", "Bearer valid.token")
      .expect(200);

    expect(response.body).toEqual({
      publicUser: {
        id: "user-1",
        email: VERIFIED_EMAIL,
      },
      verifiedContact: {
        email: VERIFIED_EMAIL,
        emailVerified: true,
        phone: null,
        phoneVerified: false,
      },
    });
  });
});
