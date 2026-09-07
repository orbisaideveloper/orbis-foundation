// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = path.resolve(
  "prisma/migrations/20260907002000_add_global_identity_email_phone_claim/migration.sql",
);
const SCHEMA = path.resolve("prisma/schema.prisma");

describe("Accounting identity email/phone claim migration security", () => {
  it("creates server-owned claim tables and contact indexes", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    const schema = fs.readFileSync(SCHEMA, "utf8");

    expect(sql).toContain(
      'CREATE TABLE "FoundationAccountingUserIdentity"',
    );
    expect(sql).toContain('CREATE TABLE "FoundationAccountingPartyClaim"');
    expect(sql).toContain(
      `"claimMethod" IN ('VERIFIED_EMAIL', 'VERIFIED_PHONE')`,
    );
    expect(sql).toContain(
      '"FoundationAccountingParty_emailNormalized_status_idx"',
    );
    expect(sql).toContain(
      '"FoundationAccountingParty_phoneNormalized_status_idx"',
    );
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      'REVOKE ALL ON TABLE "FoundationAccountingUserIdentity" FROM PUBLIC',
    );
    expect(sql).toContain(
      'REVOKE ALL ON TABLE "FoundationAccountingPartyClaim" FROM PUBLIC',
    );

    expect(schema).toContain("model FoundationAccountingUserIdentity");
    expect(schema).toContain("model FoundationAccountingPartyClaim");
    expect(schema).toContain("@@index([emailNormalized, status])");
    expect(schema).toContain("@@index([phoneNormalized, status])");
  });
});
