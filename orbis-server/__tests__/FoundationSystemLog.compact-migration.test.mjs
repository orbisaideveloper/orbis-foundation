// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  testDirectory,
  "../../prisma/migrations/20260824000200_compact_foundation_system_log/migration.sql",
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

describe("compact FoundationSystemLog migration", () => {
  it("adds aggregation, category/severity, and retention metadata without deleting rows", () => {
    for (const column of [
      "category",
      "severity",
      "fingerprint",
      "count",
      "firstSeen",
      "lastSeen",
      "retentionUntil",
    ]) {
      expect(migration).toContain(`"${column}"`);
    }
    expect(migration).toContain("INTERVAL '7 days'");
    expect(migration).toContain("INTERVAL '30 days'");
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
  });

  it("touches only FoundationSystemLog and preserves the established RLS boundary", () => {
    for (const table of OUT_OF_SCOPE_TABLES) {
      expect(migration.toLowerCase()).not.toContain(table);
    }
    const quotedTables = [
      ...migration.matchAll(/(?:TABLE|UPDATE|ON)\s+public\."([^"]+)"/gi),
    ].map((match) => match[1]);
    expect(new Set(quotedTables)).toEqual(new Set(["FoundationSystemLog"]));
    expect(migration).toContain(
      'ALTER TABLE public."FoundationSystemLog" ENABLE ROW LEVEL SECURITY;',
    );
    expect(migration).not.toMatch(/\bGRANT\b/i);
  });
});
