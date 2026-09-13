const DEFAULT_TIMEOUT_MS = 8_000;
const OBSERVED_ASSURANCE = "observed";
const VALID_OUTCOMES = new Set([
  "create_provisional",
  "match",
  "review_required",
]);

function identityClientError(code, { retryable = false, status = null } = {}) {
  const error = new Error(code);
  error.code = code;
  error.retryable = retryable;
  if (status !== null) error.status = status;
  return error;
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw identityClientError(`ORBIS_IDENTITY_${field.toUpperCase()}_REQUIRED`);
  }
  return value.trim();
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function configuredIdentityService(env) {
  const url = requiredText(env.ORBIS_IDENTITY_WRITE_URL, "write_url");
  const serviceKey = requiredText(
    env.ORBIS_IDENTITY_SERVICE_KEY,
    "service_key",
  );
  const projectId = requiredText(env.ORBIS_PROJECT_ID, "project_id");

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw identityClientError("ORBIS_IDENTITY_WRITE_URL_INVALID");
  }
  if (parsedUrl.protocol !== "https:") {
    throw identityClientError("ORBIS_IDENTITY_WRITE_URL_INVALID");
  }

  return { url: parsedUrl.toString(), serviceKey, projectId };
}

async function responsePayload(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeWriteResponse(payload) {
  if (!payload || typeof payload !== "object") {
    throw identityClientError("ORBIS_IDENTITY_RESPONSE_INVALID", {
      retryable: true,
    });
  }

  if (!VALID_OUTCOMES.has(payload.outcome)) {
    throw identityClientError("ORBIS_IDENTITY_RESPONSE_INVALID", {
      retryable: true,
    });
  }

  const candidates = Array.isArray(payload.candidateOrbisIdentityIds)
    ? payload.candidateOrbisIdentityIds.filter(
        (value) => typeof value === "string" && value.length > 0,
      )
    : [];

  const result = {
    outcome: payload.outcome,
    orbisIdentityId: optionalText(payload.orbisIdentityId),
    displayId: optionalText(payload.displayId),
    lifecycle: optionalText(payload.lifecycle),
    candidateOrbisIdentityIds: candidates,
    reason: optionalText(payload.reason),
    replayed: payload.replayed === true,
  };

  if (
    result.outcome !== "review_required" &&
    (!result.orbisIdentityId || !result.displayId || !result.lifecycle)
  ) {
    throw identityClientError("ORBIS_IDENTITY_RESPONSE_INVALID", {
      retryable: true,
    });
  }

  return result;
}

function errorFromResponse(response, payload) {
  const centralCode = optionalText(payload?.error);
  const status = response.status;

  if (status === 409 && centralCode === "idempotency_conflict") {
    return identityClientError("ORBIS_IDENTITY_IDEMPOTENCY_CONFLICT", {
      retryable: false,
      status,
    });
  }

  if (status === 409 && centralCode === "identity_action_pending") {
    return identityClientError("ORBIS_IDENTITY_ACTION_PENDING", {
      retryable: true,
      status,
    });
  }

  if (status === 400 || status === 401 || status === 403) {
    return identityClientError("ORBIS_IDENTITY_REQUEST_REJECTED", {
      retryable: false,
      status,
    });
  }

  return identityClientError("ORBIS_IDENTITY_TEMPORARY_FAILURE", {
    retryable: status >= 500,
    status,
  });
}

function createOrbisIdentityClient({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw identityClientError("ORBIS_IDENTITY_FETCH_UNAVAILABLE");
  }

  async function writePerson({
    localUserId,
    displayName,
    email,
    phone,
    phoneCountryCallingCode,
    actorReference = "foundation-signup",
    roles = ["user"],
  }) {
    const config = configuredIdentityService(env);
    const normalizedLocalUserId = requiredText(localUserId, "local_user_id");
    const normalizedDisplayName = requiredText(displayName, "display_name");
    const normalizedActorReference = requiredText(
      actorReference,
      "actor_reference",
    );
    const normalizedRoles = Array.isArray(roles)
      ? [...new Set(roles.map(optionalText).filter(Boolean))].sort()
      : [];

    if (!normalizedRoles.length) {
      throw identityClientError("ORBIS_IDENTITY_ROLES_REQUIRED");
    }

    const body = {
      sourceProjectId: config.projectId,
      idempotencyKey: `foundation:user:${normalizedLocalUserId}:identity-v1`,
      actorReference: normalizedActorReference,
      subjectKind: "person",
      displayName: normalizedDisplayName,
      ...(optionalText(email)
        ? { email: optionalText(email), emailAssurance: OBSERVED_ASSURANCE }
        : {}),
      ...(optionalText(phone)
        ? {
            phone: optionalText(phone),
            phoneAssurance: OBSERVED_ASSURANCE,
            ...(optionalText(phoneCountryCallingCode)
              ? { phoneCountryCallingCode: optionalText(phoneCountryCallingCode) }
              : {}),
          }
        : {}),
      source: {
        projectId: config.projectId,
        localEntityType: "user",
        localEntityId: normalizedLocalUserId,
        roles: normalizedRoles,
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();

    let response;
    try {
      response = await fetchImpl(config.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-orbis-service-key": config.serviceKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw identityClientError("ORBIS_IDENTITY_TEMPORARY_FAILURE", {
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }

    const payload = await responsePayload(response);

    if (response.status === 409 && payload?.outcome === "review_required") {
      return normalizeWriteResponse(payload);
    }

    if (!response.ok) {
      throw errorFromResponse(response, payload);
    }

    return normalizeWriteResponse(payload);
  }

  return { writePerson };
}

module.exports = {
  createOrbisIdentityClient,
  DEFAULT_TIMEOUT_MS,
  OBSERVED_ASSURANCE,
};
