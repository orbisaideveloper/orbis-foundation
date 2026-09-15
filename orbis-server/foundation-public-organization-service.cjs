const LINKED = "LINKED";
const ACTIVE = "ACTIVE";
const OWNER = "OWNER";
const DEFAULT_TDS_RATE_BPS = 200;
const DEFAULT_LEDGER_STORAGE = "CLOUD";

function organizationServiceError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw organizationServiceError(
      `FOUNDATION_ORGANIZATION_${field.toUpperCase()}_REQUIRED`,
    );
  }
  return value.trim();
}

function organizationName(account, requestedName) {
  if (typeof requestedName === "string" && requestedName.trim()) {
    return requestedName.trim();
  }
  return `${requiredText(account?.firstName, "first_name")} ${requiredText(
    account?.lastName,
    "last_name",
  )}`.trim();
}

function publicOrganization(organization) {
  return {
    id: organization.id,
    name: organization.name,
    tdsRateBps: organization.tdsRateBps,
    userLedgerStorage: organization.userLedgerStorage,
    status: organization.status,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  };
}

function createFoundationPublicOrganizationService({ prisma } = {}) {
  if (!prisma || typeof prisma.$transaction !== "function") {
    throw new Error("A Prisma client with $transaction is required.");
  }

  async function ensureOwnerOrganization({
    authUserId,
    account,
    requestedName,
  } = {}) {
    const userId = requiredText(authUserId, "auth_user_id");
    const localAccountId = requiredText(account?.id, "local_account_id");

    if (account?.identityLinkStatus !== LINKED) {
      throw organizationServiceError("FOUNDATION_ORGANIZATION_IDENTITY_NOT_LINKED");
    }

    const orbisIdentityId = requiredText(
      account?.orbisIdentityId,
      "orbis_identity_id",
    );
    const name = organizationName(account, requestedName);

    return prisma.$transaction(async (client) => {
      if (typeof client.$executeRaw !== "function") {
        throw new Error("Transaction client with $executeRaw is required.");
      }

      await client.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
      `;

      const existing =
        await client.foundationAccountingOrganizationMembership.findFirst({
          where: {
            userId,
            role: OWNER,
            status: ACTIVE,
            organization: { status: ACTIVE },
          },
          include: { organization: true },
          orderBy: { createdAt: "asc" },
        });

      if (existing?.organization) {
        return publicOrganization(existing.organization);
      }

      const organization =
        await client.foundationAccountingOrganization.create({
          data: {
            name,
            tdsRateBps: DEFAULT_TDS_RATE_BPS,
            userLedgerStorage: DEFAULT_LEDGER_STORAGE,
            status: ACTIVE,
          },
        });

      await client.foundationAccountingOrganizationMembership.create({
        data: {
          organizationId: organization.id,
          userId,
          role: OWNER,
          status: ACTIVE,
        },
      });

      await client.foundationLotteryAuditEvent.create({
        data: {
          organizationId: organization.id,
          eventType: "PUBLIC_ORGANIZATION_CREATED",
          entityType: "ORGANIZATION",
          entityId: organization.id,
          actorAdminId: `PUBLIC_ACCOUNT:${localAccountId}`,
          metadata: {
            source: "PUBLIC_SIGNUP",
            publicAccountId: localAccountId,
            orbisIdentityId,
          },
        },
      });

      return publicOrganization(organization);
    });
  }

  return { ensureOwnerOrganization };
}

module.exports = {
  createFoundationPublicOrganizationService,
  ACTIVE,
  LINKED,
  OWNER,
};
