// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createFoundationPublicAccountService,
} = require("../foundation-public-account-service.cjs");

function repositoryMock() {
  const state = { account: null };
  return {
    state,
    findByAuthUserId: vi.fn(async (authUserId) =>
      state.account?.authUserId === authUserId ? state.account : null,
    ),
    create: vi.fn(async (account) => {
      state.account = { ...account };
      return state.account;
    }),
    updateIdentityLink: vi.fn(async (id, patch) => {
      state.account = { ...state.account, ...patch, id };
      return state.account;
    }),
  };
}

const AUTH_USER = {
  id: "auth-user-1",
  email: "ajay@example.com",
  phone: "+919876543210",
};

const SIGNUP = {
  firstName: "Ajay",
  lastName: "Saha",
  email: "ajay@example.com",
  phone: "+919876543210",
};

describe("Foundation public account linkage", () => {
  it("creates one durable local account and links the central identity", async () => {
    const repository = repositoryMock();
    const identityClient = {
      writePerson: vi.fn().mockResolvedValue({
        outcome: "create_provisional",
        orbisIdentityId: "0199f67a-1111-7000-8000-111111111111",
        displayId: "ORB-U-ABCDEFGH",
        lifecycle: "provisional",
        candidateOrbisIdentityIds: [],
        reason: "no_match",
        replayed: false,
      }),
    };
    const service = createFoundationPublicAccountService({
      repository,
      identityClient,
      uuid: () => "foundation-local-user-1",
    });

    const account = await service.ensureAccountAndIdentity(AUTH_USER, SIGNUP);

    expect(account).toMatchObject({
      id: "foundation-local-user-1",
      identityLinkStatus: "LINKED",
      orbisDisplayId: "ORB-U-ABCDEFGH",
    });
    expect(identityClient.writePerson).toHaveBeenCalledWith(
      expect.objectContaining({
        localUserId: "foundation-local-user-1",
        displayName: "Ajay Saha",
        email: SIGNUP.email,
        phone: SIGNUP.phone,
      }),
    );
  });

  it("reuses the same local account for the same auth user", async () => {
    const repository = repositoryMock();
    repository.state.account = {
      id: "foundation-local-user-1",
      authUserId: AUTH_USER.id,
      firstName: "Ajay",
      lastName: "Saha",
      email: SIGNUP.email,
      phone: SIGNUP.phone,
      phoneCountryCallingCode: null,
      status: "ACTIVE",
      identityLinkStatus: "LINKED",
      orbisIdentityId: "identity-1",
      orbisDisplayId: "ORB-U-ABCDEFGH",
      orbisLifecycle: "active",
      identityLinkReason: "product_reference_match",
    };
    const identityClient = { writePerson: vi.fn() };
    const service = createFoundationPublicAccountService({
      repository,
      identityClient,
    });

    const account = await service.ensureAccountAndIdentity(AUTH_USER, SIGNUP);

    expect(account.id).toBe("foundation-local-user-1");
    expect(repository.create).not.toHaveBeenCalled();
    expect(identityClient.writePerson).not.toHaveBeenCalled();
  });

  it("stores review_required without guessing a central identity", async () => {
    const repository = repositoryMock();
    const identityClient = {
      writePerson: vi.fn().mockResolvedValue({
        outcome: "review_required",
        orbisIdentityId: null,
        displayId: null,
        lifecycle: null,
        candidateOrbisIdentityIds: ["candidate-1", "candidate-2"],
        reason: "multiple_identifier_matches",
        replayed: false,
      }),
    };
    const service = createFoundationPublicAccountService({
      repository,
      identityClient,
      uuid: () => "foundation-local-user-2",
    });

    const account = await service.ensureAccountAndIdentity(AUTH_USER, SIGNUP);

    expect(account).toMatchObject({
      identityLinkStatus: "REVIEW_REQUIRED",
      orbisIdentityId: null,
      orbisDisplayId: null,
      identityLinkReason: "multiple_identifier_matches",
    });
  });

  it("marks non-retryable central failures but lets temporary failures retry", async () => {
    const repository = repositoryMock();
    const rejected = Object.assign(new Error("rejected"), {
      code: "ORBIS_IDENTITY_REQUEST_REJECTED",
      retryable: false,
    });
    const identityClient = {
      writePerson: vi.fn().mockRejectedValue(rejected),
    };
    const service = createFoundationPublicAccountService({
      repository,
      identityClient,
      uuid: () => "foundation-local-user-3",
    });

    const account = await service.ensureAccountAndIdentity(AUTH_USER, SIGNUP);
    expect(account).toMatchObject({
      identityLinkStatus: "FAILED",
      identityLinkReason: "ORBIS_IDENTITY_REQUEST_REJECTED",
    });

    repository.state.account.identityLinkStatus = "PENDING";
    identityClient.writePerson.mockRejectedValue(
      Object.assign(new Error("temporary"), { retryable: true }),
    );

    await expect(
      service.ensureAccountAndIdentity(AUTH_USER, SIGNUP),
    ).rejects.toMatchObject({ retryable: true });
  });
});
