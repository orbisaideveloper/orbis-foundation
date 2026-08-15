import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { TermuxObservatory } from "../TermuxObservatory";

global.fetch = vi.fn();

const mockData = {
  title: "TERMUX / ANDROID OBSERVATORY",
  completed: 1,
  auditedTasks: 1,
  progress: 100,
  next: "Future tasks appear here.",
  tasks: [
    {
      task: "TASK-001",
      status: "PASS",
      objective: "Test objective",
      implementationSummary: "Test summary",
      dependencies: [],
      filesByLayer: { core: ["src/core/test.ts"] },
      tests: "All passing",
      coverage: "100%",
      build: "Success",
      typeCheck: "Pass",
      security: "None",
      architectureImpact: "Minimal",
      commit: "abcdef",
      date: "2026-08-15",
      time: "09:00:00",
      implementer: "AI",
      auditFile: "001_audit.md",
    },
  ],
};

describe("TermuxObservatory UI Update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });
  });

  it("renders observatory and tasks correctly", async () => {
    render(<TermuxObservatory />);
    expect(
      await screen.findByText("TERMUX / ANDROID OBSERVATORY"),
    ).toBeInTheDocument();
    expect(await screen.findByText("TASK-001")).toBeInTheDocument();
  });

  it("opens detail modal on task click and verifies Copy/Back buttons", async () => {
    render(<TermuxObservatory />);
    const taskBtn = await screen.findByText("TASK-001");
    fireEvent.click(taskBtn);

    expect(await screen.findByText("Test summary")).toBeInTheDocument();

    // Copy Button exists at TOP
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();

    // Back Button exists at TOP
    const backBtn = screen.getByRole("button", { name: /back/i });
    expect(backBtn).toBeInTheDocument();

    // Close modal
    fireEvent.click(backBtn);
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /copy/i }),
      ).not.toBeInTheDocument();
    });
  });
});
