import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboard from "../AdminDashboard";

const mocks = vi.hoisted(() => ({
  readAdminJson: vi.fn(),
}));

vi.mock("../../auth/adminFetch", () => ({
  readAdminJson: mocks.readAdminJson,
}));

vi.mock(
  "../../../features/orbis-ai-chatbot/components/FullscreenChatView",
  () => ({
    FullscreenChatView: ({ onClose }: { onClose: () => void }) => (
      <div role="dialog" aria-label="ORBIS Assistant test view">
        Chat mock
        <button type="button" onClick={onClose}>
          Close chat
        </button>
      </div>
    ),
  }),
);

const diagnosticExport = {
  schema: "orbis.foundation.admin-diagnostic.v1",
  generatedAt: "2026-08-25T17:00:00.000Z",
  redacted: true,
  version: { commit: "b3b632b", application: "1.0.0" },
  providers: [{ name: "Ollama", type: "local", state: "UNKNOWN" }],
  capabilities: [
    {
      id: "termux.system.info",
      kind: "foundation-capability",
      configured: true,
      status: "AVAILABLE",
      callable: true,
      executionRoute: "internal",
    },
  ],
  brain: {
    route: "/api/brain/request",
    registered: true,
    gatewayArtifact: "available",
  },
  database: {
    state: "connected",
    foundationTableCounts: [
      { table: "FoundationSystemLog", count: 4, status: "available" },
    ],
  },
  telemetry: {
    status: "available",
    summary: {
      occurrences: 4,
      records: 1,
      bySeverity: { INFO: 4 },
      byCategory: { TELEMETRY: 4 },
    },
    recentEvents: [],
  },
  migrations: [],
  runtime: {
    node: "v26.4.0",
    platform: "LINUX",
    architecture: "arm64",
    processUptimeSeconds: 100,
    cpuCores: 8,
    cpuModel: "test cpu",
    memoryTotalGb: 8,
    memoryUsedGb: 2,
  },
  exclusions: ["credentials-and-environment-values"],
};

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response;
}

describe("AdminDashboard", () => {
  beforeEach(() => {
    mocks.readAdminJson.mockReset();
    mocks.readAdminJson.mockImplementation(async (path: string) => {
      if (path === "/api/admin/diagnostic-export") return diagnosticExport;
      if (path === "/api/diagnostics") {
        return { gitStatus: "dashboard implementation (b3b632b)", logs: [] };
      }
      throw new Error("unexpected admin path");
    });

    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path.includes("/api/system-stats")) {
        return jsonResponse({
          cpuCores: 8,
          cpuModel: "test cpu",
          arch: "arm64",
          platform: "LINUX",
          release: "test-release",
          load: "0.25",
          load5m: "0.20",
          load15m: "0.15",
          totalMem: "8.00",
          freeMem: "6.00",
          usedMem: "2.00",
          ramUsedPercent: "25.0",
          uptime: "12h 10m",
          processUptime: "100",
          heapUsed: "42.00",
          status: "ONLINE",
        });
      }
      if (path.includes("/api/ai/providers/status")) {
        return jsonResponse({
          activeProvider: {
            name: "Ollama",
            type: "local",
            model: "tinyllama:latest",
            health: { state: "UNKNOWN", checkedAt: null },
          },
          allProviders: [],
        });
      }
      if (path.includes("/api/termux-observatory")) {
        return jsonResponse({ auditedTasks: 20, next: "Awaiting TASK-021" });
      }
      throw new Error(`unexpected public path: ${path}`);
    });
  });

  it("renders real-source summary data and does not invent market values", async () => {
    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/System ONLINE/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Commit b3b632b/i)).toBeInTheDocument();
    expect(screen.getByText(/Not connected/i)).toBeInTheDocument();
    expect(screen.queryByText(/96\.7%/i)).not.toBeInTheDocument();
  });

  it("opens Market and Modules details from the dashboard cards", async () => {
    render(<AdminDashboard />);
    await screen.findByText(/Your ORBIS\. Visible\./i);

    fireEvent.click(
      screen.getByRole("button", { name: /Market Intelligence/i }),
    );
    expect(
      screen.getByText(/Market Intelligence is not connected yet/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Modules$/i }));
    expect(await screen.findByText("termux.system.info")).toBeInTheDocument();
  });

  it("opens the existing ORBIS chat surface from the bottom navigation", async () => {
    render(<AdminDashboard />);
    await screen.findByText(/Your ORBIS\. Visible\./i);

    fireEvent.click(screen.getByRole("button", { name: /^Chat$/i }));
    expect(
      screen.getByRole("dialog", { name: /ORBIS Assistant test view/i }),
    ).toBeInTheDocument();
  });
  it("keeps the permanent public preview read-only", async () => {
    render(<AdminDashboard previewMode />);

    expect(
      screen.getByText(/Public read-only preview/i),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/System ONLINE/i)).toBeInTheDocument();
    });

    expect(mocks.readAdminJson).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^Chat$/i }));

    expect(
      screen.getByRole("dialog", {
        name: /ORBIS Assistant read-only preview/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Chat interaction is disabled here/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

});
