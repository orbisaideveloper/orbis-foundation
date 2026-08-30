import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LearningReviewPanel } from "../LearningReviewPanel";

const mocks = vi.hoisted(() => ({ readAdminJson: vi.fn() }));

vi.mock("../../../auth/adminFetch", () => ({
  readAdminJson: mocks.readAdminJson,
}));

const pattern = {
  route: "web-search",
  intent: "live-information",
  confidence: "high",
  evidenceRequired: true,
  reason: "time-sensitive-request",
  outcome: "failed" as const,
  feedbackCode: "missing-evidence",
  occurrences: 2,
  firstOccurredAt: "2026-08-29T12:00:00.000Z",
  lastOccurredAt: "2026-08-30T12:00:00.000Z",
};

const candidate = {
  content:
    "Time-sensitive responses require evidence-backed verification before final delivery.",
  category: "OPERATING_RULE",
  tags: ["evidence", "verification"],
};

describe("LearningReviewPanel", () => {
  beforeEach(() => {
    mocks.readAdminJson.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.readAdminJson.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith("/review-patterns") && !init?.method) {
        return { patterns: [pattern] };
      }
      if (path.endsWith("/records") && !init?.method) {
        return {
          records: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              ...candidate,
              isActive: true,
              createdAt: "2026-08-30T12:00:00.000Z",
            },
          ],
        };
      }
      if (path.endsWith("/review-patterns/preview") && init?.method === "POST") {
        return { candidate, approvalToken: "opaque", expiresAt: 1_800_000_000_000 };
      }
      if (path.endsWith("/approve") && init?.method === "POST") {
        return { record: { id: "11111111-1111-4111-8111-111111111111" }, duplicate: false };
      }
      if (path.endsWith("/records/11111111-1111-4111-8111-111111111111") && init?.method === "DELETE") {
        return { deleted: true };
      }
      throw new Error(`unexpected request: ${path}`);
    });
  });

  it("uses aggregate metadata for a preview and requires explicit approval before saving", async () => {
    render(<LearningReviewPanel previewMode={false} />);

    await screen.findByText(/missing-evidence · failed/i);
    fireEvent.click(screen.getByRole("button", { name: "Review rule" }));

    await screen.findByText("Proposed safe rule");
    const previewCall = mocks.readAdminJson.mock.calls.find(
      ([path, init]) => path.endsWith("/review-patterns/preview") && init?.method === "POST",
    );
    expect(previewCall).toBeDefined();
    expect(previewCall?.[1]?.body).toBe(
      JSON.stringify({
        consent: true,
        pattern: {
          route: "web-search",
          intent: "live-information",
          confidence: "high",
          evidenceRequired: true,
          reason: "time-sensitive-request",
          outcome: "failed",
          feedbackCode: "missing-evidence",
        },
      }),
    );
    expect(JSON.stringify(previewCall)).not.toContain("sourceText");

    expect(
      mocks.readAdminJson.mock.calls.some(([path]) => path.endsWith("/approve")),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Approve rule" }));
    await screen.findByRole("status");
    expect(
      mocks.readAdminJson.mock.calls.some(([path]) => path.endsWith("/approve")),
    ).toBe(true);
  });

  it("allows an Admin to decline a preview without saving and remove an existing approved rule", async () => {
    render(<LearningReviewPanel previewMode={false} />);
    await screen.findByText(/missing-evidence · failed/i);

    fireEvent.click(screen.getByRole("button", { name: "Review rule" }));
    await screen.findByText("Proposed safe rule");
    fireEvent.click(screen.getByRole("button", { name: "Do not save" }));
    expect(
      screen.getByText(/No rule was saved. This pattern remains available/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove rule" }));
    await waitFor(() => {
      expect(
        mocks.readAdminJson.mock.calls.some(
          ([path, init]) => path.endsWith("/records/11111111-1111-4111-8111-111111111111") && init?.method === "DELETE",
        ),
      ).toBe(true);
    });
  });

  it("keeps learning review unavailable in public preview mode", () => {
    render(<LearningReviewPanel previewMode />);
    expect(
      screen.getByText(/Learning Review is an authenticated Admin control/i),
    ).toBeInTheDocument();
    expect(mocks.readAdminJson).not.toHaveBeenCalled();
  });
});
