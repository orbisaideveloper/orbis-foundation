// @vitest-environment node

import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createAuthenticatedUserMiddleware,
} = require("../admin-auth.cjs");

function appWith(getUser, dependencies = {}) {
  const createClient = vi.fn(() => ({ auth: { getUser } }));
  const app = express();
  app.get(
    "/user",
    createAuthenticatedUserMiddleware({ createClient, ...dependencies }),
    (req, res) => res.json({ publicUser: req.publicUser }),
  );
  return { app, createClient };
}

beforeEach(() => {
  process.env.SUPABASE_URL = "configured-endpoint";
  process.env.SUPABASE_ANON_KEY = "configured-public-client-value";
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  vi.restoreAllMocks();
});

describe("authenticated public user middleware", () => {
  it("accepts a valid Supabase user without Admin membership or verified email", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "public-user-1",
          email: "user@example.test",
          email_confirmed_at: null,
          app_metadata: {},
        },
      },
      error: null,
    });

    const response = await request(appWith(getUser).app)
      .get("/user")
      .set("Authorization", "Bearer public.token")
      .expect(200);

    expect(response.body.publicUser).toEqual({
      id: "public-user-1",
      email: "user@example.test",
    });
    expect(getUser).toHaveBeenCalledWith("public.token");
  });

  it("fails closed for missing or invalid identity", async () => {
    const invalid = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new Error("expired detail"),
    });
    const { app, createClient } = appWith(invalid);

    await request(app).get("/user").expect(401);
    expect(createClient).not.toHaveBeenCalled();

    const response = await request(app)
      .get("/user")
      .set("Authorization", "Bearer expired.token")
      .expect(401);
    expect(JSON.stringify(response.body)).not.toContain("expired detail");
  });

  it("returns a bounded safe timeout response", async () => {
    const getUser = vi.fn(() => new Promise(() => {}));
    const response = await request(
      appWith(getUser, { identityTimeoutMs: 10 }).app,
    )
      .get("/user")
      .set("Authorization", "Bearer public.token")
      .expect(503);

    expect(response.body).toEqual({
      success: false,
      code: "IDENTITY_TIMEOUT",
      message: "Authentication verification timed out",
    });
  });
});
