// @vitest-environment node

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const {
  ERR_AMBIGUOUS,
  ERR_CONFLICT,
  ERR_DISABLED,
  ERR_PATH_NOT_ALLOWED,
  RepositoryPatchTool,
} = require("../ai/tools/RepositoryPatchTool.cjs");

const roots = new Set();

const FIXTURE_PATH = "src/example.ts";
const ORIGINAL_SOURCE = "export const value = 1;\n";

function fixtureRoot() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "orbis-patch-tool-"),
  );

  roots.add(root);
  fs.mkdirSync(path.join(root, "src"));

  return root;
}

function enabledTool(root) {
  return new RepositoryPatchTool({
    repositoryRoot: root,
    enabled: () => true,
    backupRoot: path.join(
      root,
      ".orbis-backups",
      "agent-patches",
    ),
  });
}

function writeFixture(root, content) {
  const target = path.join(root, "src", "example.ts");
  fs.writeFileSync(target, content, "utf8");
  return target;
}

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(
    directory,
    { withFileTypes: true },
  ).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    return entry.isDirectory()
      ? collectFiles(fullPath)
      : [fullPath];
  });
}

afterEach(() => {
  for (const root of roots) {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  }

  roots.clear();
});

describe("Phase 5A RepositoryPatchTool", () => {
  it("fails closed unless repository patching is explicitly enabled", () => {
    const root = fixtureRoot();
    writeFixture(root, ORIGINAL_SOURCE);

    const tool = new RepositoryPatchTool({
      repositoryRoot: root,
      enabled: () => false,
    });

    expect(() =>
      tool.applyPatch({
        path: FIXTURE_PATH,
        edits: [
          {
            oldText: "value = 1",
            newText: "value = 2",
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        code: ERR_DISABLED,
      }),
    );
  });

  it("applies an exact bounded edit and preserves a recovery checkpoint", () => {
    const root = fixtureRoot();
    const target = writeFixture(
      root,
      ORIGINAL_SOURCE,
    );

    const tool = enabledTool(root);

    const result = tool.applyPatch({
      path: FIXTURE_PATH,
      edits: [
        {
          oldText: "value = 1",
          newText: "value = 2",
        },
      ],
    });

    expect(
      fs.readFileSync(target, "utf8"),
    ).toBe("export const value = 2;\n");

    expect(result).toMatchObject({
      path: FIXTURE_PATH,
      editCount: 1,
      backupCreated: true,
    });

    expect(result.sha256Before).not.toBe(
      result.sha256After,
    );

    const backups = collectFiles(
      path.join(
        root,
        ".orbis-backups",
        "agent-patches",
      ),
    );

    expect(backups).toHaveLength(1);
    expect(
      fs.readFileSync(backups[0], "utf8"),
    ).toBe(ORIGINAL_SOURCE);
  });

  it("rejects traversal and restricted source paths", () => {
    const root = fixtureRoot();
    writeFixture(root, ORIGINAL_SOURCE);

    const tool = enabledTool(root);

    for (const unsafePath of [
      "../outside.ts",
      ".env",
      "src/../example.ts",
    ]) {
      expect(() =>
        tool.applyPatch({
          path: unsafePath,
          edits: [
            {
              oldText: "value = 1",
              newText: "value = 2",
            },
          ],
        }),
      ).toThrow(
        expect.objectContaining({
          code: ERR_PATH_NOT_ALLOWED,
        }),
      );
    }
  });

  it("fails closed when patch context is stale", () => {
    const root = fixtureRoot();
    const target = writeFixture(
      root,
      ORIGINAL_SOURCE,
    );

    const tool = enabledTool(root);

    expect(() =>
      tool.applyPatch({
        path: FIXTURE_PATH,
        edits: [
          {
            oldText: "value = 99",
            newText: "value = 2",
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        code: ERR_CONFLICT,
      }),
    );

    expect(
      fs.readFileSync(target, "utf8"),
    ).toBe(ORIGINAL_SOURCE);
  });

  it("rejects ambiguous exact-text edits instead of guessing", () => {
    const root = fixtureRoot();
    const target = writeFixture(
      root,
      "const value = 1;\nconst value = 1;\n",
    );

    const tool = enabledTool(root);

    expect(() =>
      tool.applyPatch({
        path: FIXTURE_PATH,
        edits: [
          {
            oldText: "value = 1",
            newText: "value = 2",
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        code: ERR_AMBIGUOUS,
      }),
    );

    expect(
      fs.readFileSync(target, "utf8"),
    ).toBe(
      "const value = 1;\nconst value = 1;\n",
    );
  });
});
