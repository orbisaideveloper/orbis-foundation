// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  testDirectory,
  "../../prisma/migrations/20260824000100_secure_foundation_system_log/migration.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

const OUT_OF_SCOPE_TABLES = [
  "orbis_semantic_memory",
  "users",
  "chat_history",
  "parties",
  "logs_deployment",
  "logs_runtime_error",
  "logs_audit_trail",
];

describe("FoundationSystemLog migration security boundary", () => {
  it("enables RLS and removes all direct anon/authenticated table access", () => {
    expect(migration).toContain(
      'ALTER TABLE public."FoundationSystemLog" ENABLE ROW LEVEL SECURITY;',
    );
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public."FoundationSystemLog" FROM anon;',
    );
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public."FoundationSystemLog" FROM authenticated;',
    );
    expect(migration).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(migration).not.toMatch(/\bGRANT\b/i);
  });

  it("keeps the RLS helper and event trigger while conditionally revoking direct execution", () => {
    expect(migration).toContain(
      "IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN",
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC",
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon",
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated",
    );
    expect(migration).not.toMatch(
      /\bDROP\s+(?:FUNCTION|TRIGGER|EVENT\s+TRIGGER)\b/i,
    );
    expect(migration.toLowerCase()).not.toContain("drop ensure_rls");
  });

  it("references no ORBIS-owned or ownership-unknown table", () => {
    for (const table of OUT_OF_SCOPE_TABLES) {
      expect(migration.toLowerCase()).not.toContain(table);
    }
    const quotedTables = [
      ...migration.matchAll(/(?:TABLE|ON\s+TABLE)\s+public\."([^"]+)"/gi),
    ].map((match) => match[1]);
    expect(new Set(quotedTables)).toEqual(new Set(["FoundationSystemLog"]));
  });
});
