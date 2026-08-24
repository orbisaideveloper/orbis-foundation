// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  testDirectory,
  "../../prisma/migrations/20260824000000_add_foundation_learned_knowledge/migration.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

describe("FoundationLearnedKnowledge migration security", () => {
  it("keeps the new table server-only and fail-closed", () => {
    expect(migration).toContain(
      'ALTER TABLE public."FoundationLearnedKnowledge" ENABLE ROW LEVEL SECURITY;',
    );
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public."FoundationLearnedKnowledge" FROM anon;',
    );
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public."FoundationLearnedKnowledge" FROM authenticated;',
    );
    expect(migration).not.toMatch(/\bGRANT\b/i);
    expect(migration).not.toMatch(/\bCREATE\s+POLICY\b/i);
  });

  it("does not reference ORBIS-owned or ownership-unknown tables", () => {
    for (const table of [
      "orbis_semantic_memory",
      "users",
      "chat_history",
      "parties",
      "logs_deployment",
      "logs_runtime_error",
      "logs_audit_trail",
    ]) {
      expect(migration.toLowerCase()).not.toContain(table);
    }
  });
});
