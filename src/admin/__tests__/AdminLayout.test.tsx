import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminLayout from "../layout/AdminLayout";

describe("AdminLayout Accessibility and Structure", () => {
  it("renders the Protected Admin Control Center landmark", () => {
    render(
      <MemoryRouter>
        <AdminLayout />
      </MemoryRouter>,
    );

    // Check for main application role/label
    const appContainer = screen.getByRole("application", {
      name: /Protected Admin Control Center/i,
    });
    expect(appContainer).toBeDefined();

    // Ensure Title is present
    expect(screen.getByText(/ORBIS Admin Command Center/i)).toBeDefined();

    // Ensure Sidebar is present
    const sidebar = screen.getByRole("complementary", {
      name: /Admin Navigation/i,
    });
    expect(sidebar).toBeDefined();
  });
});
