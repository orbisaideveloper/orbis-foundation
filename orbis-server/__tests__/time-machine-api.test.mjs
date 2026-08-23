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
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";

const require = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiPath = path.resolve(testDirectory, "../time-machine-api.cjs");

let app;
let queryHandler = async () => ({ rows: [] });
const queryCalls = [];

beforeAll(async () => {
  const originalLoad = Module._load;
  class FakePool {
    query(sql, parameters) {
      queryCalls.push([sql, parameters]);
      return queryHandler(sql, parameters);
    }
  }

  delete require.cache[require.resolve(apiPath)];
  let timeMachine;
  try {
    Module._load = function (requestName, parent, isMain) {
      if (requestName === "pg") return { Pool: FakePool };
      return originalLoad.call(this, requestName, parent, isMain);
    };
    timeMachine = require(apiPath);
  } finally {
    Module._load = originalLoad;
  }

  await Promise.resolve();
  queryCalls.length = 0;
  app = express();
  app.use(express.json());
  app.use("/time-machine", timeMachine.router);
});

afterEach(() => {
  queryHandler = async () => ({ rows: [] });
  queryCalls.length = 0;
  vi.restoreAllMocks();
});

afterAll(() => {
  delete require.cache[require.resolve(apiPath)];
});

describe("Time Machine source protections", () => {
  it.each([
    ".env",
    "src/private-key.ts",
    "src/system-logs/events.ts",
    "src/generated/client.ts",
    "docs/audit/report.md",
    "orbis-server/database/seed.ts",
  ])(
    "rejects restricted sync path %s before any database write",
    async (filePath) => {
      const response = await request(app).post("/time-machine/sync").send({
        filePath,
        content: "safe-looking content",
        commitId: "commit-1",
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        message: "Valid source snapshot required",
      });
      expect(queryCalls).toHaveLength(0);
    },
  );

  it("writes a safe source snapshot and preserves the success shape", async () => {
    const response = await request(app).post("/time-machine/sync").send({
      filePath: "src/example.ts",
      content: "export const exact = true;\n",
      commitId: "commit-safe",
      status: "SUCCESS",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "TimeMachine record synced successfully",
    });
    expect(queryCalls).toHaveLength(2);
    expect(queryCalls[0][1]).toEqual([
      expect.any(String),
      "commit-safe",
      "src/example.ts",
      "export const exact = true;\n",
      "SUCCESS",
      "",
    ]);
  });

  it("filters legacy restricted rows and sanitizes crash details", async () => {
    queryHandler = async () => ({
      rows: [
        {
          commitId: "safe-commit",
          filePath: "src/example.ts",
          createdAt: "2026-08-23T00:00:00.000Z",
          status: "FAILED",
          errorMessage: "/private/path.ts:42 secret stack",
        },
        {
          commitId: "restricted-commit",
          filePath: "src/private-key.ts",
          createdAt: "2026-08-23T00:00:00.000Z",
          status: "FAILED",
          errorMessage: "must not appear",
        },
      ],
    });

    const response = await request(app).get("/time-machine/history");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      history: [
        {
          commitId: "safe-commit",
          createdAt: "2026-08-23T00:00:00.000Z",
          status: "FAILED",
          errorMessage: "Build failed",
          files: [{ filePath: "src/example.ts" }],
        },
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain("private-key");
    expect(JSON.stringify(response.body)).not.toContain("/private/path");
  });

  it("makes restricted and nonexistent version reads indistinguishable", async () => {
    const restricted = await request(app)
      .get("/time-machine/version")
      .query({ commitId: "commit-1", filePath: "src/private-key.ts" });
    const nonexistent = await request(app)
      .get("/time-machine/version")
      .query({ commitId: "commit-1", filePath: "src/missing.ts" });

    expect(restricted.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    expect(restricted.body).toEqual(nonexistent.body);
    expect(queryCalls).toHaveLength(1);
  });

  it("returns exact safe version text with the existing data shape", async () => {
    queryHandler = async () => ({
      rows: [
        {
          content: "line one\nline two",
          createdAt: "2026-08-23T00:00:00.000Z",
          status: "SUCCESS",
          errorMessage: "",
        },
      ],
    });

    const response = await request(app)
      .get("/time-machine/version")
      .query({ commitId: "commit-1", filePath: "src/example.ts" });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      content: "line one\nline two",
      createdAt: "2026-08-23T00:00:00.000Z",
      status: "SUCCESS",
      errorMessage: "",
    });
  });

  it("does not expose database errors", async () => {
    queryHandler = async () => {
      throw new Error("postgres://private-host database stack");
    };
    const response = await request(app).get("/time-machine/history");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: "Unable to load Time Machine history",
    });
    expect(JSON.stringify(response.body)).not.toContain("postgres");
  });
});
