import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TermuxObservatory } from "../TermuxObservatory";

const payload = {
  title: "TERMUX / ANDROID OBSERVATORY",
  purpose: "Real purpose",
  work: "Real work",
  currentPhase: "TASK-005 completed",
  currentResult: "5/5",
  completed: 5,
  auditedTasks: 5,
  progress: 100,

  tasks: [
    {
      task: "TASK-005",
      status: "PASS",
      passed: true,
      commit: "535c994",
      objective: "Implement observability",
      implementationSummary: "Real implementation",
      changedFiles: [],
      filesByLayer: {
        frontend: [],
        backend: [],
        core: [],
        runtime: [],
        audit: [],
        other: [],
      },
      dependencies: [],
      tests: "42/42",
      coverage: "48%",
      build: "PASS",
      typeCheck: "PASS",
      security: "PASS",
      architectureImpact: "Observability",
      knownIssues: "None",
      date: "2026-08-14",
      time: "12:08:43",
      implementer: "GEMINI",
      auditFile: "docs/AUDIT_REPORTS/005.md",
    },
  ],

  next: "TASK-006 will appear after evidence is committed.",

  systemMap: {
    frontend: [],
    backend: ["orbis-server/bridge.cjs"],
    core: [],
    runtime: [],
    audit: [],
    edges: [],
  },
};

beforeEach(() => {
  vi.restoreAllMocks();

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    }),
  );

  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

describe("TermuxObservatory", () => {
  it("renders real initiative progress", async () => {
    render(<TermuxObservatory />);

    expect(await screen.findByText(/5\s*\/\s*5\s*TASKS/i)).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("opens complete task evidence", async () => {
    render(<TermuxObservatory />);

    fireEvent.click(await screen.findByText("TASK-005"));

    const modalTitle = await screen.findByText("TASK-005 — REAL EVIDENCE");
    const modal = modalTitle.closest(".fixed");

    expect(modal).toBeTruthy();

    const evidence = within(modal as HTMLElement);

    expect(
      evidence.getByText("Implement observability", { exact: true }),
    ).toBeTruthy();

    expect(
      evidence.getByText("Real implementation", { exact: true }),
    ).toBeTruthy();

    expect(evidence.getByText(/COMMIT:\s*535c994/)).toBeTruthy();

    expect(evidence.getByText("42/42", { exact: true })).toBeTruthy();

    expect(evidence.getByText("48%", { exact: true })).toBeTruthy();

    expect(
      evidence.getByText("COPY FULL TASK EVIDENCE", { exact: true }),
    ).toBeTruthy();
  });

  it("shows repository data unavailable when the observatory API fails", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("API Failure"));

    render(<TermuxObservatory />);

    expect(
      await screen.findByText("LIVE OBSERVATORY DATA UNAVAILABLE"),
    ).toBeInTheDocument();
  });

  it("copies complete task evidence and shows copied state", async () => {
    render(<TermuxObservatory />);

    fireEvent.click(await screen.findByText("TASK-005"));

    const copyButton = await screen.findByRole("button", {
      name: /COPY FULL TASK EVIDENCE/i,
    });

    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify(payload.tasks[0], null, 2),
    );

    expect(
      await screen.findByRole("button", { name: /COPIED/i }),
    ).toBeInTheDocument();
  });

  it("opens purpose and system map", async () => {
    render(<TermuxObservatory />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: /PURPOSE \+ SYSTEM MAP/i,
      }),
    );

    const modalTitle = await screen.findByText("PURPOSE / SYSTEM MAP");
    const modal = modalTitle.closest(".fixed");

    expect(modal).toBeTruthy();

    const map = within(modal as HTMLElement);

    expect(map.getByText("Real purpose", { exact: true })).toBeTruthy();

    expect(map.getByText("Real work", { exact: true })).toBeTruthy();

    expect(
      map.getByText("orbis-server/bridge.cjs", { exact: true }),
    ).toBeTruthy();

    expect(
      map.getByText("TASK-005 completed — 5/5", { exact: true }),
    ).toBeTruthy();
  });
});
