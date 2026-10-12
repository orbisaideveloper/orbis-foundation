import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const { createMayaAuthorization } = require("../ai/maya/MayaAuthorization.cjs");
const { parseMayaResponse } = require("../ai/maya/MayaService.cjs");
const env = { MAYA_MEMBERSHIP_URL: "https://admin.example/functions/v1/orbis-maya-access", SUPABASE_URL: "https://auth.example", MAYA_MEMBERSHIP_SERVICE_KEY: "private-test-key", MAYA_MEMBERSHIP_SOURCE_PROJECT_ID: "orbis-foundation" };
const request = { userId: "11111111-1111-4111-8111-111111111111", projectId: "orbis-maya", capability: "general.chat" };
const allowed = { ...request, version: "maya.access.v1", authIssuer: "https://auth.example", allowed: true, orbisIdentityId: "11111111-1111-7111-8111-111111111111" };
describe("real Maya provider and central permission contract", () => {
  it("accepts the actual flat provider shape and retains nested compatibility", () => {
    expect(parseMayaResponse("general.chat", { content: '{"reply":"নমস্কার"}' })).toEqual({ reply: "নমস্কার" });
    expect(parseMayaResponse("general.chat", { message: { content: '{"reply":"নমস্কার"}' } })).toEqual({ reply: "নমস্কার" });
    expect(parseMayaResponse("general.chat", { content: "not JSON" })).toBeNull();
  });
  it("fails closed for missing/unsafe configuration", () => {
    expect(createMayaAuthorization({ env: {} })).toBeUndefined();
    expect(createMayaAuthorization({ env: { ...env, MAYA_MEMBERSHIP_URL: "http://admin.example" } })).toBeUndefined();
    expect(createMayaAuthorization({ env: { ...env, MAYA_MEMBERSHIP_SERVICE_KEY: "" } })).toBeUndefined();
  });
  it("sends only server identity and scoped capability and requires canonical permission", async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true, json: async () => allowed });
    const authorize = createMayaAuthorization({ env, fetchImpl: transport });
    expect(await authorize(request)).toBe(true);
    expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({ ...request, version: "maya.access.v1", authIssuer: "https://auth.example", sourceProjectId: "orbis-foundation" });
    expect(transport.mock.calls[0][1].redirect).toBe("error");
    transport.mockResolvedValueOnce({ ok: true, json: async () => ({ ...allowed, allowed: false }) });
    expect(await authorize(request)).toBe(false);
    for (const change of [{ userId: "different" }, { authIssuer: "https://other.example" }, { capability: "dream.analysis" }, { orbisIdentityId: request.userId }]) {
      transport.mockResolvedValueOnce({ ok: true, json: async () => ({ ...allowed, ...change }) });
      await expect(authorize(request)).rejects.toMatchObject({ code: "MAYA_POLICY_UNAVAILABLE" });
    }
  });
  it("never requests privileged/invalid capabilities and distinguishes unavailable policy", async () => {
    const transport = vi.fn().mockRejectedValue(new Error("secret"));
    const authorize = createMayaAuthorization({ env, fetchImpl: transport });
    expect(await authorize({ ...request, capability: "development.deploy" })).toBe(false);
    expect(await authorize({ ...request, userId: "unknown" })).toBe(false);
    expect(transport).not.toHaveBeenCalled();
    await expect(authorize(request)).rejects.toMatchObject({ code: "MAYA_POLICY_UNAVAILABLE" });
    transport.mockResolvedValueOnce({ ok: false });
    await expect(authorize(request)).rejects.toMatchObject({ code: "MAYA_POLICY_UNAVAILABLE" });
  });
  it("reports a policy timeout without interpreting it as denied membership", async () => {
    const transport = (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("private transport details")));
    });
    const authorize = createMayaAuthorization({ env, fetchImpl: transport, timeoutMs: 5 });
    await expect(authorize(request)).rejects.toMatchObject({ code: "MAYA_POLICY_TIMEOUT" });
  });
});
