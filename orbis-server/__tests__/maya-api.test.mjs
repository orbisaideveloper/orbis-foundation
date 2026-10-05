import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";

const require = createRequire(import.meta.url);
const { createMayaRouter } = require("../maya-api.cjs");
const { buildMayaMessages, parseMayaResponse, generateMayaResult } = require("../ai/maya/MayaService.cjs");
const ORIGIN = "http://127.0.0.1:5174";
const PATH = "/api/maya/request";
const body = () => ({ version: "maya.v1", capability: "general.chat", language: "bn", input: { messages: [{ role: "user", content: "হ্যালো" }] } });
const reply = () => ({ message: { content: JSON.stringify({ reply: "হ্যালো" }) } });
function setup(options = {}) {
  const providerManager = { generateChat: vi.fn().mockResolvedValue(reply()) };
  const auth = vi.fn((req, res, next) => {
    if (req.get("Authorization") !== "Bearer test") return res.status(401).json({ success: false });
    req.publicUser = { id: req.get("X-Test-User") || "verified-user" };
    return next();
  });
  const authorizeCapability = vi.fn().mockResolvedValue(true);
  const app = express();
  app.use("/api/maya", createMayaRouter({ providerManager, authMiddleware: auth, authorizeCapability, allowedOrigins: [ORIGIN], ...options }));
  const send = (payload = body()) => supertest(app).post(PATH).set("Origin", ORIGIN).set("Authorization", "Bearer test").send(payload);
  return { app, send, providerManager, authorizeCapability, auth };
}

describe("Maya gateway boundary", () => {
  it("fails closed without the Admin authorization adapter", async () => {
    const fixture = setup({ authorizeCapability: undefined });
    expect((await fixture.send()).body.error.code).toBe("MAYA_AUTHORIZATION_UNAVAILABLE");
    expect(fixture.providerManager.generateChat).not.toHaveBeenCalled();
  });
  it("rejects missing/disallowed origins before authentication", async () => {
    const fixture = setup();
    for (const origin of [null, "https://attacker.invalid"]) {
      const request = supertest(fixture.app).post(PATH).send(body());
      if (origin) request.set("Origin", origin);
      expect((await request).status).toBe(403);
    }
    expect(fixture.auth).not.toHaveBeenCalled();
  });
  it("handles preflight and rejects unrelated routes", async () => {
    const { app } = setup();
    expect((await supertest(app).options(PATH).set("Origin", ORIGIN)).status).toBe(204);
    expect((await supertest(app).get(PATH).set("Origin", ORIGIN)).status).toBe(404);
  });
  it("requires a verified token, JSON and server-derived identity", async () => {
    const { app } = setup();
    expect((await supertest(app).post(PATH).set("Origin", ORIGIN).send(body())).status).toBe(401);
    expect((await supertest(app).post(PATH).set("Origin", ORIGIN).set("Authorization", "Bearer test").type("text").send("hello")).status).toBe(415);
    const fixture = setup({ authMiddleware: (req, res, next) => next() });
    expect((await fixture.send()).status).toBe(401);
  });
  it("rejects malformed, oversized and privileged inputs", async () => {
    const { app, send, providerManager } = setup();
    expect((await send({ ...body(), capability: "termux.repository.patch" })).status).toBe(400);
    expect((await send({ ...body(), capability: "astro.interpretation" })).status).toBe(503);
    expect((await send({ huge: "x".repeat(40000) })).status).toBe(413);
    expect((await supertest(app).post(PATH).set("Origin", ORIGIN).set("Authorization", "Bearer test").type("json").send("{")).status).toBe(400);
    expect(providerManager.generateChat).not.toHaveBeenCalled();
  });
  it("passes only verified identity and allowed capability to policy", async () => {
    const fixture = setup();
    const response = await fixture.send();
    expect(response.status).toBe(200);
    expect(response.body.result).toEqual({ reply: "হ্যালো" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(fixture.authorizeCapability).toHaveBeenCalledWith({ userId: "verified-user", projectId: "orbis-maya", capability: "general.chat" });
    expect(fixture.providerManager.generateChat.mock.calls[0][1].task).toBe("general-chat");
  });
  it("denies unauthorized capabilities and hides policy/provider failures", async () => {
    const fixture = setup();
    fixture.authorizeCapability.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("secret"));
    expect((await fixture.send()).status).toBe(403);
    expect((await fixture.send()).body.error.code).toBe("MAYA_SERVICE_UNAVAILABLE");
    fixture.providerManager.generateChat.mockRejectedValueOnce(new Error("secret"));
    expect((await fixture.send()).text).not.toContain("secret");
  });
  it("bounds rate windows and user buckets", async () => {
    let now = 0;
    const fixture = setup({ maxRequests: 1, maxUsers: 1, clock: () => now });
    expect((await fixture.send()).status).toBe(200);
    const limited = await fixture.send();
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
    expect((await fixture.send().set("X-Test-User", "another")).status).toBe(503);
    now = 60001;
    expect((await fixture.send()).status).toBe(200);
  });
  it("retains provider concurrency slots after the HTTP deadline", async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const fixture = setup({ timeoutMs: 10, maxConcurrent: 1 });
    fixture.providerManager.generateChat.mockReturnValueOnce(pending);
    expect((await fixture.send()).status).toBe(504);
    expect((await fixture.send()).status).toBe(429);
    expect((await fixture.send().set("X-Test-User", "another")).status).toBe(429);
    release(reply());
    await pending;
    expect((await fixture.send()).status).toBe(200);
  });
  it("bounds authorization wait and releases the request slot", async () => {
    const fixture = setup({ policyTimeoutMs: 10 });
    fixture.authorizeCapability.mockReturnValueOnce(new Promise(() => {}));
    expect((await fixture.send()).status).toBe(504);
    expect(fixture.providerManager.generateChat).not.toHaveBeenCalled();
    expect((await fixture.send()).status).toBe(200);
  });
});

describe("Maya restricted provider service", () => {
  it("builds server-owned prompts for Bengali, English and Hindi", () => {
    for (const language of ["bn", "en", "hi"]) {
      const messages = buildMayaMessages({ ...body(), language });
      expect(messages[0].role).toBe("system");
      expect(messages[1].content).toBe("হ্যালো");
    }
    const messages = buildMayaMessages({ version: "maya.v1", capability: "dream.analysis", language: "bn", input: { dream: "নদী" } });
    expect(messages[0].content).toContain("reflectionQuestions");
    expect(JSON.parse(messages[1].content)).toEqual({ dream: "নদী" });
  });
  it("uses Foundation response validation for fallback and rejects invalid JSON", async () => {
    for (const response of [null, { message: { content: "```json {} ```" } }, { message: { content: "x".repeat(50000) } }, { message: { content: "{}" } }]) {
      expect(parseMayaResponse("general.chat", response)).toBe(null);
    }
    const provider = { generateChat: vi.fn(async (messages, options) => {
      expect(options.validateResponse({ message: { content: "{}" } })).toBe(false);
      expect(options.validateResponse(reply())).toBe(true);
      return reply();
    }) };
    expect(await generateMayaResult(provider, body())).toEqual({ reply: "হ্যালো" });
    provider.generateChat.mockResolvedValueOnce({ message: { content: "{}" } });
    await expect(generateMayaResult(provider, body())).rejects.toThrow("MAYA_RESULT_INVALID");
  });
});
