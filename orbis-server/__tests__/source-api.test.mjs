// @vitest-environment node

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";

const require = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const sourceApiPath = path.join(repositoryRoot, "orbis-server/source-api.cjs");
const timeMachineApiPath = path.join(
  repositoryRoot,
  "orbis-server/time-machine-api.cjs",
);
const fixtureDirectories = new Set();
const fakeDatabaseQueries = [];

vi.setConfig({ testTimeout: 20_000 });

let app;
let importTimeDatabaseQueryBaseline;

function flattenTree(nodes) {
  return nodes.flatMap((node) => [
    node,
    ...(node.type === "directory" ? flattenTree(node.children) : []),
  ]);
}

function removeFixture(fixtureDirectory) {
  if (!fixtureDirectory) return;
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
  fixtureDirectories.delete(fixtureDirectory);
}

function createFixture() {
  const fixtureDirectory = fs.mkdtempSync(
    path.join(repositoryRoot, "src", "source-api-fixture-"),
  );
  fixtureDirectories.add(fixtureDirectory);
  return fixtureDirectory;
}

function expectSanitizedError(response, secretContent = "") {
  const body = JSON.stringify(response.body);

  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(body).not.toMatch(/\/data\/data/i);
  expect(body).not.toMatch(/DATABASE_URL/i);
  expect(body).not.toMatch(/postgres(?:ql)?:\/\//i);
  expect(body).not.toMatch(/(?:^|\n)\s*at\s+\S+/i);
  if (secretContent) expect(body).not.toContain(secretContent);
}

beforeAll(async () => {
  // Do not let the isolated dependency import observe or use a real DB URL.
  delete process.env.DATABASE_URL;

  const originalLoad = Module._load;

  class FakePool {
    query(...args) {
      fakeDatabaseQueries.push(args);
      return Promise.resolve({ rows: [] });
    }
  }

  delete require.cache[require.resolve(sourceApiPath)];
  delete require.cache[require.resolve(timeMachineApiPath)];

  let sourceRouter;
  try {
    Module._load = function (requestName, parent, isMain) {
      if (requestName === "pg") return { Pool: FakePool };
      if (requestName === "./admin-auth.cjs") {
        return { requireAuthenticatedAdmin: (_req, _res, next) => next() };
      }
      return originalLoad.call(this, requestName, parent, isMain);
    };

    sourceRouter = require(sourceApiPath);
  } finally {
    Module._load = originalLoad;
  }

  // Let the time-machine module's import-time ensureSchema await settle.
  await Promise.resolve();
  importTimeDatabaseQueryBaseline = fakeDatabaseQueries.length;

  app = express();
  app.use(express.json());
  app.use("/api/system", sourceRouter);
});

afterEach(() => {
  delete process.env.SOURCE_EXPLORER_ENABLED;
  for (const fixtureDirectory of [...fixtureDirectories]) {
    removeFixture(fixtureDirectory);
  }
});

afterAll(() => {
  for (const fixtureDirectory of [...fixtureDirectories]) {
    removeFixture(fixtureDirectory);
  }

  delete process.env.SOURCE_EXPLORER_ENABLED;
  delete process.env.DATABASE_URL;

  delete require.cache[require.resolve(sourceApiPath)];
  delete require.cache[require.resolve(timeMachineApiPath)];
});

describe("source-api Source Explorer", () => {
  it("exposes a guarded metadata-free Admin access check", async () => {
    const response = await request(app).get("/api/system/access");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, role: "ADMIN" });
    expect(response.body).not.toHaveProperty("user");
    expect(response.body).not.toHaveProperty("status");
    expect(response.body).not.toHaveProperty("tree");
  });

  it.each([undefined, "false", "1", "yes"])(
    "returns the generic disabled response for flag value %s",
    async (flagValue) => {
      if (flagValue === undefined) {
        delete process.env.SOURCE_EXPLORER_ENABLED;
      } else {
        process.env.SOURCE_EXPLORER_ENABLED = flagValue;
      }

      for (const endpoint of ["tree", "file?path=package.json"]) {
        const response = await request(app).get(`/api/system/${endpoint}`);

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
          success: false,
          message: "Source Explorer is disabled",
        });
      }
    },
  );

  it('accepts the normalized value " TrUe " for tree and file requests', async () => {
    process.env.SOURCE_EXPLORER_ENABLED = " TrUe ";

    const treeResponse = await request(app).get("/api/system/tree");
    const fileResponse = await request(app)
      .get("/api/system/file")
      .query({ path: "package.json" });

    expect(treeResponse.status).toBe(200);
    expect(treeResponse.body.success).toBe(true);
    expect(fileResponse.status).toBe(200);
    expect(fileResponse.body.success).toBe(true);
  });

  it("keeps authenticated status available while Source Explorer is disabled", async () => {
    process.env.SOURCE_EXPLORER_ENABLED = "false";

    const response = await request(app).get("/api/system/status");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.hasError).toEqual(expect.any(Boolean));
  });

  it("preserves the tree response and safe tree-node fields", async () => {
    process.env.SOURCE_EXPLORER_ENABLED = "true";

    const response = await request(app).get("/api/system/tree");
    const nodes = flattenTree(response.body.tree);
    const packageNode = nodes.find((node) => node.path === "package.json");
    const serverDirectory = nodes.find(
      (node) => node.path === "orbis-server" && node.type === "directory",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      tree: expect.any(Array),
    });
    expect(packageNode).toEqual({
      name: "package.json",
      type: "file",
      path: "package.json",
      mtime: expect.any(Number),
    });
    expect(serverDirectory).toEqual({
      name: "orbis-server",
      type: "directory",
      path: "orbis-server",
      mtime: expect.any(Number),
      children: expect.any(Array),
    });
  });

  it.each(["package.json", "orbis-server/source-api.cjs"])(
    "preserves the file response for %s",
    async (relativePath) => {
      process.env.SOURCE_EXPLORER_ENABLED = "true";

      const response = await request(app)
        .get("/api/system/file")
        .query({ path: relativePath });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        content: fs.readFileSync(
          path.join(repositoryRoot, relativePath),
          "utf8",
        ),
      });
    },
  );

  it("denies sensitive, hidden, report, dependency, and unsafe path forms", async () => {
    process.env.SOURCE_EXPLORER_ENABLED = "true";

    const requests = [
      () => request(app).get("/api/system/file").query({ path: ".env" }),
      () => request(app).get("/api/system/file").query({ path: ".env.local" }),
      () =>
        request(app)
          .get("/api/system/file")
          .query({ path: ".hidden/source.ts" }),
      () =>
        request(app).get("/api/system/file").query({ path: "src/.hidden.ts" }),
      () =>
        request(app)
          .get("/api/system/file")
          .query({ path: "docs/AUDIT_REPORTS/report.md" }),
      () =>
        request(app)
          .get("/api/system/file")
          .query({ path: "node_modules/package/index.js" }),
      () => request(app).get("/api/system/file").query({ path: "/etc/passwd" }),
      () =>
        request(app).get("/api/system/file").query({ path: "../package.json" }),
      () =>
        request(app)
          .get("/api/system/file")
          .query({ path: "..\\package.json" }),
      () => request(app).get("/api/system/file?path=%2e%2e%2fpackage.json"),
      () =>
        request(app).get("/api/system/file?path=%252e%252e%252fpackage.json"),
      () => request(app).get("/api/system/file?path=package.json%00.txt"),
    ];

    for (const makeRequest of requests) {
      expectSanitizedError(await makeRequest());
    }
  });

  it("shows an allowed fixture while excluding unsafe fixture files", async () => {
    process.env.SOURCE_EXPLORER_ENABLED = "true";
    const fixtureDirectory = createFixture();
    const fixtureName = path
      .relative(repositoryRoot, fixtureDirectory)
      .replaceAll("\\", "/");
    const visibleContent = "export const fixtureVisible = true;\n";
    const secretContent = "ORBiS_TEST_SECRET_CONTENT";

    try {
      fs.writeFileSync(
        path.join(fixtureDirectory, "visible.ts"),
        visibleContent,
        "utf8",
      );
      fs.writeFileSync(
        path.join(fixtureDirectory, "oversized.ts"),
        Buffer.alloc(1024 * 1024 + 1, 65),
      );
      fs.writeFileSync(
        path.join(fixtureDirectory, "binary.ts"),
        Buffer.from([0x65, 0x78, 0x00, 0x70, 0x6f, 0x72, 0x74]),
      );
      fs.writeFileSync(
        path.join(fixtureDirectory, "renamed-png.ts"),
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      fs.mkdirSync(path.join(fixtureDirectory, "generated"));
      fs.writeFileSync(
        path.join(fixtureDirectory, "generated", "output.ts"),
        visibleContent,
        "utf8",
      );
      fs.mkdirSync(path.join(fixtureDirectory, "coverage"));
      fs.writeFileSync(
        path.join(fixtureDirectory, "coverage", "index.ts"),
        visibleContent,
        "utf8",
      );
      fs.writeFileSync(
        path.join(fixtureDirectory, "api-key.ts"),
        secretContent,
        "utf8",
      );
      fs.symlinkSync("visible.ts", path.join(fixtureDirectory, "linked.ts"));

      const treeResponse = await request(app).get("/api/system/tree");
      const fixtureNode = flattenTree(treeResponse.body.tree).find(
        (node) => node.path === fixtureName,
      );
      const fixturePaths = flattenTree(fixtureNode.children).map(
        (node) => node.path,
      );

      expect(treeResponse.status).toBe(200);
      expect(fixturePaths).toContain(`${fixtureName}/visible.ts`);
      expect(fixturePaths).not.toContain(`${fixtureName}/oversized.ts`);
      expect(fixturePaths).not.toContain(`${fixtureName}/binary.ts`);
      expect(fixturePaths).not.toContain(`${fixtureName}/renamed-png.ts`);
      expect(fixturePaths).not.toContain(`${fixtureName}/generated`);
      expect(fixturePaths).not.toContain(`${fixtureName}/coverage`);
      expect(fixturePaths).not.toContain(`${fixtureName}/api-key.ts`);
      expect(fixturePaths).not.toContain(`${fixtureName}/linked.ts`);

      const visibleResponse = await request(app)
        .get("/api/system/file")
        .query({ path: `${fixtureName}/visible.ts` });
      expect(visibleResponse.status).toBe(200);
      expect(visibleResponse.body).toEqual({
        success: true,
        content: visibleContent,
      });

      for (const fileName of [
        "oversized.ts",
        "binary.ts",
        "renamed-png.ts",
        "api-key.ts",
        "linked.ts",
      ]) {
        const deniedResponse = await request(app)
          .get("/api/system/file")
          .query({ path: `${fixtureName}/${fileName}` });
        expectSanitizedError(deniedResponse, secretContent);
      }
    } finally {
      removeFixture(fixtureDirectory);
    }
  });

  it("does not query the database for tree or file requests", async () => {
    process.env.SOURCE_EXPLORER_ENABLED = "true";

    expect(importTimeDatabaseQueryBaseline).toBe(1);

    await request(app).get("/api/system/tree").expect(200);
    await request(app)
      .get("/api/system/file")
      .query({ path: "package.json" })
      .expect(200);

    expect(fakeDatabaseQueries).toHaveLength(importTimeDatabaseQueryBaseline);
  });

  it("rejects binary snapshot content before any FoundationTimeMachine insert", async () => {
    const queryCount = fakeDatabaseQueries.length;
    const response = await request(app)
      .post("/api/system/time-machine/sync")
      .send({
        filePath: "src/renamed-png.ts",
        content: "\u0089PNG\r\n\u001a\n",
        commitId: "binary-fixture",
        status: "SUCCESS",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: "Valid source snapshot required",
    });
    expect(fakeDatabaseQueries).toHaveLength(queryCount);
  });

  it("keeps all error responses free of paths, URLs, stacks, and secrets", async () => {
    process.env.SOURCE_EXPLORER_ENABLED = "true";
    const secretContent = "ORBiS_TEST_SECRET_CONTENT";
    const fixtureDirectory = createFixture();
    const fixtureName = path
      .relative(repositoryRoot, fixtureDirectory)
      .replaceAll("\\", "/");

    try {
      fs.writeFileSync(
        path.join(fixtureDirectory, "private-key.ts"),
        secretContent,
        "utf8",
      );

      const responses = await Promise.all([
        request(app).get("/api/system/file"),
        request(app)
          .get("/api/system/file")
          .query({ path: `${fixtureName}/missing.ts` }),
        request(app)
          .get("/api/system/file")
          .query({ path: `${fixtureName}/private-key.ts` }),
        request(app)
          .get("/api/system/file")
          .query({ path: "/data/data/private/secret.ts" }),
      ]);

      for (const response of responses) {
        expectSanitizedError(response, secretContent);
      }
    } finally {
      removeFixture(fixtureDirectory);
    }
  });

  it("guards the source/API separation and existing router mounts", () => {
    const source = fs.readFileSync(sourceApiPath, "utf8");
    const bridge = fs.readFileSync(
      path.join(repositoryRoot, "orbis-server/bridge.cjs"),
      "utf8",
    );
    expect(source).not.toMatch(/require\(["']pg["']\)/);
    expect(source).not.toMatch(/\bnew\s+Pool\s*\(/);
    expect(source).not.toMatch(/\bpool\.query\s*\(/);
    expect(source).not.toMatch(/\bsaveToTimeMachine\b/);
    expect(source).toContain('router.use("/time-machine", timeMachineRouter)');
    expect(source).toContain('router.get("/access"');
    expect(
      source.indexOf("router.use(requireAuthenticatedAdmin)"),
    ).toBeLessThan(
      source.indexOf('router.use("/time-machine", timeMachineRouter)'),
    );
    expect(
      source.indexOf("router.use(requireAuthenticatedAdmin)"),
    ).toBeLessThan(source.indexOf('router.get("/access"'));
    expect(bridge).toContain('app.use("/api/system", sourceApi)');
    expect(
      fs.existsSync(path.join(repositoryRoot, "orbis-server/server.cjs")),
    ).toBe(false);
  });
});
