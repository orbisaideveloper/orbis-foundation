// @vitest-environment node

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const express = require("express");
const request = require("supertest");
const XLSX = require("xlsx");
const {
  FoundationDataCapabilityOrchestrator,
} = require("../ai/FoundationDataCapabilityOrchestrator.cjs");
const {
  createFoundationCapabilityRouter,
} = require("../foundation-capability-api.cjs");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb", strict: true }));
  const authMiddleware = (req, res, next) => {
    if (req.get("Authorization") !== "Bearer verified-admin") {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }
    req.adminUser = { id: "admin-a" };
    return next();
  };
  app.use(
    "/api/admin/capabilities",
    createFoundationCapabilityRouter({
      orchestrator: new FoundationDataCapabilityOrchestrator({
        signingKey: Buffer.alloc(32, 4),
      }),
      authMiddleware,
      rateLimiter: (_req, _res, next) => next(),
    }),
  );
  return app;
}

describe("Task 3C Admin capability API", () => {
  it("rejects status, preparation, and execution before Admin authentication", async () => {
    const app = createApp();
    for (const [method, route] of [
      ["get", "/api/admin/capabilities/status"],
      ["post", "/api/admin/capabilities/prepare"],
      ["post", "/api/admin/capabilities/execute"],
    ]) {
      const response = await request(app)[method](route).send({});
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        message: "Authentication required",
      });
    }
  });

  it("reports unavailable and unwired work truthfully without advertising it as callable", async () => {
    const response = await request(createApp())
      .get("/api/admin/capabilities/status")
      .set("Authorization", "Bearer verified-admin");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "foundation.pdf.create",
          status: "UNAVAILABLE",
        }),
        expect.objectContaining({
          id: "foundation.pdf-to-xlsx",
          status: "NOT_IMPLEMENTED",
        }),
        expect.objectContaining({
          id: "foundation.chat.attachments",
          status: "NOT_WIRED",
        }),
      ]),
    );
    const unavailable = await request(createApp())
      .post("/api/admin/capabilities/prepare")
      .set("Authorization", "Bearer verified-admin")
      .send({ capabilityId: "foundation.pdf.create", input: {} });
    expect(unavailable.status).toBe(404);
    expect(unavailable.body.error.code).toBe("CAPABILITY_NOT_AVAILABLE");
  });

  it("downloads a generated XLSX directly in the approved response", async () => {
    const app = createApp();
    const input = {
      fileName: "admin-output.xlsx",
      sheets: [{ name: "Data", rows: [["safe", "=formula"]] }],
    };
    const prepared = await request(app)
      .post("/api/admin/capabilities/prepare")
      .set("Authorization", "Bearer verified-admin")
      .send({ capabilityId: "foundation.xlsx.create", input });
    expect(prepared.status).toBe(200);
    expect(prepared.body).toMatchObject({
      status: "AVAILABLE",
      approvalRequired: true,
    });

    const executed = await request(app)
      .post("/api/admin/capabilities/execute")
      .set("Authorization", "Bearer verified-admin")
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .send({
        capabilityId: "foundation.xlsx.create",
        input,
        approvalToken: prepared.body.approvalToken,
      });
    expect(executed.status).toBe(200);
    expect(executed.headers["cache-control"]).toBe("no-store");
    expect(executed.headers["content-disposition"]).toBe(
      'attachment; filename="admin-output.xlsx"',
    );
    const workbook = XLSX.read(executed.body, { type: "buffer" });
    expect(workbook.Sheets.Data.B1.v).toBe("'=formula");
  });

  it("preserves the safe execute error status and response shape", async () => {
    const response = await request(createApp())
      .post("/api/admin/capabilities/execute")
      .set("Authorization", "Bearer verified-admin")
      .send({
        capabilityId: "foundation.xlsx.create",
        input: {
          fileName: "admin-output.xlsx",
          sheets: [{ name: "Data", rows: [["safe"]] }],
        },
        approvalToken: "invalid",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        category: "foundation_capability",
        code: "APPROVAL_INVALID",
      },
    });
  });

  it("keeps processing transient and free of storage, telemetry, and raw-content logging", () => {
    const testDirectory = path.dirname(fileURLToPath(import.meta.url));
    const orchestratorSource = fs.readFileSync(
      path.resolve(
        testDirectory,
        "../ai/FoundationDataCapabilityOrchestrator.cjs",
      ),
      "utf8",
    );
    const apiSource = fs.readFileSync(
      path.resolve(testDirectory, "../foundation-capability-api.cjs"),
      "utf8",
    );
    const workerSource = fs.readFileSync(
      path.resolve(
        testDirectory,
        "../ai/foundation-file-capability-worker.cjs",
      ),
      "utf8",
    );
    const implementationSource = `${orchestratorSource}\n${apiSource}\n${workerSource}`;
    for (const prohibited of [
      "writeFile",
      "createWriteStream",
      "addSystemLog",
      ".create({",
      ".update({",
      ".upsert({",
      ".delete({",
      "supabase.storage",
      "console.log",
      "console.error",
    ]) {
      expect(implementationSource).not.toContain(prohibited);
    }
    expect(orchestratorSource).toContain("resourceLimits:");
    expect(orchestratorSource).toContain("worker.terminate()");
  });
});
