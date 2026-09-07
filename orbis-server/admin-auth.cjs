const { createClient } = require("@supabase/supabase-js");

const REQUIRED_ADMIN_EMAIL = "orbisaideveloper@gmail.com";
const ADMIN_IDENTITY_TIMEOUT_MS = 8_000;
const AUTHENTICATION_REQUIRED_MESSAGE = "Authentication required";
const ADMIN_AUTHENTICATION_UNAVAILABLE_MESSAGE =
  "Admin authentication unavailable";

function createIdentityTimeoutError() {
  const error = new Error("ADMIN_IDENTITY_TIMEOUT");
  error.code = "ADMIN_IDENTITY_TIMEOUT";
  return error;
}

function withIdentityTimeout(operation, timeoutMs = ADMIN_IDENTITY_TIMEOUT_MS) {
  let timer;

  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(createIdentityTimeoutError()),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function getBearerToken(authorization) {
  if (typeof authorization !== "string") return null;
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
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

function createIdentityLookup(dependencies = {}) {
  const makeClient = dependencies.createClient || createClient;
  const identityTimeoutMs =
    dependencies.identityTimeoutMs || ADMIN_IDENTITY_TIMEOUT_MS;
  let cachedClient = null;
  let cachedConfiguration = null;

  return async function lookupIdentity(token) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return { state: "UNAVAILABLE" };
    }

    try {
      const configuration = `${supabaseUrl}\0${supabaseAnonKey}`;
      if (!cachedClient || cachedConfiguration !== configuration) {
        cachedClient = makeClient(supabaseUrl, supabaseAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        cachedConfiguration = configuration;
      }

      const { data, error } = await withIdentityTimeout(
        () => cachedClient.auth.getUser(token),
        identityTimeoutMs,
      );
      if (error || !data?.user) {
        return { state: "UNAUTHENTICATED" };
      }
      return { state: "AUTHENTICATED", user: data.user };
    } catch (error) {
      return {
        state: "ERROR",
        timedOut: error?.code === "ADMIN_IDENTITY_TIMEOUT",
      };
    }
  };
}

async function resolveAuthenticatedIdentity(
  req,
  res,
  lookupIdentity,
  {
    logPrefix,
    timeoutCode,
    timeoutMessage,
    unavailableMessage,
  },
) {
  const token = getBearerToken(req.get("Authorization"));
  if (!token) {
    res.status(401).json({
      success: false,
      message: AUTHENTICATION_REQUIRED_MESSAGE,
    });
    return null;
  }

  const identity = await lookupIdentity(token);
  if (identity.state === "UNAVAILABLE") {
    res.status(503).json({
      success: false,
      message: unavailableMessage,
    });
    return null;
  }
  if (identity.state === "UNAUTHENTICATED") {
    res.status(401).json({
      success: false,
      message: AUTHENTICATION_REQUIRED_MESSAGE,
    });
    return null;
  }
  if (identity.state === "ERROR") {
    console.error(
      identity.timedOut
        ? `[${logPrefix}] Identity verification timed out`
        : `[${logPrefix}] Identity verification unavailable`,
    );
    res.status(503).json({
      success: false,
      ...(identity.timedOut ? { code: timeoutCode } : {}),
      message: identity.timedOut ? timeoutMessage : unavailableMessage,
    });
    return null;
  }

  return identity.user;
}

function createAdminAuthMiddleware(dependencies = {}) {
  const lookupIdentity = createIdentityLookup(dependencies);

  return async function requireAuthenticatedAdmin(req, res, next) {
    const user = await resolveAuthenticatedIdentity(
      req,
      res,
      lookupIdentity,
      {
        logPrefix: "AdminAuth",
        timeoutCode: "ADMIN_IDENTITY_TIMEOUT",
        timeoutMessage: "Admin authentication verification timed out",
        unavailableMessage: ADMIN_AUTHENTICATION_UNAVAILABLE_MESSAGE,
      },
    );
    if (!user) return;

    if (!hasVerifiedEmail(user)) {
      return res.status(403).json({
        success: false,
        code: "EMAIL_UNVERIFIED",
        message: "Admin email verification required",
      });
    }

    if (hasServerControlledAdminMembership(user)) {
      req.adminUser = { id: user.id };
      return next();
    }

    if (hasConfiguredAdminEmailMembership(user)) {
      req.adminUser = { id: user.id };
      return next();
    }

    if (user.email === REQUIRED_ADMIN_EMAIL) {
      return res.status(503).json({
        success: false,
        code: "ADMIN_AUTH_CONFIGURATION_MISSING",
        message: ADMIN_AUTHENTICATION_UNAVAILABLE_MESSAGE,
      });
    }

    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  };
}

function createAuthenticatedUserMiddleware(dependencies = {}) {
  const lookupIdentity = createIdentityLookup(dependencies);

  return async function requireAuthenticatedUser(req, res, next) {
    const user = await resolveAuthenticatedIdentity(
      req,
      res,
      lookupIdentity,
      {
        logPrefix: "UserAuth",
        timeoutCode: "IDENTITY_TIMEOUT",
        timeoutMessage: "Authentication verification timed out",
        unavailableMessage: "Authentication unavailable",
      },
    );
    if (!user) return;

    req.publicUser = {
      id: user.id,
      email: typeof user.email === "string" ? user.email : null,
    };
    req.publicVerifiedContact = {
      email: typeof user.email === "string" ? user.email : null,
      emailVerified: Boolean(user.email_confirmed_at),
      phone: typeof user.phone === "string" ? user.phone : null,
      phoneVerified: Boolean(user.phone_confirmed_at),
    };
    return next();
  };
}

module.exports = {
  createAdminAuthMiddleware,
  createAuthenticatedUserMiddleware,
  ADMIN_IDENTITY_TIMEOUT_MS,
  getBearerToken,
  hasConfiguredAdminEmailMembership,
  hasServerControlledAdminMembership,
  hasVerifiedEmail,
  REQUIRED_ADMIN_EMAIL,
  requireAuthenticatedAdmin: createAdminAuthMiddleware(),
  requireAuthenticatedUser: createAuthenticatedUserMiddleware(),
};
