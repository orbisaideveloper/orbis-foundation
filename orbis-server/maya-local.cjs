// Local-only Maya gateway. Reuses canonical auth/router/provider; no Prisma runtime.
const path = require("node:path");
const os = require("node:os");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(os.homedir(), ".config/orbis/maya-gateway.env"), quiet: true });
require("./config/LocalProviderEnv.cjs").loadLocalProviderEnv();
const express = require("express");
const { requireAuthenticatedUser } = require("./admin-auth.cjs");
const { createMayaRouter } = require("./maya-api.cjs");
const { createMayaAuthorization } = require("./ai/maya/MayaAuthorization.cjs");
const app = express();
app.disable("x-powered-by");
app.use("/api/maya", createMayaRouter({ authMiddleware: requireAuthenticatedUser,
  providerManager: require("./ai/AIProviderManager.cjs"), authorizeCapability: createMayaAuthorization() }));
app.get("/health", (req, res) => res.json({ ok: true, runtime: "maya-local", authorizationConfigured: typeof createMayaAuthorization() === "function" }));
app.listen(3001, "127.0.0.1", () => console.log("Maya local gateway: http://127.0.0.1:3001 (Admin permission still required)"));
