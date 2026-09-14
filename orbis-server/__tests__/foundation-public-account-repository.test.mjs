// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createFoundationPublicAccountRepository,
} = require("../foundation-public-account-repository.cjs");

const LOCAL_USER_ID = "foundation-local-user-1";
const AUTH_USER_ID = "auth-user-1";
const EMAIL = "ajay@example.com";
const PHONE = "+919876543210";
const NEW_LOCAL_ID = "new-local-id";

function row(overrides = {}) {
  return {
    id: LOCAL_USER_ID,
    authUserId: AUTH_USER_ID,
    firstName: "Ajay",
    lastName: "Saha",
    email: EMAIL,
    phone: PHONE,
    phoneCountryCallingCode: "+91",
    status: "ACTIVE",
    identityLinkStatus: "PENDING",
    orbisIdentityId: null,
    orbisDisplayId: null,
    orbisLifecycle: null,
    identityLinkReason: null,
    createdAt: new Date("2026-09-13T00:00:00.000Z"),
    updatedAt: new Date("2026-09-13T00:00:00.000Z"),
    ...overrides,
  };
}

function prismaMock(results) {
  const queue = [...results];
  const calls = [];
  const $queryRaw = vi.fn(async (strings, ...values) => {
    calls.push({ strings: [...strings], values });
    return queue.shift() ?? [];
  });
  return { $queryRaw, calls };
}

describe("Foundation public account repository", () => {
  it("finds by auth user with a parameterized query", async () => {
    const prisma = prismaMock([[row()]]);
    const repository = createFoundationPublicAccountRepository({ prisma });

    const account = await repository.findByAuthUserId(AUTH_USER_ID);

    expect(account?.id).toBe(LOCAL_USER_ID);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.calls[0].values).toContain(AUTH_USER_ID);
    expect(prisma.calls[0].strings.join("?")).not.toContain(AUTH_USER_ID);
  });

  it("creates once and can return the concurrently existing auth mapping", async () => {
    const existing = row();
    const prisma = prismaMock([[existing]]);
    const repository = createFoundationPublicAccountRepository({ prisma });

    const account = await repository.create({
      id: NEW_LOCAL_ID,
      authUserId: AUTH_USER_ID,
      firstName: "Ajay",
      lastName: "Saha",
      email: EMAIL,
      phone: PHONE,
      phoneCountryCallingCode: "+91",
      status: "ACTIVE",
      identityLinkStatus: "PENDING",
      orbisIdentityId: null,
      orbisDisplayId: null,
      orbisLifecycle: null,
      identityLinkReason: null,
    });

    expect(account.id).toBe(existing.id);
    expect(prisma.calls[0].values).toContain(NEW_LOCAL_ID);
    expect(prisma.calls[0].values).toContain(AUTH_USER_ID);
    expect(prisma.calls[0].strings.join("?")).not.toContain(NEW_LOCAL_ID);
  });

  it("updates only identity-link fields through parameters", async () => {
    const linked = row({
      identityLinkStatus: "LINKED",
      orbisIdentityId: "0199f67a-1111-7000-8000-111111111111",
      orbisDisplayId: "ORB-U-ABCDEFGH",
      orbisLifecycle: "provisional",
      identityLinkReason: "no_match",
    });
    const prisma = prismaMock([[linked]]);
    const repository = createFoundationPublicAccountRepository({ prisma });

    const account = await repository.updateIdentityLink(linked.id, {
      identityLinkStatus: linked.identityLinkStatus,
      orbisIdentityId: linked.orbisIdentityId,
      orbisDisplayId: linked.orbisDisplayId,
      orbisLifecycle: linked.orbisLifecycle,
      identityLinkReason: linked.identityLinkReason,
    });

    expect(account.identityLinkStatus).toBe("LINKED");
    expect(prisma.calls[0].values).toEqual(
      expect.arrayContaining([
        linked.id,
        linked.orbisIdentityId,
        linked.orbisDisplayId,
      ]),
    );
    expect(prisma.calls[0].strings.join("?")).not.toContain(linked.orbisIdentityId);
  });

  it("fails closed when create or update returns no row", async () => {
    const prisma = prismaMock([[], []]);
    const repository = createFoundationPublicAccountRepository({ prisma });

    await expect(
      repository.create({
        id: LOCAL_USER_ID,
        authUserId: AUTH_USER_ID,
        firstName: "Ajay",
        lastName: "Saha",
        email: EMAIL,
        phone: PHONE,
        phoneCountryCallingCode: null,
        status: "ACTIVE",
        identityLinkStatus: "PENDING",
        orbisIdentityId: null,
        orbisDisplayId: null,
        orbisLifecycle: null,
        identityLinkReason: null,
      }),
    ).rejects.toMatchObject({ code: "FOUNDATION_ACCOUNT_CREATE_FAILED" });

    await expect(
      repository.updateIdentityLink("missing", {
        identityLinkStatus: "FAILED",
        orbisIdentityId: null,
        orbisDisplayId: null,
        orbisLifecycle: null,
        identityLinkReason: "failed",
      }),
    ).rejects.toMatchObject({ code: "FOUNDATION_ACCOUNT_NOT_FOUND" });
  });
});
