// @vitest-environment node
import { createRequire } from "node:module";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
afterEach(() => vi.restoreAllMocks());

it.each([true, false])("wires the local gateway securely without a real listener; configured=%s", configured => {
  const app = { disable: vi.fn(), use: vi.fn(), get: vi.fn(), listen: vi.fn((_port, _host, callback) => callback()) };
  const authMiddleware = vi.fn();
  const router = { fixture: "router" };
  const providerManager = { fixture: "providers" };
  const authorization = configured ? vi.fn() : undefined;
  const createMayaAuthorization = vi.fn(() => authorization);
  const createMayaRouter = vi.fn(() => router);
  const loadLocalProviderEnv = vi.fn();
  const dotenv = require("dotenv");
  const config = vi.spyOn(dotenv, "config").mockReturnValue({ parsed: {} });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(os, "homedir").mockReturnValue("/tmp/orbis-fixture-home");
  const replacements = [
    ["express", vi.fn(() => app)],
    ["../config/LocalProviderEnv.cjs", { loadLocalProviderEnv }],
    ["../admin-auth.cjs", { requireAuthenticatedUser: authMiddleware }],
    ["../maya-api.cjs", { createMayaRouter }],
    ["../ai/maya/MayaAuthorization.cjs", { createMayaAuthorization }],
    ["../ai/AIProviderManager.cjs", providerManager],
  ];
  const originalModules = [];
  const entry = require.resolve("../maya-local.cjs");
  const previousEntry = require.cache[entry];
  try {
    for (const [name, exports] of replacements) {
      const id = require.resolve(name);
      originalModules.push([id, require.cache[id]]);
      require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    delete require.cache[entry];
    require("../maya-local.cjs");
    expect(config).toHaveBeenCalledWith({ path: "/tmp/orbis-fixture-home/.config/orbis/maya-gateway.env", quiet: true });
    expect(loadLocalProviderEnv).toHaveBeenCalledOnce();
    expect(app.disable).toHaveBeenCalledWith("x-powered-by");
    expect(createMayaRouter).toHaveBeenCalledWith({ authMiddleware, providerManager, authorizeCapability: authorization });
    expect(app.use).toHaveBeenCalledWith("/api/maya", router);
    expect(app.listen).toHaveBeenCalledWith(3001, "127.0.0.1", expect.any(Function));
    const json = vi.fn();
    const [route, health] = app.get.mock.calls[0];
    expect(route).toBe("/health");
    health({}, { json });
    expect(json).toHaveBeenCalledWith({ ok: true, runtime: "maya-local", authorizationConfigured: configured });
    expect(log).toHaveBeenCalledOnce();
  } finally {
    delete require.cache[entry];
    if (previousEntry) require.cache[entry] = previousEntry;
    for (const [id, original] of originalModules) {
      delete require.cache[id];
      if (original) require.cache[id] = original;
    }
  }
});
