import { afterEach, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import "@testing-library/jest-dom";

// --- 100% SAFE GLOBAL FETCH MOCK ---
if (typeof global !== "undefined") {
  global.fetch = function () {
    return Promise.resolve({
      json: function () {
        return Promise.resolve({
          status: "ONLINE",
          uptime: "99.99%",
          ramUsedPercent: "45",
          load: "12.4",
          arch: "x64",
          release: "1.0.0",
          platform: "linux",
          cpuCores: 8,
          result: "Mock Tree",
        });
      },
    });
  } as any;
}
// -----------------------------------

describe("App Component", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("renders the application correctly", async () => {
    render(<App />);
    expect(
      (await screen.findAllByText(/Orbis Foundation/i))[0],
    ).toBeInTheDocument();
  });
  it("serves the permanent read-only dashboard preview at /preview", async () => {
    window.history.replaceState({}, "", "/preview");

    render(<App />);

    expect(
      (await screen.findAllByText(/read-only preview/i)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /^Sign in$/i }),
    ).not.toBeInTheDocument();
  });

});
