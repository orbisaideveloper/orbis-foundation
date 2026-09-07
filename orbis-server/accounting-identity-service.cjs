const { randomUUID } = require("node:crypto");
const { accountingError } = require("./lottery-accounting-core.cjs");
const {
  verifiedContactSelectors,
} = require("./accounting-party-contact.cjs");

const VERIFIED = "VERIFIED";
const VERIFIED_EMAIL = "VERIFIED_EMAIL";
const VERIFIED_PHONE = "VERIFIED_PHONE";

const ORGANIZATION_ROLE_BY_PARTY_TYPE = Object.freeze({
  SELLER: "STOCKIST",
  STOCKIST: "BUYER",
  SERVICE_STOCKIST: "SERVICE_BUYER",
  CUSTOMER: "SUPPLIER",
});

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw accountingError("REQUIRED_FIELD", field);
  }
  return value.trim();
}

function requirePublicUser(user) {
  return { userId: requiredText(user?.id, "userId"), user };
}

function verifiedState(user) {
  const state = verifiedContactSelectors(user);
  if (!state.selectors.length) {
    throw accountingError("VERIFIED_CONTACT_REQUIRED", "contact");
  }
  return state;
}

function publicOrganization(organization) {
  return { id: organization.id, name: organization.name };
}

function publicParty(party) {
  return {
    id: party.id,
    partyCode: party.uniqueCode,
    name: party.name,
    partyType: party.partyType,
  };
}

function matchedByForParty(party, state) {
  if (state.email && party.emailNormalized === state.email) {
    return VERIFIED_EMAIL;
  }
  if (state.phone && party.phoneNormalized === state.phone) {
    return VERIFIED_PHONE;
  }
  return null;
}

function relationshipFromClaim(claim) {
  const party = claim.party;
  return {
    claimId: claim.id,
    status: claim.status,
    matchedBy: claim.claimMethod,
    party: publicParty(party),
    organization: publicOrganization(party.organization),
    organizationRole:
      ORGANIZATION_ROLE_BY_PARTY_TYPE[party.partyType] || "BUSINESS",
  };
}

function isUniqueConstraintError(error) {
  return error?.code === "P2002";
}

function createAccountingIdentityService({ prisma, uuid = randomUUID }) {
  if (!prisma) throw new Error("A Prisma client is required.");

  async function ensureIdentityWithClient(client, userId) {
    return client.foundationAccountingUserIdentity.upsert({
      where: { userId },
      update: {},
      create: { userId, orbisId: `ORB-${uuid()}` },
    });
  }

  async function getGlobalIdentity(user) {
    const { userId } = requirePublicUser(user);
    return prisma.foundationAccountingUserIdentity.findUnique({
      where: { userId },
    });
  }

  async function ensureGlobalIdentity(user) {
    const { userId } = requirePublicUser(user);
    return prisma.$transaction((client) =>
      ensureIdentityWithClient(client, userId),
    );
  }

  async function listClaimCandidates(user) {
    const { userId } = requirePublicUser(user);
    const state = verifiedState(user);
    const parties = await prisma.foundationAccountingParty.findMany({
      where: { status: "ACTIVE", OR: state.selectors },
      include: { organization: true, identityClaim: true },
      orderBy: { name: "asc" },
    });

    return parties
      .filter((party) => party.organization?.status === "ACTIVE")
      .filter(
        (party) =>
          !party.identityClaim || party.identityClaim.userId === userId,
      )
      .map((party) => ({
        party: publicParty(party),
        organization: publicOrganization(party.organization),
        matchedBy: matchedByForParty(party, state),
        alreadyClaimedByYou: party.identityClaim?.userId === userId,
      }));
  }

  async function claimParty(user, input) {
    const { userId } = requirePublicUser(user);
    const state = verifiedState(user);
    const partyCode = requiredText(input?.partyCode, "partyCode");

    try {
      return await prisma.$transaction(async (client) => {
        const party = await client.foundationAccountingParty.findFirst({
          where: {
            uniqueCode: partyCode,
            status: "ACTIVE",
            OR: state.selectors,
          },
          include: { organization: true, identityClaim: true },
        });

        if (!party || party.organization?.status !== "ACTIVE") {
          throw accountingError("PARTY_CLAIM_NOT_FOUND", "partyCode");
        }

        const matchedBy = matchedByForParty(party, state);
        if (!matchedBy) {
          throw accountingError("PARTY_CLAIM_NOT_FOUND", "partyCode");
        }

        if (party.identityClaim) {
          if (
            party.identityClaim.userId !== userId ||
            party.identityClaim.status !== VERIFIED
          ) {
            throw accountingError("PARTY_ALREADY_CLAIMED", "partyCode");
          }
          const identity = await ensureIdentityWithClient(client, userId);
          return {
            identity,
            relationship: relationshipFromClaim({
              ...party.identityClaim,
              party,
            }),
          };
        }

        const identity = await ensureIdentityWithClient(client, userId);
        const claim = await client.foundationAccountingPartyClaim.create({
          data: {
            partyId: party.id,
            userId,
            claimMethod: matchedBy,
            status: VERIFIED,
          },
        });

        return {
          identity,
          relationship: relationshipFromClaim({ ...claim, party }),
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw accountingError("PARTY_ALREADY_CLAIMED", "partyCode");
      }
      throw error;
    }
  }

  async function listRelationships(user) {
    const { userId } = requirePublicUser(user);
    const [identity, claims] = await Promise.all([
      prisma.foundationAccountingUserIdentity.findUnique({ where: { userId } }),
      prisma.foundationAccountingPartyClaim.findMany({
        where: { userId, status: VERIFIED },
        include: { party: { include: { organization: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return {
      identity,
      relationships: claims
        .filter((claim) => claim.party?.organization?.status === "ACTIVE")
        .map(relationshipFromClaim),
    };
  }

  return {
    getGlobalIdentity,
    ensureGlobalIdentity,
    listClaimCandidates,
    claimParty,
    listRelationships,
  };
}

module.exports = {
  createAccountingIdentityService,
  ORGANIZATION_ROLE_BY_PARTY_TYPE,
};
