/**
 * ORBIS TimeMachineCard Coverage Tests
 * TEST-ONLY — DO NOT MODIFY APPLICATION SOURCE
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import TimeMachineCard from "../components/TimeMachine/TimeMachineCard";

const historyResponse = {
  success: true,
  history: [
    {
      commitId: "abcdef1234567890",
      status: "PASSED",
      createdAt: "2026-08-08T04:30:00.000Z",
      files: [
        { filePath: "src/test/added.ts" },
        { filePath: "src/test/removed.ts" },
      ],
    },
    {
      commitId: "failed12567890",
      status: "FAILED",
      createdAt: "2026-08-08T05:30:00.000Z",
      errorMessage: "Build failed with Error 404",
      files: [{ filePath: "src/test/failed.ts" }],
    },
  ],
};

describe("TimeMachineCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(historyResponse),
      }),
    );

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders loading state and then commit history", async () => {
    render(<TimeMachineCard />);

    expect(
      screen.getByText("Loading grouped commit logs..."),
    ).toBeInTheDocument();

    expect((await screen.findAllByText(/Commit:/)).length).toBeGreaterThan(0);
    expect(screen.getByText("✅ PASSED")).toBeInTheDocument();
    expect(screen.getByText("❌ CI FAILED")).toBeInTheDocument();
    expect(screen.getByText(/Files Changed \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Files Changed \(1\)/)).toBeInTheDocument();
  });

  it("renders failed build error message", async () => {
    render(<TimeMachineCard />);

    expect(await screen.findByText("Failure Reason:")).toBeInTheDocument();

    expect(screen.getByText(/Build failed with Error 404/)).toBeInTheDocument();
  });

  it("filters history by commit id and file path", async () => {
    render(<TimeMachineCard />);

    await screen.findAllByText(/Commit:/);

    const search = screen.getByPlaceholderText(
      "Search by commit ID or file path...",
    );

    fireEvent.change(search, {
      target: { value: "failed12" },
    });

    expect(screen.getByText(/failed12/i)).toBeInTheDocument();

    fireEvent.change(search, {
      target: { value: "failed.ts" },
    });

    expect(screen.getByText(/failed.ts/)).toBeInTheDocument();

    fireEvent.change(search, {
      target: { value: "does-not-exist" },
    });

    expect(screen.getByText("No logs found.")).toBeInTheDocument();
  });

  it("opens version content by mouse click", async () => {
    const fetchMock = vi.mocked(fetch);

    fetchMock
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue(historyResponse),
      } as Response)
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            content: "const value = 42;",
          },
        }),
      } as Response);

    render(<TimeMachineCard />);

    const file = await screen.findByText(/src\/test\/added.ts/);

    fireEvent.click(file);

    expect(await screen.findByText("📋 Copy Code")).toBeInTheDocument();

    expect(screen.getByText("const value = 42;")).toBeInTheDocument();
  });

  it("opens version content with Enter and Space keyboard actions", async () => {
    const fetchMock = vi.mocked(fetch);

    fetchMock
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue(historyResponse),
      } as Response)
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            content: "keyboard content",
          },
        }),
      } as Response);

    render(<TimeMachineCard />);

    const file = await screen.findByText(/src\/test\/added.ts/);

    fireEvent.keyDown(file, { key: "Enter" });

    expect(await screen.findByText("keyboard content")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "← Back" }));

    const fileAgain = await screen.findByText(/src\/test\/added.ts/);

    fetchMock.mockResolvedValueOnce({
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          content: "space keyboard content",
        },
      }),
    } as Response);

    fireEvent.keyDown(fileAgain, { key: " " });

    expect(
      await screen.findByText("space keyboard content"),
    ).toBeInTheDocument();
  });

  it("handles missing version content", async () => {
    const fetchMock = vi.mocked(fetch);

    fetchMock
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue(historyResponse),
      } as Response)
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          success: false,
        }),
      } as Response);

    render(<TimeMachineCard />);

    fireEvent.click(await screen.findByText(/src\/test\/added.ts/));

    expect(
      await screen.findByText("// Version content not found"),
    ).toBeInTheDocument();
  });

  it("handles version API failure", async () => {
    const fetchMock = vi.mocked(fetch);

    fetchMock
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue(historyResponse),
      } as Response)
      .mockRejectedValueOnce(new Error("version failure"));

    render(<TimeMachineCard />);

    fireEvent.click(await screen.findByText(/src\/test\/added.ts/));

    expect(
      await screen.findByText("// Failed to fetch version content"),
    ).toBeInTheDocument();
  });

  it("handles history API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("history failure")),
    );

    render(<TimeMachineCard />);

    await waitFor(() => {
      expect(screen.getByText("No logs found.")).toBeInTheDocument();
    });

    expect(console.error).toHaveBeenCalled();
  });

  it("handles empty history response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          success: true,
          history: [],
        }),
      }),
    );

    render(<TimeMachineCard />);

    expect(await screen.findByText("No logs found.")).toBeInTheDocument();
  });

  it("handles history response without a valid history array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          success: false,
        }),
      }),
    );

    render(<TimeMachineCard />);

    expect(await screen.findByText("No logs found.")).toBeInTheDocument();
  });

  it("renders N/A commit and missing optional fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          success: true,
          history: [
            {
              status: "PASSED",
            },
          ],
        }),
      }),
    );

    render(<TimeMachineCard />);

    expect(await screen.findByText("Commit: N/A")).toBeInTheDocument();
    expect(screen.getByText("Files Changed (0):")).toBeInTheDocument();
  });

  it("renders diff lines and smart copy formatting", async () => {
    const fetchMock = vi.mocked(fetch);

    fetchMock
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue(historyResponse),
      } as Response)
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            content: [
              "Error: crash",
              "failure detected",
              "404 not found",
              "+ added line",
              "NEWLY EDITED value",
              "Fix: corrected logic",
              "ALTER TABLE users",
              "- removed line",
              "DELETE FROM users",
              "normal line",
            ].join("\n"),
          },
        }),
      } as Response);

    render(<TimeMachineCard />);

    fireEvent.click(await screen.findByText(/failed.ts/));

    expect(await screen.findByText(/Error: crash/)).toBeInTheDocument();
    expect(screen.getByText(/failure detected/)).toBeInTheDocument();
    expect(screen.getByText(/404 not found/)).toBeInTheDocument();
    expect(screen.getByText(/\+ added line/)).toBeInTheDocument();
    expect(screen.getByText(/NEWLY EDITED value/)).toBeInTheDocument();
    expect(screen.getByText(/Fix: corrected logic/)).toBeInTheDocument();
    expect(screen.getByText(/ALTER TABLE users/)).toBeInTheDocument();
    expect(screen.getByText(/- removed line/)).toBeInTheDocument();
    expect(screen.getByText(/DELETE FROM users/)).toBeInTheDocument();
    expect(screen.getByText(/normal line/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "📋 Copy Code" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    expect(screen.getByText("✅ Smart Copied!")).toBeInTheDocument();

    const copiedText = vi.mocked(navigator.clipboard.writeText).mock
      .calls[0][0];

    expect(copiedText).toContain("FAILED BUILD");
    expect(copiedText).toContain("CRASH/ERROR");
    expect(copiedText).toContain("NEW_ADDITION");
    expect(copiedText).toContain("REMOVED");
  });

  it("copies stable build and supports Back navigation", async () => {
    const fetchMock = vi.mocked(fetch);

    fetchMock
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue(historyResponse),
      } as Response)
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            content: "stable code",
          },
        }),
      } as Response);

    render(<TimeMachineCard />);

    fireEvent.click(await screen.findByText(/added.ts/));

    expect(await screen.findByText("stable code")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "📋 Copy Code" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    const copiedText = vi.mocked(navigator.clipboard.writeText).mock
      .calls[0][0];

    expect(copiedText).toContain("STABLE BUILD");

    fireEvent.click(screen.getByRole("button", { name: "← Back" }));

    expect(
      await screen.findByText("⏳ Source Time Machine"),
    ).toBeInTheDocument();
  });
});
