import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    "prisma/migrations/20260909193000_add_accounting_transaction_corrections/migration.sql",
  ),
  "utf8",
);

describe("Accounting correction migration", () => {
  it("creates an organization-scoped append-only correction journal", () => {
    expect(migration).toContain('CREATE TABLE "FoundationAccountingCorrection"');
    expect(migration).toContain(
      '"FoundationAccountingCorrection_org_operation_key"',
    );
    expect(migration).toContain(
      '"FoundationAccountingCorrection_org_entity_version_key"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("organizationId")',
    );
    expect(migration).toContain(
      '"entityType" IN (',
    );
  });

  it("keeps correction rows inaccessible to direct clients and immutable", () => {
    expect(migration).toContain(
      'ALTER TABLE "FoundationAccountingCorrection" ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).toContain(
      'REVOKE ALL ON TABLE "FoundationAccountingCorrection"',
    );
    expect(migration).toContain(
      'FROM PUBLIC, anon, authenticated',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "FoundationAccountingCorrection_immutable"',
    );
    expect(migration).toContain(
      'EXECUTE FUNCTION "FoundationLotteryRejectMutation"()',
    );
  });
});
