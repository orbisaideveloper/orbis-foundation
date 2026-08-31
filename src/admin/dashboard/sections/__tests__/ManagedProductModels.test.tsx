import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManagedProductModels } from "../ManagedProductModels";
import type { ManagedProductModel } from "../../../models/types";

const TEST_TIMESTAMP = "2026-08-30T00:00:00.000Z";
const ACCOUNTING_MODEL_SLUG = "orbis-accounting-ai";

function accountingModel(
  sequence = 1,
  reviewStatus: "NOT_RUN" | "PASSED" = "NOT_RUN",
  published = false,
): ManagedProductModel {
  const definition = {
    schemaVersion: 2,
    product: {
      name: "ORBiS Accounting AI",
      distribution: { current: "PWA_PILOT", future: "PLAY_STORE" },
    },
    releasePolicy: {
      publicResolver: "PUBLISHED_VERSION_ONLY",
      nextCurrentVersion: "COPY_OF_PUBLISHED_SNAPSHOT",
    },
    aiBoundary: {
      purpose: "ACCOUNTING_ANALYSIS_ONLY",
      dataScope: "ACTIVE_MODULE_VERIFIED_SUMMARY",
      writeAccess: "DISABLED",
      webSearch: "DISABLED",
    },
    modules: [
      {
        slug: "lottery",
        name: "Lottery Accounting",
        lifecycle: "READY_FOR_REVIEW",
        workspace: [
          "overview",
          "data-contract",
          "workflow",
          "ai-skills",
          "test-review",
          "versions",
        ],
        workflow: [
          "stock-receipt",
          "return",
          "sales",
          "commission",
          "tax-deduction",
          "payment",
          "settlement",
        ],
        dataContract: {
          moneyUnit: "PAISE",
          rateUnit: "BASIS_POINTS",
          entities: [
            "organization",
            "party",
            "accounting-period",
            "stock-movement",
            "sale",
            "payment",
            "settlement",
            "ledger-entry",
            "audit-event",
          ],
          rules: ["LEDGER_DEBITS_EQUAL_CREDITS"],
        },
        aiSkills: [
          {
            slug: "profit-loss",
            name: "Profit & loss explanation",
            source: "VERIFIED_PERIOD_SUMMARY",
          },
          {
            slug: "outstanding-dues",
            name: "Outstanding due analysis",
            source: "VERIFIED_PARTY_AND_PERIOD_SUMMARY",
          },
          {
            slug: "anomaly-review",
            name: "Accounting anomaly review",
            source: "DETERMINISTIC_VALIDATION_FLAGS",
          },
          {
            slug: "tax-commission",
            name: "Tax and commission explanation",
            source: "VERIFIED_SALE_CALCULATION",
          },
        ],
        aiAnalysis: "MODULE_SCOPED_VERIFIED_ACCOUNTING_DATA_ONLY",
      },
    ],
  };
  const version = {
    id: `version-${sequence}`,
    sequence,
    lifecycle: "DRAFT" as const,
    definition,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    publishedAt: null,
    reviewStatus,
    reviewReport:
      reviewStatus === "PASSED"
        ? {
            status: "PASSED" as const,
            contractChecks: [{ name: "schema version", passed: true }],
            coreChecks: [{ name: "balanced ledger", passed: true }],
            canonicalSummary: { verified: true },
          }
        : null,
    reviewedAt: reviewStatus === "PASSED" ? TEST_TIMESTAMP : null,
    reviewedByAdminId: reviewStatus === "PASSED" ? "admin-1" : null,
  };
  return {
    id: "model-1",
    slug: ACCOUNTING_MODEL_SLUG,
    displayName: "ORBiS Accounting AI",
    category: "ACCOUNTING_AI",
    status: "ACTIVE",
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    currentVersion: version,
    publishedVersion: published
      ? {
          ...version,
          id: "published-1",
          sequence: 1,
          lifecycle: "PUBLISHED" as const,
        }
      : null,
    versionHistory: [version],
  };
}

describe("ManagedProductModels", () => {
  it("opens the compact model card, Lottery workspace and every step-by-step section", async () => {
    render(
      <ManagedProductModels
        loadModels={vi.fn().mockResolvedValue([accountingModel()])}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /ORBiS Accounting AI/i }),
    );
    expect(
      screen.getByRole("region", { name: "ORBiS Accounting AI model home" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Lottery Accounting/i }),
    );
    expect(screen.getByText("Accounting Core")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Data" }));
    expect(screen.getByText("Real data contract")).toBeInTheDocument();
    expect(screen.getByText("ledger entry")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Workflow" }));
    expect(screen.getByText("stock receipt")).toBeInTheDocument();
    expect(screen.getByText("settlement")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI Skills" }));
    expect(screen.getByText("Profit & loss explanation")).toBeInTheDocument();
    expect(screen.getByText(/no INSERT, UPDATE, DELETE/i)).toBeInTheDocument();
  });

  it("requires a passed review before publishing and opens the next draft", async () => {
    const reviewModel = vi.fn().mockResolvedValue(accountingModel(1, "PASSED"));
    const publishModel = vi
      .fn()
      .mockResolvedValue(accountingModel(2, "NOT_RUN", true));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <ManagedProductModels
        initialScreen="model"
        loadModels={vi.fn().mockResolvedValue([accountingModel()])}
        reviewModel={reviewModel}
        publishModel={publishModel}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Lottery Accounting/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect(screen.getByRole("button", { name: "Publish v1" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Test & Review" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Run full module review" }),
    );
    await waitFor(() =>
      expect(reviewModel).toHaveBeenCalledWith(ACCOUNTING_MODEL_SLUG),
    );
    expect(await screen.findByText("schema version")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish v1" }));
    await waitFor(() =>
      expect(publishModel).toHaveBeenCalledWith(ACCOUNTING_MODEL_SLUG),
    );
    expect((await screen.findAllByText("v2")).length).toBeGreaterThan(0);
    expect(
      screen.getByText("Run and pass Test & Review before publishing."),
    ).toBeInTheDocument();
  });

  it("shows load and action failures without exposing private model data in preview", async () => {
    const { rerender } = render(
      <ManagedProductModels
        loadModels={vi.fn().mockRejectedValue(new Error("offline"))}
      />,
    );
    expect(
      await screen.findByText("Managed product models are unavailable."),
    ).toBeInTheDocument();

    const loadModels = vi.fn();
    rerender(<ManagedProductModels previewMode loadModels={loadModels} />);
    expect(screen.getByText(/Admin-only/i)).toBeInTheDocument();
    expect(loadModels).not.toHaveBeenCalled();
  });
});
