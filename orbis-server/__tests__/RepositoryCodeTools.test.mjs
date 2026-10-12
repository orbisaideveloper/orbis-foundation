// @vitest-environment node

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  describe,
  expect,
  it,
} from "vitest";

const require = createRequire(import.meta.url);

const {
  ERR_DISABLED,
  ERR_PATH_NOT_ALLOWED,
  RepositoryCodeTools,
  isRepositoryInspectionPathAllowed,
} = require("../ai/tools/RepositoryCodeTools.cjs");

const PACKAGE_JSON = "package.json";
const SOURCE_POLICY_FILE =
  "orbis-server/source-access-policy.cjs";
const SEARCH_TERM = "ALLOWED_SOURCE_ROOTS";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");

function enabledTool(options = {}) {
  return new RepositoryCodeTools({
    repositoryRoot,
    enabled: () => true,
    ...options,
  });
}

describe("Phase 3 RepositoryCodeTools", () => {
  it("fails closed unless repository source access is explicitly enabled", () => {
    const tool = new RepositoryCodeTools({
      repositoryRoot,
      enabled: () => false,
    });

    expect(() => tool.listFiles()).toThrow(
      expect.objectContaining({ code: ERR_DISABLED }),
    );
  });

  it("reads an allowed source file and blocks sensitive/traversal paths", () => {
    const tool = enabledTool();

    const result = tool.readFile(PACKAGE_JSON);

    expect(result.path).toBe(PACKAGE_JSON);
    expect(JSON.parse(result.content).name).toBe(
      "orbis-foundation",
    );

    expect(() => tool.readFile(".env")).toThrow(
      expect.objectContaining({
        code: ERR_PATH_NOT_ALLOWED,
      }),
    );

    expect(() => tool.readFile("../package.json")).toThrow(
      expect.objectContaining({
        code: ERR_PATH_NOT_ALLOWED,
      }),
    );
  });

  it("lists only policy-allowed repository source paths", () => {
    const tool = enabledTool();

    const result = tool.listFiles({ limit: 1_000 });

    expect(result.files).toContain(PACKAGE_JSON);
    expect(result.files).toContain(SOURCE_POLICY_FILE);
    expect(result.files).not.toContain(".env");
    expect(result.files.every((item) => !item.includes("node_modules")))
      .toBe(true);
  });

  it("performs bounded literal source search with path and line evidence", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "orbis-source-search-"));
    try {
      fs.mkdirSync(path.join(fixture, "orbis-server"));
      fs.writeFileSync(path.join(fixture, SOURCE_POLICY_FILE),
        `// fixture\nconst ${SEARCH_TERM} = [];\n${SEARCH_TERM};\n`);
      fs.writeFileSync(path.join(fixture, ".env"), `${SEARCH_TERM}=private`);
      fs.mkdirSync(path.join(fixture, "node_modules"));
      fs.writeFileSync(path.join(fixture, "node_modules", "ignored.cjs"), SEARCH_TERM);
      const tool = enabledTool({ repositoryRoot: fixture });
      const result = tool.search(SEARCH_TERM.toLowerCase(), { limit: 10 });
      expect(result.matches).toEqual([
        { path: SOURCE_POLICY_FILE, line: 2, text: `const ${SEARCH_TERM} = [];` },
        { path: SOURCE_POLICY_FILE, line: 3, text: `${SEARCH_TERM};` },
      ]);
      expect(result.indexedFileCount).toBe(1);
      expect(result.truncated).toBe(false);
      const bounded = tool.search(SEARCH_TERM, { limit: 1 });
      expect(bounded.matches).toEqual([result.matches[0]]);
      expect(bounded.truncated).toBe(true);
      expect(tool.search(".*").matches).toEqual([]);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("reports read-only Git state and hides disallowed worktree paths", () => {
    const head = "a".repeat(40);

    const gitRunner = (_root, args) => {
      const command = args.join(" ");

      if (command === "rev-parse --show-toplevel") {
        return repositoryRoot;
      }

      if (command === "branch --show-current") {
        return "main\n";
      }

      if (command === "rev-parse HEAD") {
        return `${head}\n`;
      }

      if (
        command ===
        "status --porcelain=v1 --untracked-files=normal"
      ) {
        return (
          " M orbis-server/source-api.cjs\n" +
          "?? .env\n"
        );
      }

      throw new Error("UNEXPECTED_GIT_COMMAND");
    };

    const tool = enabledTool({ gitRunner });

    expect(tool.getGitState()).toEqual({
      branch: "main",
      head,
      dirty: true,
      changes: [
        {
          status: " M",
          path: "orbis-server/source-api.cjs",
        },
      ],
      hiddenChangeCount: 1,
    });
  });
  it("allows only committed Prisma migration SQL and GitHub workflow config outside the normal source policy", () => {
    expect(
      isRepositoryInspectionPathAllowed(
        "prisma/migrations/20260901000000_example/migration.sql",
      ),
    ).toBe(true);

    expect(
      isRepositoryInspectionPathAllowed(
        ".github/workflows/quality.yml",
      ),
    ).toBe(true);

    expect(
      isRepositoryInspectionPathAllowed(
        "scripts/private.sql",
      ),
    ).toBe(false);

    expect(
      isRepositoryInspectionPathAllowed(
        ".github/secrets/example.yml",
      ),
    ).toBe(false);

    expect(
      isRepositoryInspectionPathAllowed(".env"),
    ).toBe(false);
  });

  it("never treats traversal-style migration or workflow paths as safe", () => {
    expect(
      isRepositoryInspectionPathAllowed(
        "prisma/migrations/../secret/migration.sql",
      ),
    ).toBe(false);

    expect(
      isRepositoryInspectionPathAllowed(
        ".github/workflows/../secrets.yml",
      ),
    ).toBe(false);
  });

});
