const { randomUUID } = require("node:crypto");
const { createOrbisIdentityClient } = require("./orbis-identity-client.cjs");

const ACTIVE = "ACTIVE";
const PENDING = "PENDING";
const LINKED = "LINKED";
const REVIEW_REQUIRED = "REVIEW_REQUIRED";
const FAILED = "FAILED";

function accountServiceError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw accountServiceError(`FOUNDATION_ACCOUNT_${field.toUpperCase()}_REQUIRED`);
  }
  return value.trim();
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function displayName(account) {
  return `${account.firstName} ${account.lastName}`.trim();
}

function publicAccount(account) {
  return {
    id: account.id,
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
    phone: account.phone,
    status: account.status,
    identityLinkStatus: account.identityLinkStatus,
    orbisIdentityId: account.orbisIdentityId,
    orbisDisplayId: account.orbisDisplayId,
    orbisLifecycle: account.orbisLifecycle,
    identityLinkReason: account.identityLinkReason,
  };
}

function createFoundationPublicAccountService({
  repository,
  identityClient = createOrbisIdentityClient(),
  uuid = randomUUID,
} = {}) {
  if (!repository) throw new Error("A public-account repository is required.");
  if (typeof repository.findByAuthUserId !== "function") {
    throw new Error("findByAuthUserId repository method is required.");
  }
  if (typeof repository.create !== "function") {
    throw new Error("create repository method is required.");
  }
  if (typeof repository.updateIdentityLink !== "function") {
    throw new Error("updateIdentityLink repository method is required.");
  }

  async function getAccount(authUser) {
    const authUserId = requiredText(authUser?.id, "auth_user_id");
    const account = await repository.findByAuthUserId(authUserId);
    return account ? publicAccount(account) : null;
  }

  async function ensureLocalAccount(authUser, input) {
    const authUserId = requiredText(authUser?.id, "auth_user_id");
    const existing = await repository.findByAuthUserId(authUserId);
    if (existing) return existing;

    const account = {
      id: uuid(),
      authUserId,
      firstName: requiredText(input?.firstName, "first_name"),
      lastName: requiredText(input?.lastName, "last_name"),
      email: requiredText(authUser?.email || input?.email, "email"),
      phone: requiredText(authUser?.phone || input?.phone, "phone"),
      phoneCountryCallingCode: optionalText(input?.phoneCountryCallingCode),
      status: ACTIVE,
      identityLinkStatus: PENDING,
      orbisIdentityId: null,
      orbisDisplayId: null,
      orbisLifecycle: null,
      identityLinkReason: null,
    };

    return repository.create(account);
  }

  async function linkCentralIdentity(account) {
    const result = await identityClient.writePerson({
      localUserId: account.id,
      displayName: displayName(account),
      email: account.email,
      phone: account.phone,
      phoneCountryCallingCode: account.phoneCountryCallingCode,
      actorReference: "foundation-signup",
      roles: ["user"],
    });

    if (result.outcome === "review_required") {
      return repository.updateIdentityLink(account.id, {
        identityLinkStatus: REVIEW_REQUIRED,
        orbisIdentityId: null,
        orbisDisplayId: null,
        orbisLifecycle: null,
        identityLinkReason: result.reason,
      });
    }

    return repository.updateIdentityLink(account.id, {
      identityLinkStatus: LINKED,
      orbisIdentityId: result.orbisIdentityId,
      orbisDisplayId: result.displayId,
      orbisLifecycle: result.lifecycle,
      identityLinkReason: result.reason,
    });
  }

  async function ensureAccountAndIdentity(authUser, input) {
    const account = await ensureLocalAccount(authUser, input);

    if (account.identityLinkStatus === LINKED) {
      return publicAccount(account);
    }
    if (account.identityLinkStatus === REVIEW_REQUIRED) {
      return publicAccount(account);
    }

    try {
      const linked = await linkCentralIdentity(account);
      return publicAccount(linked);
    } catch (error) {
      if (error?.retryable === false) {
        const failed = await repository.updateIdentityLink(account.id, {
          identityLinkStatus: FAILED,
          orbisIdentityId: null,
          orbisDisplayId: null,
          orbisLifecycle: null,
          identityLinkReason: error.code || "IDENTITY_LINK_FAILED",
        });
        return publicAccount(failed);
      }
      throw error;
    }
  }

  return {
    getAccount,
    ensureLocalAccount,
    linkCentralIdentity,
    ensureAccountAndIdentity,
  };
}

module.exports = {
  createFoundationPublicAccountService,
  ACTIVE,
  PENDING,
  LINKED,
  REVIEW_REQUIRED,
  FAILED,
};
