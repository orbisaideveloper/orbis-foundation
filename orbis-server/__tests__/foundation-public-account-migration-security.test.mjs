// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = path.resolve(
  "prisma/migrations/20260913184000_add_foundation_public_accounts/migration.sql",
);

describe("Foundation public account migration security", () => {
  it("keeps auth mapping unique and the account table server-owned", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");

    expect(sql).toContain('CREATE TABLE "FoundationPublicAccount"');
    expect(sql).toContain('"FoundationPublicAccount_authUserId_key"');
    expect(sql).toContain('"FoundationPublicAccount_orbisIdentityId_key"');
    expect(sql).toContain(
      `CHECK ("identityLinkStatus" IN ('PENDING', 'LINKED', 'REVIEW_REQUIRED', 'FAILED'))`,
    );
    expect(sql).toContain('"FoundationPublicAccount_linked_identity_check"');
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      'REVOKE ALL ON TABLE "FoundationPublicAccount" FROM PUBLIC',
    );
    expect(sql).toContain("FROM anon");
    expect(sql).toContain("FROM authenticated");
  });
});
