// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createFoundationPublicOrganizationService,
} = require("../foundation-public-organization-service.cjs");

const AUTH_USER_ID = "auth-user-1";
const LOCAL_ACCOUNT_ID = "foundation-local-user-1";
const ORBIS_IDENTITY_ID = "0199f67a-1111-7000-8000-111111111111";
const ORGANIZATION_ID = "organization-1";
const ORGANIZATION_NAME = "Ajay Books";

const LINKED_ACCOUNT = {
  id: LOCAL_ACCOUNT_ID,
  firstName: "Ajay",
  lastName: "Saha",
  identityLinkStatus: "LINKED",
  orbisIdentityId: ORBIS_IDENTITY_ID,
};

function organizationRow(overrides = {}) {
  return {
    id: ORGANIZATION_ID,
    name: ORGANIZATION_NAME,
    tdsRateBps: 200,
    userLedgerStorage: "CLOUD",
    status: "ACTIVE",
    createdAt: new Date("2026-09-13T00:00:00.000Z"),
    updatedAt: new Date("2026-09-13T00:00:00.000Z"),
    ...overrides,
  };
}

function prismaMock({ existingMembership = null } = {}) {
  const organization = organizationRow();
  const client = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    foundationAccountingOrganizationMembership: {
      findFirst: vi.fn().mockResolvedValue(existingMembership),
      create: vi.fn().mockResolvedValue({ id: "membership-1" }),
    },
    foundationAccountingOrganization: {
      create: vi.fn().mockResolvedValue(organization),
      update: vi.fn().mockImplementation(async ({ data }) => ({
        ...organization,
        ...data,
      })),
    },
    foundationLotteryAuditEvent: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (operation) => operation(client)),
  };
  return { prisma, client, organization };
}

describe("Foundation public OWNER organization bootstrap", () => {
  it("creates one organization, OWNER membership and public audit event", async () => {
    const { prisma, client } = prismaMock();
    const service = createFoundationPublicOrganizationService({ prisma });

    const result = await service.ensureOwnerOrganization({
      authUserId: AUTH_USER_ID,
      account: LINKED_ACCOUNT,
      requestedName: ORGANIZATION_NAME,
    });

    expect(result).toMatchObject({
      id: ORGANIZATION_ID,
      name: ORGANIZATION_NAME,
      status: "ACTIVE",
    });
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(
      client.foundationAccountingOrganizationMembership.findFirst,
    ).toHaveBeenCalledWith({
      where: {
        userId: AUTH_USER_ID,
        role: "OWNER",
        status: "ACTIVE",
        organization: { status: "ACTIVE" },
      },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
    expect(client.foundationAccountingOrganization.create).toHaveBeenCalledWith({
      data: {
        name: ORGANIZATION_NAME,
        tdsRateBps: 200,
        userLedgerStorage: "CLOUD",
        status: "ACTIVE",
      },
    });
    expect(
      client.foundationAccountingOrganizationMembership.create,
    ).toHaveBeenCalledWith({
      data: {
        organizationId: ORGANIZATION_ID,
        userId: AUTH_USER_ID,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    expect(client.foundationLotteryAuditEvent.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORGANIZATION_ID,
        eventType: "PUBLIC_ORGANIZATION_CREATED",
        entityType: "ORGANIZATION",
        entityId: ORGANIZATION_ID,
        actorAdminId: `PUBLIC_ACCOUNT:${LOCAL_ACCOUNT_ID}`,
        metadata: {
          source: "PUBLIC_WORKSPACE_SETUP",
          publicAccountId: LOCAL_ACCOUNT_ID,
          orbisIdentityId: ORBIS_IDENTITY_ID,
        },
      },
    });
  });

  it("reuses an existing active OWNER organization after the user lock", async () => {
    const existingOrganization = organizationRow({ name: "Existing Org" });
    const { prisma, client } = prismaMock({
      existingMembership: {
        id: "membership-existing",
        organization: existingOrganization,
      },
    });
    const service = createFoundationPublicOrganizationService({ prisma });

    const result = await service.ensureOwnerOrganization({
      authUserId: AUTH_USER_ID,
      account: LINKED_ACCOUNT,
    });

    expect(result.name).toBe("Existing Org");
    expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    expect(client.foundationAccountingOrganization.create).not.toHaveBeenCalled();
    expect(
      client.foundationAccountingOrganizationMembership.create,
    ).not.toHaveBeenCalled();
    expect(client.foundationLotteryAuditEvent.create).not.toHaveBeenCalled();
  });

  it("requires an explicit business name before creating a new organization", async () => {
    const { prisma, client } = prismaMock();
    const service = createFoundationPublicOrganizationService({ prisma });

    await expect(
      service.ensureOwnerOrganization({
        authUserId: AUTH_USER_ID,
        account: LINKED_ACCOUNT,
      }),
    ).rejects.toMatchObject({
      code: "FOUNDATION_ORGANIZATION_NAME_REQUIRED",
    });

    expect(client.foundationAccountingOrganization.create).not.toHaveBeenCalled();
  });

  it("renames only the legacy personal-name owner organization on explicit workspace setup", async () => {
    const existingOrganization = organizationRow({ name: "Ajay Saha" });
    const { prisma, client } = prismaMock({
      existingMembership: {
        id: "membership-existing",
        organization: existingOrganization,
      },
    });
    const service = createFoundationPublicOrganizationService({ prisma });

    const result = await service.ensureOwnerOrganization({
      authUserId: AUTH_USER_ID,
      account: LINKED_ACCOUNT,
      requestedName: ORGANIZATION_NAME,
    });

    expect(client.foundationAccountingOrganization.update).toHaveBeenCalledWith({
      where: { id: ORGANIZATION_ID },
      data: { name: ORGANIZATION_NAME },
    });
    expect(result.name).toBe(ORGANIZATION_NAME);
    expect(client.foundationLotteryAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        eventType: "PUBLIC_ORGANIZATION_RENAMED",
        actorAdminId: `PUBLIC_ACCOUNT:${LOCAL_ACCOUNT_ID}`,
        metadata: expect.objectContaining({
          source: "PUBLIC_WORKSPACE_SETUP",
          previousName: "Ajay Saha",
        }),
      }),
    });
  });

  it("does not create an organization until Central ORBIS identity is linked", async () => {
    const { prisma } = prismaMock();
    const service = createFoundationPublicOrganizationService({ prisma });

    await expect(
      service.ensureOwnerOrganization({
        authUserId: AUTH_USER_ID,
        account: {
          ...LINKED_ACCOUNT,
          identityLinkStatus: "REVIEW_REQUIRED",
          orbisIdentityId: null,
        },
      }),
    ).rejects.toMatchObject({
      code: "FOUNDATION_ORGANIZATION_IDENTITY_NOT_LINKED",
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
