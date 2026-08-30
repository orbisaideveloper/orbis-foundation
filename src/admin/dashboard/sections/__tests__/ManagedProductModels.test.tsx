import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManagedProductModels } from "../ManagedProductModels";
import type { ManagedProductModel } from "../../../models/types";

const ACCOUNTING_AI_NAME = "ORBiS Accounting AI";
const TEST_TIMESTAMP = "2026-08-30T00:00:00.000Z";

function accountingModel(sequence = 1, published = false): ManagedProductModel {
  const definition = {
    product: {
      name: ACCOUNTING_AI_NAME,
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
        lifecycle: "READY_FOR_BUILD",
        workflow: [],
        aiAnalysis: "MODULE_SCOPED_VERIFIED_ACCOUNTING_DATA_ONLY",
      },
    ],
  } as const;
  const version = {
    id: `version-${sequence}`,
    sequence,
    lifecycle: "DRAFT" as const,
    definition,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    publishedAt: null,
  };
  return {
    id: "model-1",
    slug: "orbis-accounting-ai",
    displayName: ACCOUNTING_AI_NAME,
    category: "ACCOUNTING_AI",
    status: "ACTIVE",
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    currentVersion: version,
    publishedVersion: published
      ? {
          ...version,
          id: "version-1",
          sequence: 1,
          lifecycle: "PUBLISHED" as const,
        }
      : null,
  };
}

describe("ManagedProductModels", () => {
  it("shows the Accounting AI draft and promotes it only after Admin confirmation", async () => {
    const loadModels = vi.fn().mockResolvedValue([accountingModel()]);
    const publishModel = vi.fn().mockResolvedValue(accountingModel(2, true));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <ManagedProductModels
        loadModels={loadModels}
        publishModel={publishModel}
      />,
    );

    expect(await screen.findByText(ACCOUNTING_AI_NAME)).toBeInTheDocument();
    expect(screen.getByText("Lottery Accounting")).toBeInTheDocument();
    expect(screen.getByText("Web search: disabled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Publish v1" }));

    await waitFor(() => {
      expect(publishModel).toHaveBeenCalledWith("orbis-accounting-ai");
    });
    expect(
      await screen.findByRole("button", { name: "Publish v2" }),
    ).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("does not load private model information in public preview", () => {
    const loadModels = vi.fn();
    render(<ManagedProductModels previewMode loadModels={loadModels} />);

    expect(
      screen.getByText(/Managed product models are Admin-only/i),
    ).toBeInTheDocument();
    expect(loadModels).not.toHaveBeenCalled();
  });
});
