// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createOrbisIdentityClient,
  OBSERVED_ASSURANCE,
} = require("../orbis-identity-client.cjs");

const PROJECT_ID = "orbis-foundation";
const ENV = {
  ORBIS_IDENTITY_WRITE_URL:
    "https://example.supabase.co/functions/v1/orbis-identity-write",
  ORBIS_IDENTITY_SERVICE_KEY: "server-secret",
  ORBIS_PROJECT_ID: PROJECT_ID,
};

function response(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue(payload),
  };
}

function linkedPayload(overrides = {}) {
  return {
    outcome: "create_provisional",
    orbisIdentityId: "0199f67a-1111-7000-8000-111111111111",
    displayId: "ORB-U-ABCDEFGH",
    lifecycle: "provisional",
    candidateOrbisIdentityIds: [],
    reason: "no_strong_identifier",
    replayed: false,
    ...overrides,
  };
}

describe("Central ORBIS identity client", () => {
  it("sends a stable server-only Foundation person observation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, linkedPayload()));
    const client = createOrbisIdentityClient({ env: ENV, fetchImpl });

    const result = await client.writePerson({
      localUserId: "foundation-user-1",
      displayName: "Ajay Saha",
      email: "Ajay@example.com",
      phone: "9876543210",
      phoneCountryCallingCode: "+91",
    });

    expect(result).toMatchObject({
      outcome: "create_provisional",
      displayId: "ORB-U-ABCDEFGH",
      lifecycle: "provisional",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe(ENV.ORBIS_IDENTITY_WRITE_URL);
    expect(request.method).toBe("POST");
    expect(request.headers).toEqual({
      "content-type": "application/json",
      "x-orbis-service-key": ENV.ORBIS_IDENTITY_SERVICE_KEY,
    });

    expect(JSON.parse(request.body)).toEqual({
      sourceProjectId: PROJECT_ID,
      idempotencyKey: "foundation:user:foundation-user-1:identity-v1",
      actorReference: "foundation-signup",
      subjectKind: "person",
      displayName: "Ajay Saha",
      email: "Ajay@example.com",
      emailAssurance: OBSERVED_ASSURANCE,
      phone: "9876543210",
      phoneAssurance: OBSERVED_ASSURANCE,
      phoneCountryCallingCode: "+91",
      source: {
        projectId: PROJECT_ID,
        localEntityType: "user",
        localEntityId: "foundation-user-1",
        roles: ["user"],
      },
    });
  });

  it("treats review_required as a valid non-linked result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response(409, {
        outcome: "review_required",
        orbisIdentityId: null,
        displayId: null,
        lifecycle: null,
        candidateOrbisIdentityIds: [
          "0199f67a-2222-7000-8000-222222222222",
        ],
        reason: "multiple_identifier_matches",
        replayed: false,
      }),
    );
    const client = createOrbisIdentityClient({ env: ENV, fetchImpl });

    await expect(
      client.writePerson({
        localUserId: "foundation-user-2",
        displayName: "Review User",
        email: "review@example.com",
      }),
    ).resolves.toMatchObject({
      outcome: "review_required",
      orbisIdentityId: null,
      reason: "multiple_identifier_matches",
    });
  });

  it("never converts an idempotency conflict into a random retry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response(409, { error: "idempotency_conflict" }),
    );
    const client = createOrbisIdentityClient({ env: ENV, fetchImpl });

    await expect(
      client.writePerson({
        localUserId: "foundation-user-3",
        displayName: "Conflict User",
      }),
    ).rejects.toMatchObject({
      code: "ORBIS_IDENTITY_IDEMPOTENCY_CONFLICT",
      retryable: false,
      status: 409,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("marks temporary network failure retryable with the same request", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network unavailable"));
    const client = createOrbisIdentityClient({ env: ENV, fetchImpl });

    await expect(
      client.writePerson({
        localUserId: "foundation-user-4",
        displayName: "Retry User",
      }),
    ).rejects.toMatchObject({
      code: "ORBIS_IDENTITY_TEMPORARY_FAILURE",
      retryable: true,
    });
  });

  it("fails closed when server identity configuration is missing", async () => {
    const fetchImpl = vi.fn();
    const client = createOrbisIdentityClient({
      env: { ORBIS_PROJECT_ID: PROJECT_ID },
      fetchImpl,
    });

    await expect(
      client.writePerson({
        localUserId: "foundation-user-5",
        displayName: "Config User",
      }),
    ).rejects.toMatchObject({
      code: "ORBIS_IDENTITY_WRITE_URL_REQUIRED",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
