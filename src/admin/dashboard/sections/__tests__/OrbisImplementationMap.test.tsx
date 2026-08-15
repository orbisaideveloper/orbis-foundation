import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect } from "vitest";
import OrbisImplementationMap from "../OrbisImplementationMap";

describe("OrbisImplementationMap Section", () => {
  test("renders implementation map and tasks", () => {
    render(<OrbisImplementationMap />);

    expect(screen.getByText("ORBIS Implementation Map")).toBeTruthy();
    // getByText এর বদলে getByTestId ব্যবহার করা হলো যাতে ডুপ্লিকেট টেক্সটে কনফিউজ না হয়
    expect(screen.getByTestId("task-TASK-001")).toBeTruthy();
    expect(screen.getByTestId("task-TASK-006")).toBeTruthy();
    expect(screen.getByTestId("task-TASK-007")).toBeTruthy();
  });

  test("allows clicking a task to view details and go back", () => {
    render(<OrbisImplementationMap />);

    const taskCard = screen.getByTestId("task-TASK-007");
    fireEvent.click(taskCard);

    expect(
      screen.getByText(/Controlled Termux Capability Execution/i),
    ).toBeTruthy();

    const backButton = screen.getByText("← BACK");
    fireEvent.click(backButton);

    expect(screen.getByText("ORBIS Implementation Map")).toBeTruthy();
  });
});
