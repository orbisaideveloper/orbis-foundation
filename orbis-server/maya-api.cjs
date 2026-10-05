const express = require("express");
const { validateMayaRequest, MAYA_CONTRACT_VERSION } = require("./ai/maya/MayaContract.cjs");
const { generateMayaResult } = require("./ai/maya/MayaService.cjs");

function sendFailure(res, status, code) {
  return res.status(status).json({
    version: MAYA_CONTRACT_VERSION, success: false, error: { code },
  });
}

function deadline(operation, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("MAYA_TIMEOUT")), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function createMayaRouter({
  authMiddleware,
  providerManager,
  authorizeCapability,
  allowedOrigins = (process.env.MAYA_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean),
  clock = () => Date.now(),
  timeoutMs = 60_000,
  policyTimeoutMs = 8_000,
  maxRequests = 10,
  maxUsers = 1000,
  maxConcurrent = 20,
} = {}) {
  const router = express.Router();
  const origins = new Set(allowedOrigins);
  const buckets = new Map();
  const busyUsers = new Set();
  const windowMs = 60_000;

  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.vary("Origin");
    const origin = req.get("Origin");
    if (!origin || !origins.has(origin)) return sendFailure(res, 403, "MAYA_ORIGIN_DENIED");
    res.set("Access-Control-Allow-Origin", origin);
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      return res.status(204).end();
    }
    if (req.method !== "POST" || req.path !== "/request") {
      return sendFailure(res, 404, "MAYA_ROUTE_NOT_FOUND");
    }
    if (typeof authorizeCapability !== "function" || typeof authMiddleware !== "function") {
      return sendFailure(res, 503, "MAYA_AUTHORIZATION_UNAVAILABLE");
    }
    return next();
  });

  router.post("/request", express.json({ limit: "32kb", strict: true }), (req, res, next) => {
    if (!req.is("application/json")) return sendFailure(res, 415, "MAYA_JSON_REQUIRED");
    return authMiddleware(req, res, next);
  }, async (req, res) => {
    const userId = req.publicUser?.id;
    if (typeof userId !== "string" || !userId) return sendFailure(res, 401, "MAYA_AUTH_REQUIRED");
    const validation = validateMayaRequest(req.body);
    if (!validation.valid) {
      const status = validation.code === "MAYA_ASTRO_NOT_READY" ? 503 : 400;
      return sendFailure(res, status, validation.code);
    }
    const now = clock();
    for (const [id, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(id);
    }
    const bucket = buckets.get(userId) || { count: 0, resetAt: now + windowMs };
    if (!buckets.has(userId) && buckets.size >= maxUsers) {
      return sendFailure(res, 503, "MAYA_BUSY");
    }
    bucket.count += 1;
    buckets.set(userId, bucket);
    if (bucket.count > maxRequests) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return sendFailure(res, 429, "MAYA_RATE_LIMITED");
    }
    if (busyUsers.has(userId) || busyUsers.size >= maxConcurrent) {
      return sendFailure(res, 429, "MAYA_BUSY");
    }
    busyUsers.add(userId);
    let providerStarted = false;
    try {
      const authorized = await deadline(
        () => authorizeCapability({ userId, projectId: "orbis-maya", capability: validation.data.capability }),
        policyTimeoutMs,
      );
      if (authorized !== true) return sendFailure(res, 403, "MAYA_CAPABILITY_DENIED");
      const pending = Promise.resolve().then(() => generateMayaResult(providerManager, validation.data));
      providerStarted = true;
      // Keep the slot until underlying provider work settles, even after an HTTP timeout.
      void pending.then(() => busyUsers.delete(userId), () => busyUsers.delete(userId));
      const result = await deadline(() => pending, timeoutMs);
      return res.json({
        version: MAYA_CONTRACT_VERSION, success: true,
        capability: validation.data.capability, language: validation.data.language, result,
      });
    } catch (error) {
      const timedOut = error?.message === "MAYA_TIMEOUT" || error?.code === "PROVIDER_TIMEOUT";
      return sendFailure(res, timedOut ? 504 : 503, timedOut ? "MAYA_TIMEOUT" : "MAYA_SERVICE_UNAVAILABLE");
    } finally {
      if (!providerStarted) busyUsers.delete(userId);
    }
  });

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    return sendFailure(res, error?.type === "entity.too.large" ? 413 : 400, "MAYA_INPUT_INVALID");
  });
  return router;
}

module.exports = { createMayaRouter };
