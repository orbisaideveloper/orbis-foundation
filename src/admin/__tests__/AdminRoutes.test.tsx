import { Suspense, isValidElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { adminRoutes } from "../routes/AdminRoutes";

const routes = adminRoutes.children ?? [];

function routeAt(path: string) {
  const route = routes.find((candidate) => candidate.path === path);
  if (!route?.element) throw new Error(`Missing admin route: ${path}`);
  return route.element;
}

describe("adminRoutes", () => {
  it("defines the protected admin shell and all supported route paths", () => {
    expect(adminRoutes.path).toBe("/admin");
    expect(isValidElement(adminRoutes.element)).toBe(true);
    expect(routes.map((route) => route.path)).toEqual([
      "dashboard",
      "engine",
      "brain",
      "health",
      "release",
    ]);
  });

  it("loads the engine and brain placeholder views", async () => {
    const { unmount } = render(
      <Suspense fallback={<span>Loading</span>}>{routeAt("engine")}</Suspense>,
    );
    expect(await screen.findByText("Engine Monitor Pipeline")).toBeInTheDocument();
    unmount();

    render(
      <Suspense fallback={<span>Loading</span>}>{routeAt("brain")}</Suspense>,
    );
    expect(
      await screen.findByText("Brain AI Provider Pipeline"),
    ).toBeInTheDocument();
  });
});
