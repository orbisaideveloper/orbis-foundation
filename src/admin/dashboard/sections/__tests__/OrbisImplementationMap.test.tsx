import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import OrbisImplementationMap, { TASKS } from "../OrbisImplementationMap";

describe("OrbisImplementationMap Section", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });
  });

  test("1. Renders TASK-001 through TASK-007 (Task List Rendering)", () => {
    render(<OrbisImplementationMap />);
    TASKS.forEach((task) => {
      expect(screen.getByTestId(`task-${task.id}`)).toBeTruthy();
    });
  });

  test("3 & 4. Selecting a task opens detail view and BACK returns to list", () => {
    render(<OrbisImplementationMap />);
    fireEvent.click(screen.getByTestId("task-TASK-001"));
    expect(screen.getByText("← BACK")).toBeTruthy();
    expect(screen.getByText("COPY")).toBeTruthy();

    // BACK test
    fireEvent.click(screen.getByText("← BACK"));
    expect(screen.queryByText("← BACK")).toBeNull();
    expect(screen.getByTestId("task-TASK-001")).toBeTruthy();
  });

  test("5 & 6. COPY behavior copies exact structured detail from active task", () => {
    render(<OrbisImplementationMap />);
    fireEvent.click(screen.getByTestId("task-TASK-007"));
    const copyButton = screen.getByText("COPY");
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const copiedText = (navigator.clipboard.writeText as any).mock.calls[0][0];

    // Check universal schema fields exist in copied string
    expect(copiedText).toContain("TASK ID: TASK-007");
    expect(copiedText).toContain("STATUS: COMPLETED");
    expect(copiedText).toContain("PURPOSE:");
    expect(copiedText).toContain("CORE LOGIC:");
    expect(copiedText).toContain("DEPENDENCY:");
    expect(copiedText).toContain("SOURCE FILES:");
    expect(copiedText).toContain("TESTS & COVERAGE:");
    expect(copiedText).toContain("BUILD & TYPE CHECK:");
    expect(copiedText).toContain("SECURITY & ARCHITECTURE:");
    expect(copiedText).toContain("REAL OUTPUT / RESULT:");
    expect(copiedText).toContain("COMMIT: 7100abd");
    expect(copiedText).toContain(
      "AUDIT FILE: docs/AUDIT_REPORTS/007_2026-08-15_14-31-00.md",
    );
  });

  test("7 & 8. TASK-007 contains correct exact logic and audit info", () => {
    const task7 = TASKS.find((t) => t.id === "TASK-007");
    expect(task7?.logic).toBe(
      "Controlled execution of termux.system.info through the registered runtime, ExecutionPolicyEngine and SecureExecutionAuthorizationGate, returning structured runtime output without shell/spawn execution.",
    );
    expect(task7?.auditFile).toBe(
      "docs/AUDIT_REPORTS/007_2026-08-15_14-31-00.md",
    );
    expect(task7?.commit).toBe("7100abd");
  });

  test("9 & 10. Task count and progress is dynamically derived", () => {
    render(<OrbisImplementationMap />);
    expect(
      screen.getByText(
        `Persistent implementation chain — completed tasks remain visible (${TASKS.length}/${TASKS.length}).`,
      ),
    ).toBeTruthy();
  });
});
