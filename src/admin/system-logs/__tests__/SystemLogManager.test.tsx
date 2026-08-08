import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SystemLogManager from "../SystemLogManager";

const SYSTEM_LOGS = "System Logs & Source";
const SOURCE_EXPLORER = "Source Explorer";
const PROJECT_STRUCTURE = "Project Structure";
const TEST_FILE = "test.ts";
const OLD_FILE = "old.ts";
const SEARCH_PLACEHOLDER = "Search files or folders...";
const MONITOR_TITLE = "System Monitor & Live Source Explorer";
const BACK_TO_CARDS = "Back to Cards";

vi.mock("../../components/TimeMachine/TimeMachineCard", () => ({
  default: () => <div>Time Machine Content</div>,
}));

const tree = [
  {
    name: "src",
    path: "src",
    type: "directory",
    mtime: 200000,
    children: [
      {
        name: "test.ts",
        path: "src/test.ts",
        type: "file",
        mtime: 200000,
      },
      {
        name: "old.ts",
        path: "src/old.ts",
        type: "file",
        mtime: 1000,
      },
    ],
  },
];

beforeEach(() => {
  vi.restoreAllMocks();

  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/system/status") {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              success: true,
              hasError: true,
              file: "src/test.ts",
              errorLine: 2,
            }),
        });
      }

      if (url === "/api/system/tree") {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              success: true,
              tree,
            }),
        });
      }

      if (url.startsWith("/api/system/file")) {
        return Promise.resolve({
          json: () =>
            Promise.resolve({
              success: true,
              content: "line one\nline two\nline three",
            }),
        });
      }

      return Promise.reject(new Error("Unknown URL"));
    }),
  );
});

describe("SystemLogManager", () => {
  it("opens the system monitor", () => {
    render(<SystemLogManager />);

    fireEvent.click(screen.getByText(SYSTEM_LOGS));

    expect(screen.getByText(MONITOR_TITLE)).toBeInTheDocument();
  });

  it("opens source explorer and loads tree/status data", async () => {
    render(<SystemLogManager />);

    fireEvent.click(screen.getByText(SYSTEM_LOGS));
    fireEvent.click(screen.getByText(SOURCE_EXPLORER));

    await waitFor(() => {
      expect(screen.getByText(PROJECT_STRUCTURE)).toBeInTheDocument();
    });

    expect(screen.getByText(TEST_FILE)).toBeInTheDocument();
    expect(screen.getByText(OLD_FILE)).toBeInTheDocument();
  });

  it("filters the tree using search", async () => {
    render(<SystemLogManager />);

    fireEvent.click(screen.getByText(SYSTEM_LOGS));
    fireEvent.click(screen.getByText(SOURCE_EXPLORER));

    await waitFor(() => {
      expect(screen.getByText(TEST_FILE)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), {
      target: { value: "test" },
    });

    expect(screen.getByText(TEST_FILE)).toBeInTheDocument();
    expect(screen.queryByText(OLD_FILE)).not.toBeInTheDocument();
  });

  it("shows no matching files for an unmatched search", async () => {
    render(<SystemLogManager />);

    fireEvent.click(screen.getByText(SYSTEM_LOGS));
    fireEvent.click(screen.getByText(SOURCE_EXPLORER));

    await waitFor(() => {
      expect(screen.getByText(PROJECT_STRUCTURE)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), {
      target: { value: "does-not-exist" },
    });

    expect(screen.getByText("No matching files found.")).toBeInTheDocument();
  });

  it("copies the project tree", async () => {
    render(<SystemLogManager />);

    fireEvent.click(screen.getByText(SYSTEM_LOGS));
    fireEvent.click(screen.getByText(SOURCE_EXPLORER));

    await waitFor(() => {
      expect(screen.getByText(PROJECT_STRUCTURE)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Copy Tree"));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    expect(screen.getByText("Copied Tree")).toBeInTheDocument();
  });

  it("opens a file and loads source code", async () => {
    render(<SystemLogManager />);

    fireEvent.click(screen.getByText(SYSTEM_LOGS));
    fireEvent.click(screen.getByText(SOURCE_EXPLORER));

    await waitFor(() => {
      expect(screen.getByText(TEST_FILE)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(TEST_FILE));

    await waitFor(() => {
      expect(screen.getByText("line one")).toBeInTheDocument();
    });

    expect(screen.getByText("line two")).toBeInTheDocument();
    expect(screen.getByText("line three")).toBeInTheDocument();
  });

  it("copies loaded source code", async () => {
    render(<SystemLogManager />);

    fireEvent.click(screen.getByText(SYSTEM_LOGS));
    fireEvent.click(screen.getByText(SOURCE_EXPLORER));

    await waitFor(() => {
      expect(screen.getByText(TEST_FILE)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(TEST_FILE));

    await waitFor(() => {
      expect(screen.getByText("Copy Code")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Copy Code"));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "line one\nline two\nline three",
      );
    });

    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });

  it("returns from source explorer to cards", async () => {
    render(<SystemLogManager />);

    fireEvent.click(screen.getByText(SYSTEM_LOGS));
    fireEvent.click(screen.getByText(SOURCE_EXPLORER));

    await waitFor(() => {
      expect(screen.getByText(BACK_TO_CARDS)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(BACK_TO_CARDS));

    expect(screen.getByText("Hardware Node")).toBeInTheDocument();
  });

  it("opens and closes time machine", () => {
    render(<SystemLogManager />);

    fireEvent.click(screen.getByText(SYSTEM_LOGS));
    fireEvent.click(screen.getByText("Time Machine"));

    expect(screen.getByText("Time Machine Content")).toBeInTheDocument();

    fireEvent.click(screen.getByText(BACK_TO_CARDS));

    expect(screen.getByText("Hardware Node")).toBeInTheDocument();
  });

  it("closes the monitor with X button", () => {
    render(<SystemLogManager />);

    fireEvent.click(screen.getByText(SYSTEM_LOGS));

    expect(screen.getByText(MONITOR_TITLE)).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[buttons.length - 1]);

    expect(screen.queryByText(MONITOR_TITLE)).not.toBeInTheDocument();
  });
});
