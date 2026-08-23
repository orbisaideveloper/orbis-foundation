// @vitest-environment node

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const automationPaths = [
  "test-all.sh",
  ".husky/pre-commit",
  "scripts/orbis-safe-workflow.sh",
];

const forbiddenAutomation = [
  {
    label: "Git state mutation",
    pattern:
      /\bgit\s+(?:add|am|apply|bisect|branch\s+(?:-[dDmM]|--delete|--move)|checkout|cherry-pick|clean|commit|fetch|merge|mv|pull|push|rebase|reset|restore|revert|rm|stash|switch|tag)\b/i,
  },
  { label: "lint-staged execution", pattern: /\b(?:npx\s+)?lint-staged\b/i },
  { label: "format script execution", pattern: /\bnpm\s+run\s+format\b/i },
  { label: "Prettier write execution", pattern: /\bprettier\b[^\n]*--write\b/i },
  { label: "ESLint fix execution", pattern: /\beslint\b[^\n]*--fix\b/i },
];

describe("local workflow Git safety", () => {
  it.each(automationPaths)("keeps %s non-mutating", (relativePath) => {
    const source = fs.readFileSync(
      path.join(repositoryRoot, relativePath),
      "utf8",
    );

    for (const { label, pattern } of forbiddenAutomation) {
      expect(source, `${relativePath}: ${label}`).not.toMatch(pattern);
    }
  });

  it("preserves logic and circular-dependency verification", () => {
    const sources = automationPaths.map((relativePath) =>
      fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
    );

    expect(sources.some((source) => source.includes("orbis-logic-guard.cjs"))).toBe(
      true,
    );
    expect(sources.some((source) => source.includes("check:circular"))).toBe(
      true,
    );
  });
});
