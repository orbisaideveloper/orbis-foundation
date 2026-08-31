import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticatedAdminFetch = vi.hoisted(() => vi.fn());
const readAdminJson = vi.hoisted(() => vi.fn());

vi.mock("../../auth/adminFetch", () => ({
  authenticatedAdminFetch,
  readAdminJson,
}));

import {
  loadManagedProductModels,
  publishManagedProductModel,
  reviewManagedProductModel,
} from "../modelRegistryClient";

const model = { id: "model-1", slug: "orbis-accounting-ai" };

describe("modelRegistryClient", () => {
  beforeEach(() => {
    authenticatedAdminFetch.mockReset();
    readAdminJson.mockReset();
  });

  it("loads the Admin-only registry through the shared safe JSON reader", async () => {
    readAdminJson.mockResolvedValue({ models: [model] });
    await expect(loadManagedProductModels()).resolves.toEqual([model]);
    expect(readAdminJson).toHaveBeenCalledWith("/api/admin/models");
  });

  it.each([
    ["review", reviewManagedProductModel],
    ["publish", publishManagedProductModel],
  ] as const)(
    "runs the %s action with an authenticated POST",
    async (action, call) => {
      authenticatedAdminFetch.mockResolvedValue(
        new Response(JSON.stringify({ model }), { status: 200 }),
      );
      await expect(call("orbis-accounting-ai")).resolves.toEqual(model);
      expect(authenticatedAdminFetch).toHaveBeenCalledWith(
        `/api/admin/models/orbis-accounting-ai/${action}`,
        { method: "POST" },
      );
    },
  );

  it("fails closed when an action response is unsuccessful or has no model", async () => {
    authenticatedAdminFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    await expect(reviewManagedProductModel("model")).rejects.toThrow("review");
    await expect(publishManagedProductModel("model")).rejects.toThrow(
      "published",
    );
  });
});
