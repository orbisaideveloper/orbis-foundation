const CAPABILITIES = new Set(["general.chat", "dream.analysis", "astro.interpretation"]);
const { logEvent } = require("./MayaDiagnostics.cjs");
function policyError(code) { const error = new Error(code); error.code = code; return error; }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTITY = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function createMayaAuthorization({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 7000 } = {}) {
  let target, issuer;
  try {
    target = new URL(env.MAYA_MEMBERSHIP_URL);
    issuer = new URL(env.SUPABASE_URL).origin;
    if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash ||
        new URL(issuer).protocol !== "https:" || !env.MAYA_MEMBERSHIP_SERVICE_KEY || !env.MAYA_MEMBERSHIP_SOURCE_PROJECT_ID) return undefined;
  } catch { return undefined; }
  return async function authorize({ userId, projectId, capability }) {
    if (!UUID.test(userId) || projectId !== "orbis-maya" || !CAPABILITIES.has(capability)) return false;
    const controller = new AbortController();
    const startedAt = Date.now();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(target.href, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { "content-type": "application/json", "x-orbis-service-key": env.MAYA_MEMBERSHIP_SERVICE_KEY },
        body: JSON.stringify({ version: "maya.access.v1", sourceProjectId: env.MAYA_MEMBERSHIP_SOURCE_PROJECT_ID, authIssuer: issuer, userId, projectId, capability }),
      });
      logEvent("policy.http", { status: response.status, durationMs: Date.now() - startedAt });
      if (!response.ok) throw policyError("MAYA_POLICY_UNAVAILABLE");
      const body = await response.json();
      if (body?.version !== "maya.access.v1" || body.authIssuer !== issuer ||
          body.userId !== userId || body.projectId !== projectId || body.capability !== capability ||
          typeof body.allowed !== "boolean" || (body.allowed && !IDENTITY.test(body.orbisIdentityId))) {
        logEvent("policy.failed", { reason: "POLICY_RESPONSE_INVALID" });
        throw policyError("MAYA_POLICY_UNAVAILABLE");
      }
      return body.allowed;
    } catch {
      const code = controller.signal.aborted ? "MAYA_POLICY_TIMEOUT" : "MAYA_POLICY_UNAVAILABLE";
      logEvent("policy.failed", { code, durationMs: Date.now() - startedAt });
      throw policyError(code);
    } finally { clearTimeout(timer); }
  };
}
module.exports = { createMayaAuthorization };
