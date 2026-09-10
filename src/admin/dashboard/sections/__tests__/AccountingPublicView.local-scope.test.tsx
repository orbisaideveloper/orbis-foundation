import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  LotteryAccountingClient,
  LotteryAccountingReadClient,
} from "../../../models/lotteryAccountingClient";
import type { ManagedProductModelVersion } from "../../../models/types";

const capturedWorkspace = vi.hoisted(() => ({
  api: null as LotteryAccountingClient | null,
}));

vi.mock("../LotteryAccountingWorkspace", () => ({
  LotteryAccountingWorkspace: ({
    api,
    localScope,
  }: {
    api: LotteryAccountingClient;
    localScope?: { ownerKind?: string; ownerId?: string };
  }) => {
    capturedWorkspace.api = api;
    return (
      <div data-testid="captured-local-scope">
        {localScope?.ownerKind}:{localScope?.ownerId}
      </div>
    );
  },
}));

import { AccountingPublicView } from "../AccountingPublicView";

const version = { sequence: 2 } as ManagedProductModelVersion;

describe("AccountingPublicView local data scope", () => {
  it.each(["PREVIEW", "LIVE"] as const)(
    "keeps %s inspection reads and local writes inside the isolated Admin demo boundary",
    async (mode) => {
      const demoApi: LotteryAccountingReadClient = {
        listOrganizations: vi.fn().mockResolvedValue([]),
        loadWorkspace: vi.fn(),
      };

      render(
        <AccountingPublicView
          mode={mode}
          version={version}
          demoApi={demoApi}
          onBack={vi.fn()}
        />,
      );

      expect(screen.getByTestId("captured-local-scope")).toHaveTextContent(
        "ADMIN_DEMO:accounting-demo",
      );

      expect(capturedWorkspace.api).not.toBeNull();
      await capturedWorkspace.api!.listOrganizations();
      expect(demoApi.listOrganizations).toHaveBeenCalledTimes(1);
      await expect(
        capturedWorkspace.api!.previewSale({ organizationId: "real-org" }),
      ).rejects.toThrow();
      expect(
        screen.getByRole("button", { name: "Back to ORBIS Accounting" }),
      ).toBeInTheDocument();
    },
  );
});
