/**
 * ⚠️ DEPRECATED — RETIRED AS A STANDALONE ENTRYPOINT (TASK-017)
 *
 * This file is no longer started by anything (package.json "start",
 * render.yaml, and local dev all now run orbis-server/bridge.cjs alone).
 * Its telemetry logic (Prisma/Postgres connection, /api/metrics and
 * /api/diagnostics) has been copied into
 * orbis-server/bridge.cjs, which is now the ONE canonical backend process.
 *
 * This file is kept on disk (not deleted) only because knip.json and
 * src/admin/registry/system-map.json still reference it as an entry/
 * registry item; removing it was out of scope for TASK-017's minimal
 * change set. Do NOT add a startup script that launches this file again —
 * that would recreate the exact "four entrypoints" confusion TASK-017
 * fixed. If you are looking for the live telemetry routes, they are in
 * orbis-server/bridge.cjs.
 */
const {
  getDiagnostics,
  sanitizeDiagnosticLogs,
  setDbClient,
} = require("./telemetry-module.cjs");
const { requireAuthenticatedAdmin } = require("./admin-auth.cjs");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const app = express();
app.use("/api/system", require("./source-api.cjs"));
app.use(cors());
app.use(express.json());

// 🟢 ডিপ ট্র্যাকিং সেন্সর (নাড়ি নক্ষত্র বের করার জন্য)
app.use((req, res, next) => {
  if (!req.url.includes("/api/diagnostics")) {
    console.log(
      `[NETWORK] ${req.method} Request incoming for route: ${req.url}`,
    );
  }
  next();
});

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// 🟢 ফিক্স: ট্রাফিক রিসিভ করার আগেই ডেটাবেস কানেকশন ইনিশিয়ালাইজ করে নেওয়া
prisma
  .$connect()
  .then(() => {
    console.log("[DB] Prisma Adapter successfully connected to Supabase!");
    setDbClient(prisma);
  })
  .catch(() => {
    console.error("[DB_ERROR] Prisma telemetry storage unavailable");
  });

app.get("/api/metrics", requireAuthenticatedAdmin, async (req, res) => {
  try {
    const latestMetric = await prisma.foundationAdminMetric.findFirst({
      orderBy: { recordedAt: "desc" },
    });
    if (latestMetric) {
      res.json(latestMetric);
    } else {
      res.json({ ramUsageMb: 0, cpuLoad: 0, status: "NO_DATA_YET" });
    }
  } catch (error) {
    console.error("[DB_ERROR] Failed to fetch metrics from Postgres");
    res.status(500).json({ error: "Database connection failed" });
  }
});

const PORT = process.env.PORT || 3001;

app.get("/api/diagnostics", requireAuthenticatedAdmin, async (req, res) => {
  try {
    const diag = getDiagnostics();
    const dbLogs = await prisma.foundationSystemLog.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    const safeDbLogs = sanitizeDiagnosticLogs(dbLogs);
    if (safeDbLogs.length > 0) diag.logs = safeDbLogs;
    res.json(diag);
  } catch (error) {
    res.json(getDiagnostics());
  }
});

app.listen(PORT, () => {
  console.log(
    `[LIFECYCLE] Backend API Server successfully booted on Port ${PORT}!`,
  );
});
