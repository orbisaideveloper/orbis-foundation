import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom";
import { AdminCoreProvider } from "../../providers/AdminCoreProvider";
import { useAuth } from "../../auth/AuthProvider";

// Dummy component to test context consumption inside the provider chain
const TestConsumer = () => {
  const { role } = useAuth();
  return <div data-testid="consumer-role">Current Role: {role}</div>;
};

describe("AdminCoreProvider Architecture (Step-303)", () => {
  it("successfully wraps children with all core providers without crashing", () => {
    render(
      <AdminCoreProvider>
        <TestConsumer />
      </AdminCoreProvider>,
    );

    // If it renders "GUEST", it means AuthProvider is successfully chained
    // inside AdminCoreProvider and providing the default state.
    expect(screen.getByTestId("consumer-role")).toHaveTextContent(
      "Current Role: GUEST",
    );
  });
});
