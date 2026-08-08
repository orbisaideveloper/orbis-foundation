import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminSidebar from "../layout/AdminSidebar";

describe("AdminSidebar Navigation", () => {
  it("renders all essential navigation links", () => {
    render(
      <MemoryRouter>
        <AdminSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("Engine Monitor")).toBeDefined();
    expect(screen.getByText("Brain Monitor")).toBeDefined();
    expect(screen.getByText("System Health")).toBeDefined();
    expect(screen.getByText("Release Manager")).toBeDefined();
    expect(screen.getByText(/Zero Mock Data Policy Enforced/i)).toBeDefined();
  });
});
