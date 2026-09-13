// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createFoundationPublicAccountService,
} = require("../foundation-public-account-service.cjs");

const LOCAL_USER_ID = "foundation-local-user-1";
const DISPLAY_ID = "ORB-U-ABCDEFGH";
const AUTH_EMAIL = "ajay@example.com";
const AUTH_PHONE = "+919876543210";

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
  email: AUTH_EMAIL,
  phone: AUTH_PHONE,
};

const SIGNUP = {
  firstName: "Ajay",
  lastName: "Saha",
  email: AUTH_EMAIL,
  phone: AUTH_PHONE,
};

function linkedAccount() {
  return {
    id: LOCAL_USER_ID,
    authUserId: AUTH_USER.id,
    firstName: SIGNUP.firstName,
    lastName: SIGNUP.lastName,
    email: AUTH_EMAIL,
    phone: AUTH_PHONE,
    phoneCountryCallingCode: null,
    status: "ACTIVE",
    identityLinkStatus: "LINKED",
    orbisIdentityId: "identity-1",
    orbisDisplayId: DISPLAY_ID,
    orbisLifecycle: "active",
    identityLinkReason: "product_reference_match",
  };
}

describe("Foundation public account linkage", () => {
  it("creates one durable local account and links the central identity", async () => {
    const repository = repositoryMock();
    const identityClient = {
      writePerson: vi.fn().mockResolvedValue({
        outcome: "create_provisional",
        orbisIdentityId: "0199f67a-1111-7000-8000-111111111111",
        displayId: DISPLAY_ID,
        lifecycle: "provisional",
        candidateOrbisIdentityIds: [],
        reason: "no_match",
        replayed: false,
      }),
    };
    const service = createFoundationPublicAccountService({
      repository,
      identityClient,
      uuid: () => LOCAL_USER_ID,
    });

    const account = await service.ensureAccountAndIdentity(AUTH_USER, SIGNUP);

    expect(account).toMatchObject({
      id: LOCAL_USER_ID,
      identityLinkStatus: "LINKED",
      orbisDisplayId: DISPLAY_ID,
    });
    expect(identityClient.writePerson).toHaveBeenCalledWith(
      expect.objectContaining({
        localUserId: LOCAL_USER_ID,
        displayName: "Ajay Saha",
        email: AUTH_EMAIL,
        phone: AUTH_PHONE,
      }),
    );
  });

  it("reads the durable account without exposing the auth lookup id", async () => {
    const repository = repositoryMock();
    repository.state.account = linkedAccount();
    const service = createFoundationPublicAccountService({
      repository,
      identityClient: { writePerson: vi.fn() },
    });

    const account = await service.getAccount(AUTH_USER);

    expect(account).toMatchObject({
      id: LOCAL_USER_ID,
      email: AUTH_EMAIL,
      identityLinkStatus: "LINKED",
    });
    expect(account).not.toHaveProperty("authUserId");
    expect(account).not.toHaveProperty("phoneCountryCallingCode");
  });

  it("prefers authenticated contacts over spoofed request contacts", async () => {
    const repository = repositoryMock();
    const identityClient = {
      writePerson: vi.fn().mockResolvedValue({
        outcome: "create_provisional",
        orbisIdentityId: "0199f67a-2222-7000-8000-222222222222",
        displayId: DISPLAY_ID,
        lifecycle: "provisional",
        candidateOrbisIdentityIds: [],
        reason: "no_match",
        replayed: false,
      }),
    };
    const service = createFoundationPublicAccountService({
      repository,
      identityClient,
      uuid: () => LOCAL_USER_ID,
    });

    await service.ensureAccountAndIdentity(AUTH_USER, {
      ...SIGNUP,
      email: "spoof@example.test",
      phone: "+910000000000",
    });

    expect(repository.state.account).toMatchObject({
      email: AUTH_EMAIL,
      phone: AUTH_PHONE,
    });
    expect(identityClient.writePerson).toHaveBeenCalledWith(
      expect.objectContaining({ email: AUTH_EMAIL, phone: AUTH_PHONE }),
    );
  });

  it("reuses the same local account for the same auth user", async () => {
    const repository = repositoryMock();
    repository.state.account = linkedAccount();
    const identityClient = { writePerson: vi.fn() };
    const service = createFoundationPublicAccountService({
      repository,
      identityClient,
    });

    const account = await service.ensureAccountAndIdentity(AUTH_USER, SIGNUP);

    expect(account.id).toBe(LOCAL_USER_ID);
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
