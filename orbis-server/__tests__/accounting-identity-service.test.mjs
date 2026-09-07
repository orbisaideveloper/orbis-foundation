// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const PARTY_EMAIL = "rahul@example.com";
const PARTY_PHONE = "+919876543210";
const PARTY_CODE = "party-code-1";
const RAHUL_USER_ID = "user-rahul";
const {
  createAccountingIdentityService,
} = require("../accounting-identity-service.cjs");

function prismaMock() {
  const state = {
    identities: [],
    parties: [
      {
        id: "party-1",
        organizationId: "org-1",
        partyType: "SELLER",
        name: "Rahul",
        emailNormalized: PARTY_EMAIL,
        phoneNormalized: PARTY_PHONE,
        uniqueCode: PARTY_CODE,
        status: "ACTIVE",
        organization: {
          id: "org-1",
          name: "Ajay Lottery",
          status: "ACTIVE",
        },
        identityClaim: null,
      },
    ],
    claims: [],
  };

  const client = {
    foundationAccountingUserIdentity: {
      findUnique: vi.fn(async ({ where }) =>
        state.identities.find((row) => row.userId === where.userId) || null,
      ),
      upsert: vi.fn(async ({ where, create }) => {
        const existing = state.identities.find(
          (row) => row.userId === where.userId,
        );
        if (existing) return existing;
        state.identities.push(create);
        return create;
      }),
    },
    foundationAccountingParty: {
      findMany: vi.fn(async ({ where }) =>
        state.parties.filter((party) => {
          if (party.status !== where.status) return false;
          return where.OR.some(
            (selector) =>
              (selector.emailNormalized &&
                selector.emailNormalized === party.emailNormalized) ||
              (selector.phoneNormalized &&
                selector.phoneNormalized === party.phoneNormalized),
          );
        }),
      ),
      findFirst: vi.fn(async ({ where }) =>
        state.parties.find((party) => {
          if (
            party.uniqueCode !== where.uniqueCode ||
            party.status !== where.status
          ) {
            return false;
          }
          return where.OR.some(
            (selector) =>
              (selector.emailNormalized &&
                selector.emailNormalized === party.emailNormalized) ||
              (selector.phoneNormalized &&
                selector.phoneNormalized === party.phoneNormalized),
          );
        }) || null,
      ),
    },
    foundationAccountingPartyClaim: {
      create: vi.fn(async ({ data }) => {
        const claim = { id: `claim-${state.claims.length + 1}`, ...data };
        state.claims.push(claim);
        const party = state.parties.find((row) => row.id === data.partyId);
        party.identityClaim = claim;
        return claim;
      }),
      findMany: vi.fn(async ({ where }) =>
        state.claims
          .filter(
            (claim) =>
              claim.userId === where.userId && claim.status === where.status,
          )
          .map((claim) => ({
            ...claim,
            party: state.parties.find((row) => row.id === claim.partyId),
          })),
      ),
    },
  };

  return {
    ...client,
    $transaction: async (operation) => operation(client),
    state,
  };
}

const VERIFIED_EMAIL_USER = {
  id: RAHUL_USER_ID,
  email: PARTY_EMAIL,
  emailVerified: true,
  phone: null,
  phoneVerified: false,
};

describe("Accounting global identity and Party claim", () => {
  it("creates one stable ORBIS id per authenticated user", async () => {
    const prisma = prismaMock();
    const service = createAccountingIdentityService({
      prisma,
      uuid: () => "identity-uuid",
    });

    const first = await service.ensureGlobalIdentity(VERIFIED_EMAIL_USER);
    const second = await service.ensureGlobalIdentity(VERIFIED_EMAIL_USER);

    expect(first.orbisId).toBe("ORB-identity-uuid");
    expect(second.orbisId).toBe(first.orbisId);
    expect(prisma.state.identities).toHaveLength(1);
  });

  it("does not claim from unverified signup contacts", async () => {
    const service = createAccountingIdentityService({
      prisma: prismaMock(),
    });

    await expect(
      service.listClaimCandidates({
        id: RAHUL_USER_ID,
        email: PARTY_EMAIL,
        emailVerified: false,
        phone: PARTY_PHONE,
        phoneVerified: false,
      }),
    ).rejects.toMatchObject({
      code: "VERIFIED_CONTACT_REQUIRED",
      field: "contact",
    });
  });

  it("matches by verified Gmail/email without phone OTP", async () => {
    const prisma = prismaMock();
    const service = createAccountingIdentityService({
      prisma,
      uuid: () => "identity-uuid",
    });

    const candidates =
      await service.listClaimCandidates(VERIFIED_EMAIL_USER);
    expect(candidates[0]).toMatchObject({
      party: { partyCode: PARTY_CODE, partyType: "SELLER" },
      matchedBy: "VERIFIED_EMAIL",
    });

    const result = await service.claimParty(VERIFIED_EMAIL_USER, {
      partyCode: PARTY_CODE,
    });

    expect(result.identity.orbisId).toBe("ORB-identity-uuid");
    expect(result.relationship).toMatchObject({
      matchedBy: "VERIFIED_EMAIL",
      organizationRole: "STOCKIST",
    });
  });

  it("also accepts an independently verified phone match", async () => {
    const service = createAccountingIdentityService({
      prisma: prismaMock(),
    });

    const result = await service.claimParty(
      {
        id: RAHUL_USER_ID,
        email: null,
        emailVerified: false,
        phone: PARTY_PHONE,
        phoneVerified: true,
      },
      { partyCode: PARTY_CODE },
    );

    expect(result.relationship.matchedBy).toBe("VERIFIED_PHONE");
  });

  it("rejects takeover and never returns Party contact details", async () => {
    const prisma = prismaMock();
    const service = createAccountingIdentityService({ prisma });

    await service.claimParty(VERIFIED_EMAIL_USER, {
      partyCode: PARTY_CODE,
    });

    await expect(
      service.claimParty(
        {
          id: "other-user",
          email: PARTY_EMAIL,
          emailVerified: true,
          phone: null,
          phoneVerified: false,
        },
        { partyCode: PARTY_CODE },
      ),
    ).rejects.toMatchObject({ code: "PARTY_ALREADY_CLAIMED" });

    const relationships =
      await service.listRelationships(VERIFIED_EMAIL_USER);
    expect(JSON.stringify(relationships)).not.toContain(PARTY_EMAIL);
    expect(JSON.stringify(relationships)).not.toContain(PARTY_PHONE);
  });
});
