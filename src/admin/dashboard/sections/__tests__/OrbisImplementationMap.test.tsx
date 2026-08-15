import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import OrbisImplementationMap from "../OrbisImplementationMap";

describe("OrbisImplementationMap", () => {
  it("renders TASK-001 through TASK-005", () => {
    render(<OrbisImplementationMap />);

    for (const task of [
      "TASK-001",
      "TASK-002",
      "TASK-003",
      "TASK-004",
      "TASK-005",
    ]) {
      expect(screen.getByTestId(`task-${task}`)).toBeTruthy();
    }
  });

  it("shows the complete implementation chain", () => {
    render(<OrbisImplementationMap />);

    expect(
      screen.getByText("TASK-001 → TASK-002 → TASK-003 → TASK-004 → TASK-005"),
    ).toBeTruthy();
  });

  it("shows the real Termux runtime source locations", () => {
    render(<OrbisImplementationMap />);

    expect(
      screen.getByText("src/core/execution/runtimes/TermuxRuntime.ts"),
    ).toBeTruthy();

    expect(
      screen.getByText("src/core/execution/runtimes/TermuxRuntimeService.ts"),
    ).toBeTruthy();
  });
});
