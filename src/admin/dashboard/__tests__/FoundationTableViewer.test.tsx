import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAdminJson = vi.hoisted(() => vi.fn());
const SOURCE_HISTORY_TABLE = "FoundationSourceCodeHistory";
const PRIVATE_SOURCE_SNAPSHOT = "private source snapshot";

vi.mock("../../auth/adminFetch", () => ({ readAdminJson }));

import { FoundationTableViewerRow } from "../FoundationTableViewer";

describe("FoundationTableViewerRow", () => {
  const clipboardWrite = vi.fn();

  beforeEach(() => {
    readAdminJson.mockReset();
    clipboardWrite.mockReset();
    clipboardWrite.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
  });

  it("stays disabled in private/public-preview-off mode and performs no read", () => {
    render(
      <FoundationTableViewerRow
        table="FoundationBrainKnowledge"
        count={4}
        status="available"
        disabled
      />,
    );

    const row = screen.getByRole("button", {
      name: /FoundationBrainKnowledge: 4/i,
    });
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(readAdminJson).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", {
        name: /FoundationBrainKnowledge stored records/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("loads 50-row pages, opens one detail, copies safely, navigates, and closes", async () => {
    readAdminJson
      .mockResolvedValueOnce({
        table: SOURCE_HISTORY_TABLE,
        offset: 0,
        limit: 50,
        hasMore: true,
        rows: [
          {
            id: "history-1",
            filePath: "src/a.ts",
            versionHash: "v1",
            updatedAt: "2026-09-05T12:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        table: SOURCE_HISTORY_TABLE,
        row: {
          id: "history-1",
          filePath: "src/a.ts",
          versionHash: "v1",
          content: PRIVATE_SOURCE_SNAPSHOT,
          updatedAt: "2026-09-05T12:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({
        table: SOURCE_HISTORY_TABLE,
        offset: 50,
        limit: 50,
        hasMore: false,
        rows: [
          {
            id: "history-51",
            filePath: "src/b.ts",
            versionHash: "v2",
            updatedAt: "2026-09-05T13:00:00.000Z",
          },
        ],
      });

    render(
      <FoundationTableViewerRow
        table={SOURCE_HISTORY_TABLE}
        count={51}
        status="available"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /FoundationSourceCodeHistory: 51/i,
      }),
    );

    await waitFor(() =>
      expect(readAdminJson).toHaveBeenNthCalledWith(
        1,
        "/api/admin/foundation-tables/FoundationSourceCodeHistory/rows?offset=0&limit=50",
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: /src\/a\.ts/i }));

    await waitFor(() =>
      expect(readAdminJson).toHaveBeenNthCalledWith(
        2,
        "/api/admin/foundation-tables/FoundationSourceCodeHistory/rows/history-1",
      ),
    );
    expect(await screen.findByText(PRIVATE_SOURCE_SNAPSHOT)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy content" }));
    await waitFor(() =>
      expect(clipboardWrite).toHaveBeenCalledWith(PRIVATE_SOURCE_SNAPSHOT),
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy record" }));
    await waitFor(() =>
      expect(clipboardWrite).toHaveBeenCalledWith(
        expect.stringContaining(
          `"content": ${JSON.stringify(PRIVATE_SOURCE_SNAPSHOT)}`,
        ),
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Back to stored rows" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() =>
      expect(readAdminJson).toHaveBeenNthCalledWith(
        3,
        "/api/admin/foundation-tables/FoundationSourceCodeHistory/rows?offset=50&limit=50",
      ),
    );
    expect(await screen.findByText("src/b.ts")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Close stored records" }),
    );
    expect(
      screen.queryByRole("dialog", {
        name: /FoundationSourceCodeHistory stored records/i,
      }),
    ).not.toBeInTheDocument();
  });
});
