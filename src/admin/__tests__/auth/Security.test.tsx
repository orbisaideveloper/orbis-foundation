import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom"; // FIX for "Invalid Chai property"
import { AuthGuard } from "../../auth/AuthGuard";
import * as AuthProviderModule from "../../auth/AuthProvider";

// Mock the useAuth hook to control authentication states
vi.mock("../../auth/AuthProvider", async () => {
  const actual = await vi.importActual("../../auth/AuthProvider");
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe("Security Foundation (Step-303)", () => {
  it("blocks unauthenticated access", () => {
    // Simulate: User is NOT logged in
    vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
      user: null,
      role: "GUEST",
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      hasPermission: vi.fn().mockReturnValue(false),
    });

    render(
      <AuthGuard>
        <div data-testid="protected-content">Secret System Data</div>
      </AuthGuard>,
    );

    expect(screen.getByText(/SECURITY BREACH/i)).toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("allows access to specific roles and blocks others", () => {
    // Simulate: User IS logged in, but lacks 'SYSTEM_RESTART' permission
    vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
      user: "operator-01",
      role: "OPERATOR",
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      hasPermission: vi
        .fn()
        .mockImplementation((perm) => perm !== "SYSTEM_RESTART"),
    });

    render(
      <AuthGuard requiredPermission="SYSTEM_RESTART">
        <div data-testid="restricted-content">Core Engine Restart</div>
      </AuthGuard>,
    );

    expect(screen.getByText(/RESTRICTED/i)).toBeInTheDocument();
    expect(screen.queryByTestId("restricted-content")).not.toBeInTheDocument();
  });
});
