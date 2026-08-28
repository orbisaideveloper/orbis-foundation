// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createRequire } from "node:module";
import request from "supertest";

const require = createRequire(import.meta.url);
const {
  createAdminAuthMiddleware,
  getBearerToken,
  hasServerControlledAdminMembership,
  hasConfiguredAdminEmailMembership,
} = require("../admin-auth.cjs");

const REQUIRED_ADMIN_EMAIL = "orbisaideveloper@gmail.com";
const VERIFIED_AT = "2026-08-23T00:00:00.000Z";

function createApp(getUser, dependencies = {}) {
  const createClient = vi.fn(() => ({ auth: { getUser } }));
  const app = express();
  app.get(
    "/protected",
    createAdminAuthMiddleware({ createClient, ...dependencies }),
    (_req, res) => res.json({ success: true }),
  );
  return { app, createClient };
}

beforeEach(() => {
  process.env.SUPABASE_URL = "configured-endpoint";
  process.env.SUPABASE_ANON_KEY = "configured-public-client-value";
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_EMAIL_ALLOWLIST;
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_EMAIL_ALLOWLIST;
  vi.restoreAllMocks();
});

describe("authenticated Admin middleware", () => {
  it("returns a bounded safe response when identity verification hangs", async () => {
    const getUser = vi.fn(() => new Promise(() => {}));
    const { app } = createApp(getUser, { identityTimeoutMs: 10 });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer valid.token");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      code: "ADMIN_IDENTITY_TIMEOUT",
      message: "Admin authentication verification timed out",
    });
  });

  it("accepts only a strict Bearer header", () => {
    expect(getBearerToken("Bearer valid.jwt-token_1")).toBe(
      "valid.jwt-token_1",
    );
    expect(getBearerToken("Basic token")).toBeNull();
    expect(getBearerToken("Bearer token with spaces")).toBeNull();
    expect(getBearerToken(undefined)).toBeNull();
  });

  it("returns 401 without a token and ignores spoofing inputs", async () => {
    const getUser = vi.fn();
    const { app } = createApp(getUser);
    const response = await request(app)
      .get("/protected?admin=true")
      .set("X-Admin", "true");

    expect(response.status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid or expired token", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new Error("expired"),
    });
    const { app } = createApp(getUser);
    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer expired.token");

    expect(response.status).toBe(401);
    expect(getUser).toHaveBeenCalledWith("expired.token");
    expect(JSON.stringify(response.body)).not.toContain("expired");
  });

  it("returns 403 for a valid non-Admin and ignores user_metadata", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "ordinary-user",
          email: "user@example.test",
          email_confirmed_at: VERIFIED_AT,
          user_metadata: { admin: true, role: "admin" },
          app_metadata: {},
        },
      },
      error: null,
    });
    const { app } = createApp(getUser);
    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer valid.token");

    expect(response.status).toBe(403);
  });

  it("allows a verified user from the server Admin ID allowlist", async () => {
    process.env.ADMIN_USER_IDS = "first-admin, second-admin";
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "second-admin",
          email: "existing-admin@example.test",
          email_confirmed_at: VERIFIED_AT,
          app_metadata: {},
        },
      },
      error: null,
    });
    const { app, createClient } = createApp(getUser);
    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer valid.token");

    expect(response.status).toBe(200);
    expect(createClient).toHaveBeenCalledWith(
      "configured-endpoint",
      "configured-public-client-value",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  });

  it("allows server-controlled app_metadata Admin membership", async () => {
    expect(
      hasServerControlledAdminMembership({
        id: "app-admin",
        app_metadata: { role: "ADMIN" },
      }),
    ).toBe(true);

    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "app-admin",
          email: "trusted-admin@example.test",
          email_confirmed_at: VERIFIED_AT,
          app_metadata: { role: "ADMIN" },
        },
      },
      error: null,
    });
    const { app } = createApp(getUser);
    await request(app)
      .get("/protected")
      .set("Authorization", "Bearer valid.token")
      .expect(200);
    expect(
      hasServerControlledAdminMembership({
        id: "app-system",
        app_metadata: { roles: ["viewer", "system"] },
      }),
    ).toBe(true);
  });

  it("allows only the configured, verified bootstrap Admin email", async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = REQUIRED_ADMIN_EMAIL;
    expect(
      hasConfiguredAdminEmailMembership({
        id: "bootstrap-admin",
        email: REQUIRED_ADMIN_EMAIL,
        email_confirmed_at: VERIFIED_AT,
        app_metadata: {},
      }),
    ).toBe(true);

    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "bootstrap-admin",
          email: REQUIRED_ADMIN_EMAIL,
          email_confirmed_at: VERIFIED_AT,
          app_metadata: {},
        },
      },
      error: null,
    });
    const { app } = createApp(getUser);

    await request(app)
      .get("/protected")
      .set("Authorization", "Bearer valid.token")
      .expect(200);
  });

  it("denies a wrong email and fails closed without the bootstrap allowlist", async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = `wrong@example.test,${REQUIRED_ADMIN_EMAIL}`;
    const wrongEmail = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "wrong-email",
          email: "wrong@example.test",
          email_confirmed_at: VERIFIED_AT,
          app_metadata: {},
        },
      },
      error: null,
    });
    const { app: wrongEmailApp } = createApp(wrongEmail);
    await request(wrongEmailApp)
      .get("/protected")
      .set("Authorization", "Bearer valid.token")
      .expect(403);

    delete process.env.ADMIN_EMAIL_ALLOWLIST;
    const exactEmail = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "bootstrap-admin",
          email: REQUIRED_ADMIN_EMAIL,
          email_confirmed_at: VERIFIED_AT,
          app_metadata: {},
        },
      },
      error: null,
    });
    const { app: missingAllowlistApp } = createApp(exactEmail);
    const missingAllowlistResponse = await request(missingAllowlistApp)
      .get("/protected")
      .set("Authorization", "Bearer valid.token");
    expect(missingAllowlistResponse.status).toBe(503);
    expect(missingAllowlistResponse.body.code).toBe(
      "ADMIN_AUTH_CONFIGURATION_MISSING",
    );
  });

  it("denies unverified email even with Admin ID or app_metadata membership", async () => {
    process.env.ADMIN_USER_IDS = "unverified-admin";
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "unverified-admin",
          email: REQUIRED_ADMIN_EMAIL,
          email_confirmed_at: null,
          app_metadata: { role: "admin" },
        },
      },
      error: null,
    });
    const { app } = createApp(getUser);
    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer valid.token");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      code: "EMAIL_UNVERIFIED",
      message: "Admin email verification required",
    });
  });

  it("fails closed when configuration or the provider is unavailable", async () => {
    const getUser = vi.fn().mockRejectedValue(new Error("provider details"));
    const { app } = createApp(getUser);

    delete process.env.SUPABASE_URL;
    const missingConfig = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer valid.token");
    expect(missingConfig.status).toBe(503);

    process.env.SUPABASE_URL = "configured-endpoint";
    const providerFailure = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer valid.token");
    expect(providerFailure.status).toBe(503);
    expect(JSON.stringify(providerFailure.body)).not.toContain("details");
  });
});
