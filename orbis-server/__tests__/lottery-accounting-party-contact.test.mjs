// @vitest-environment node

import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createLotteryAccountingService,
} = require("../lottery-accounting-service.cjs");

function prismaMock() {
  const partyCreate = vi.fn(async ({ data }) => ({ id: "party-1", ...data }));
  const auditCreate = vi.fn(async ({ data }) => ({ id: "audit-1", ...data }));
  const client = {
    foundationAccountingParty: { create: partyCreate },
    foundationLotteryAuditEvent: { create: auditCreate },
  };
  return {
    ...client,
    $transaction: async (operation) => operation(client),
    partyCreate,
  };
}

describe("Accounting Party email/phone matching keys", () => {
  it("stores email and phone beside the generated unique Party id", async () => {
    const prisma = prismaMock();
    const service = createLotteryAccountingService({ prisma });

    await service.createParty(
      {
        organizationId: "org-1",
        name: "Rahul",
        partyType: "SELLER",
        email: " Rahul@Example.COM ",
        phone: "+91 98765-43210",
        ticketRatePaise: 1000,
      },
      "admin-1",
    );

    expect(prisma.partyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        uniqueCode: expect.any(String),
        email: "Rahul@Example.COM",
        emailNormalized: "rahul@example.com",
        phone: "+91 98765-43210",
        phoneNormalized: "+919876543210",
      }),
    });
  });
});
