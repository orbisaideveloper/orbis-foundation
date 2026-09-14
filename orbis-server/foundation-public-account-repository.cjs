function repositoryError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function createFoundationPublicAccountRepository({ prisma } = {}) {
  if (!prisma || typeof prisma.$queryRaw !== "function") {
    throw new Error("A Prisma client with $queryRaw is required.");
  }

  async function findByAuthUserId(authUserId) {
    const rows = await prisma.$queryRaw`
      SELECT
        "id",
        "authUserId",
        "firstName",
        "lastName",
        "email",
        "phone",
        "phoneCountryCallingCode",
        "status",
        "identityLinkStatus",
        "orbisIdentityId",
        "orbisDisplayId",
        "orbisLifecycle",
        "identityLinkReason",
        "createdAt",
        "updatedAt"
      FROM "FoundationPublicAccount"
      WHERE "authUserId" = ${authUserId}
      LIMIT 1
    `;

    return firstRow(rows);
  }

  async function create(account) {
    const rows = await prisma.$queryRaw`
      WITH inserted AS (
        INSERT INTO "FoundationPublicAccount" (
          "id",
          "authUserId",
          "firstName",
          "lastName",
          "email",
          "phone",
          "phoneCountryCallingCode",
          "status",
          "identityLinkStatus",
          "orbisIdentityId",
          "orbisDisplayId",
          "orbisLifecycle",
          "identityLinkReason"
        )
        VALUES (
          ${account.id},
          ${account.authUserId},
          ${account.firstName},
          ${account.lastName},
          ${account.email},
          ${account.phone},
          ${account.phoneCountryCallingCode},
          ${account.status},
          ${account.identityLinkStatus},
          ${account.orbisIdentityId},
          ${account.orbisDisplayId},
          ${account.orbisLifecycle},
          ${account.identityLinkReason}
        )
        ON CONFLICT ("authUserId") DO NOTHING
        RETURNING
          "id",
          "authUserId",
          "firstName",
          "lastName",
          "email",
          "phone",
          "phoneCountryCallingCode",
          "status",
          "identityLinkStatus",
          "orbisIdentityId",
          "orbisDisplayId",
          "orbisLifecycle",
          "identityLinkReason",
          "createdAt",
          "updatedAt"
      )
      SELECT * FROM inserted
      UNION ALL
      SELECT
        "id",
        "authUserId",
        "firstName",
        "lastName",
        "email",
        "phone",
        "phoneCountryCallingCode",
        "status",
        "identityLinkStatus",
        "orbisIdentityId",
        "orbisDisplayId",
        "orbisLifecycle",
        "identityLinkReason",
        "createdAt",
        "updatedAt"
      FROM "FoundationPublicAccount"
      WHERE "authUserId" = ${account.authUserId}
      LIMIT 1
    `;

    const row = firstRow(rows);
    if (!row) throw repositoryError("FOUNDATION_ACCOUNT_CREATE_FAILED");
    return row;
  }

  async function updateIdentityLink(id, patch) {
    const rows = await prisma.$queryRaw`
      UPDATE "FoundationPublicAccount"
      SET
        "identityLinkStatus" = ${patch.identityLinkStatus},
        "orbisIdentityId" = ${patch.orbisIdentityId},
        "orbisDisplayId" = ${patch.orbisDisplayId},
        "orbisLifecycle" = ${patch.orbisLifecycle},
        "identityLinkReason" = ${patch.identityLinkReason},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING
        "id",
        "authUserId",
        "firstName",
        "lastName",
        "email",
        "phone",
        "phoneCountryCallingCode",
        "status",
        "identityLinkStatus",
        "orbisIdentityId",
        "orbisDisplayId",
        "orbisLifecycle",
        "identityLinkReason",
        "createdAt",
        "updatedAt"
    `;

    const row = firstRow(rows);
    if (!row) throw repositoryError("FOUNDATION_ACCOUNT_NOT_FOUND");
    return row;
  }

  return {
    findByAuthUserId,
    create,
    updateIdentityLink,
  };
}

module.exports = {
  createFoundationPublicAccountRepository,
};
