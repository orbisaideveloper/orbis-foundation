import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiagnosticExportActions } from "../DiagnosticExportActions";
import { readAdminJson } from "../../auth/adminFetch";

vi.mock("../../auth/adminFetch", () => ({
  readAdminJson: vi.fn(),
}));

const report = {
  schema: "orbis.foundation.admin-diagnostic.v1",
  redacted: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readAdminJson).mockResolvedValue(report);
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  URL.createObjectURL = vi.fn(() => "blob:diagnostic");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

describe("DiagnosticExportActions", () => {
  it("copies the authenticated redacted export on the Admin device", async () => {
    render(<DiagnosticExportActions />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy redacted diagnostic report",
      }),
    );

    await waitFor(() => {
      expect(readAdminJson).toHaveBeenCalledWith(
        "/api/admin/diagnostic-export",
      );
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify(report, null, 2),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("copied");
  });

  it("downloads the bounded report as JSON", async () => {
    render(<DiagnosticExportActions />);
    fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:diagnostic");
    expect(await screen.findByRole("status")).toHaveTextContent("downloaded");
  });
});
