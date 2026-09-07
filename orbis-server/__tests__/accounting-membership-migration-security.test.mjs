// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = path.resolve(
  "prisma/migrations/20260907001000_add_accounting_user_memberships/migration.sql",
);
const SCHEMA = path.resolve("prisma/schema.prisma");

describe("Accounting organization membership migration security", () => {
  it("creates unique tenant membership with bounded roles and server-owned access", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    const schema = fs.readFileSync(SCHEMA, "utf8");

    expect(sql).toContain(
      'CREATE TABLE "FoundationAccountingOrganizationMembership"',
    );
    expect(sql).toContain(
      '"FoundationAccountingOrganizationMembership_organizationId_userId_key"',
    );
    expect(sql).toContain(
      `CHECK ("role" IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER'))`,
    );
    expect(sql).toContain(`CHECK ("status" IN ('ACTIVE', 'REVOKED'))`);
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      'REVOKE ALL ON TABLE "FoundationAccountingOrganizationMembership" FROM PUBLIC',
    );
    expect(sql).toContain("FROM anon");
    expect(sql).toContain("FROM authenticated");

    expect(schema).toContain(
      "model FoundationAccountingOrganizationMembership",
    );
    expect(schema).toContain("@@unique([organizationId, userId])");
    expect(schema).toContain("@@index([userId, status])");
  });
});
