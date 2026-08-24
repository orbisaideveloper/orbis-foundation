const { createClient } = require("@supabase/supabase-js");

const REQUIRED_ADMIN_EMAIL = "orbisaideveloper@gmail.com";

function getBearerToken(authorization) {
  if (typeof authorization !== "string") return null;
  const match = authorization.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  return match?.[1] || null;
}

function configuredAdminIds() {
  return new Set(
    (process.env.ADMIN_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

function configuredAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAIL_ALLOWLIST || "")
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email === REQUIRED_ADMIN_EMAIL),
  );
}

function hasVerifiedEmail(user) {
  return (
    typeof user?.email === "string" &&
    typeof user.email_confirmed_at === "string" &&
    user.email_confirmed_at.length > 0
  );
}

function hasConfiguredAdminEmailMembership(user) {
  return (
    hasVerifiedEmail(user) &&
    user.email === REQUIRED_ADMIN_EMAIL &&
    configuredAdminEmails().has(user.email)
  );
}

function hasServerControlledAdminMembership(user) {
  if (!user || typeof user.id !== "string") return false;
  if (configuredAdminIds().has(user.id)) return true;

  const metadata = user.app_metadata;
  if (!metadata || typeof metadata !== "object") return false;
  if (metadata.admin === true) return true;
  if (
    typeof metadata.role === "string" &&
    ["admin", "system"].includes(metadata.role.toLowerCase())
  ) {
    return true;
  }
  return (
    Array.isArray(metadata.roles) &&
    metadata.roles.some(
      (role) =>
        typeof role === "string" &&
        ["admin", "system"].includes(role.toLowerCase()),
    )
  );
}

function createAdminAuthMiddleware(dependencies = {}) {
  const makeClient = dependencies.createClient || createClient;
  let cachedClient = null;
  let cachedConfiguration = null;

  return async function requireAuthenticatedAdmin(req, res, next) {
    const token = getBearerToken(req.get("Authorization"));
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(503).json({
        success: false,
        message: "Admin authentication unavailable",
      });
    }

    try {
      const configuration = `${supabaseUrl}\0${supabaseAnonKey}`;
      if (!cachedClient || cachedConfiguration !== configuration) {
        cachedClient = makeClient(supabaseUrl, supabaseAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        cachedConfiguration = configuration;
      }

      const { data, error } = await cachedClient.auth.getUser(token);
      if (error || !data?.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (!hasVerifiedEmail(data.user)) {
        return res.status(403).json({
          success: false,
          code: "EMAIL_UNVERIFIED",
          message: "Admin email verification required",
        });
      }

      if (hasServerControlledAdminMembership(data.user)) {
        req.adminUser = { id: data.user.id };
        return next();
      }

      if (hasConfiguredAdminEmailMembership(data.user)) {
        req.adminUser = { id: data.user.id };
        return next();
      }

      if (data.user.email === REQUIRED_ADMIN_EMAIL) {
        return res.status(503).json({
          success: false,
          code: "ADMIN_AUTH_CONFIGURATION_MISSING",
          message: "Admin authentication unavailable",
        });
      }

      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    } catch {
      console.error("[AdminAuth] Identity verification unavailable");
      return res.status(503).json({
        success: false,
        message: "Admin authentication unavailable",
      });
    }
  };
}

module.exports = {
  createAdminAuthMiddleware,
  getBearerToken,
  hasConfiguredAdminEmailMembership,
  hasServerControlledAdminMembership,
  hasVerifiedEmail,
  REQUIRED_ADMIN_EMAIL,
  requireAuthenticatedAdmin: createAdminAuthMiddleware(),
};
