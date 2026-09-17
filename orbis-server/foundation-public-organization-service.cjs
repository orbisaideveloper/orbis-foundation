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

function organizationName(requestedName) {
  return requiredText(requestedName, "name");
}

function legacyAccountOrganizationName(account) {
  const firstName =
    typeof account?.firstName === "string" ? account.firstName.trim() : "";
  const lastName =
    typeof account?.lastName === "string" ? account.lastName.trim() : "";
  return `${firstName} ${lastName}`.trim();
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

    // Organization authorization is based on the authenticated Supabase
    // user and OWNER membership. Central ORBIS identity links independently
    // and must not block a durable Accounting workspace during retry.
    const orbisIdentityId =
      typeof account?.orbisIdentityId === "string" &&
      account.orbisIdentityId.trim()
        ? account.orbisIdentityId.trim()
        : null;

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
        const requested =
          typeof requestedName === "string" ? requestedName.trim() : "";
        const legacyName = legacyAccountOrganizationName(account);

        if (
          requested &&
          legacyName &&
          requested !== legacyName &&
          existing.organization.name === legacyName
        ) {
          const organization =
            await client.foundationAccountingOrganization.update({
              where: { id: existing.organization.id },
              data: { name: requested },
            });

          await client.foundationLotteryAuditEvent.create({
            data: {
              organizationId: organization.id,
              eventType: "PUBLIC_ORGANIZATION_RENAMED",
              entityType: "ORGANIZATION",
              entityId: organization.id,
              actorAdminId: `PUBLIC_ACCOUNT:${localAccountId}`,
              metadata: {
                source: "PUBLIC_WORKSPACE_SETUP",
                publicAccountId: localAccountId,
                orbisIdentityId,
                previousName: legacyName,
              },
            },
          });

          return publicOrganization(organization);
        }

        return publicOrganization(existing.organization);
      }

      const name = organizationName(requestedName);
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
            source: "PUBLIC_WORKSPACE_SETUP",
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
