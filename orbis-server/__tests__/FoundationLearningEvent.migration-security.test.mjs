// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  testDirectory,
  "../../prisma/migrations/20260829000000_add_foundation_learning_events/migration.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

describe("FoundationLearningEvent migration security", () => {
  it("keeps event data server-only and excludes raw chat columns", () => {
    expect(migration).toContain(
      'ALTER TABLE public."FoundationLearningEvent" ENABLE ROW LEVEL SECURITY;',
    );
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public."FoundationLearningEvent" FROM anon;',
    );
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public."FoundationLearningEvent" FROM authenticated;',
    );
    expect(migration).not.toMatch(/\b(?:prompt|message|answer|source|content|user|account|location)\b/i);
    expect(migration).not.toMatch(/\bGRANT\b|\bCREATE\s+POLICY\b/i);
  });
});
