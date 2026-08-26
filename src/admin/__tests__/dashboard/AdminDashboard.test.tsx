import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboard from "../../dashboard/AdminDashboard";

const mocks = vi.hoisted(() => ({ readAdminJson: vi.fn() }));
const TERMUX_SYSTEM_INFO = "termux.system.info";
const MARKET_INTELLIGENCE_TITLE = "Market Intelligence";
const RUNTIME_TITLE = "Runtime";
const BRAIN_TITLE = "Brain";
const DIAGNOSTICS_TITLE = "Diagnostics";
const DATA_PRIVACY_TITLE = "Data & Privacy";

vi.mock("../../auth/adminFetch", () => ({ readAdminJson: mocks.readAdminJson }));

vi.mock(
  "../../../features/orbis-ai-chatbot/components/FullscreenChatView",
  () => ({
    FullscreenChatView: ({ onClose }: { onClose: () => void }) => (
      <div role="dialog" aria-label="ORBIS Assistant compatibility view">
        ORBIS Assistant
        <button type="button" onClick={onClose}>
          Back
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
      id: TERMUX_SYSTEM_INFO,
      kind: "foundation-capability",
      configured: true,
      status: "AVAILABLE",
      callable: true,
      executionRoute: "internal",
    },
    {
      id: "foundation.pdf.read",
      kind: "foundation-data-capability",
      configured: true,
      status: "AVAILABLE",
      callable: true,
      executionRoute: "admin-capability-api",
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
    recentEvents: [
      {
        timestamp: "2026-08-25T17:00:00.000Z",
        level: "INFO",
        source: "TELEMETRY",
        category: "TELEMETRY",
        severity: "INFO",
        count: 4,
        message: "Foundation worker ready",
      },
    ],
  },
  migrations: [{ name: "20260825000000_test", localStatus: "present" }],
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

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as Response;
}

async function expectDashboardHome(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByText(/Your ORBIS\. Visible\./i)).toBeInTheDocument();
  });
}

async function goBackToDashboard(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: /Back to dashboard/i }));
  await expectDashboardHome();
}

describe("AdminDashboard current control-center coverage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "");

    vi.spyOn(window.history, "back").mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    mocks.readAdminJson.mockReset();
    mocks.readAdminJson.mockImplementation(async (path: string) => {
      if (path === "/api/admin/diagnostic-export") return diagnosticExport;
      if (path === "/api/diagnostics") {
        return {
          gitStatus: "dashboard implementation (b3b632b)",
          logs: diagnosticExport.telemetry.recentEvents,
        };
      }
      throw new Error(`unexpected admin path: ${path}`);
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

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "");
  });

  it("renders the approved home surface without retired dashboard labels", async () => {
    render(<AdminDashboard />);

    expect(
      screen.getByRole("heading", { name: "ORBIS FOUNDATION" }),
    ).toBeInTheDocument();
    await expectDashboardHome();

    for (const name of [
      "ORBIS Chat",
      MARKET_INTELLIGENCE_TITLE,
      "Modules",
      RUNTIME_TITLE,
      BRAIN_TITLE,
      DIAGNOSTICS_TITLE,
      DATA_PRIVACY_TITLE,
      "Releases",
    ]) {
      expect(
        screen.getAllByRole("button", { name: new RegExp(name, "i") }).length,
      ).toBeGreaterThan(0);
    }

    expect(screen.queryByText(/ORBIS Neural Cockpit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ডায়াগনস্টিক টার্মিনাল/i)).not.toBeInTheDocument();
  });

  it("opens and closes the new More sheet with accessible controls", async () => {
    render(<AdminDashboard />);
    await expectDashboardHome();

    fireEvent.click(
      screen.getByRole("button", { name: /Open dashboard menu/i }),
    );
    expect(screen.getByRole("heading", { name: "More" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Close menu/i }));
    expect(screen.queryByRole("heading", { name: "More" })).not.toBeInTheDocument();
  });

  it("opens current module detail surfaces and returns through browser history", async () => {
    render(<AdminDashboard />);
    await expectDashboardHome();

    const openHomeCard = (name: string) => {
      const heading = screen.getByRole("heading", { name, level: 3 });
      const button = heading.closest("button");
      expect(button).not.toBeNull();
      fireEvent.click(button!);
    };

    openHomeCard(MARKET_INTELLIGENCE_TITLE);
    expect(
      screen.getByRole("heading", { name: MARKET_INTELLIGENCE_TITLE }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Market Intelligence is not connected yet/i),
    ).toBeInTheDocument();

    await goBackToDashboard();

    openHomeCard(RUNTIME_TITLE);
    expect(
      screen.getByRole("heading", { name: RUNTIME_TITLE }),
    ).toBeInTheDocument();

    await goBackToDashboard();

    openHomeCard(BRAIN_TITLE);
    expect(
      screen.getByRole("heading", { name: BRAIN_TITLE }),
    ).toBeInTheDocument();

    await goBackToDashboard();

    openHomeCard(DIAGNOSTICS_TITLE);
    expect(
      screen.getByRole("heading", { name: DIAGNOSTICS_TITLE }),
    ).toBeInTheDocument();

    await goBackToDashboard();

    openHomeCard(DATA_PRIVACY_TITLE);
    expect(
      screen.getByRole("heading", { name: DATA_PRIVACY_TITLE }),
    ).toBeInTheDocument();
  });

  it("opens and closes ORBIS Assistant through the real dashboard history contract", async () => {
    render(<AdminDashboard />);
    await expectDashboardHome();

    fireEvent.click(screen.getByRole("button", { name: /^Chat$/i }));
    expect(
      screen.getByRole("dialog", {
        name: /ORBIS Assistant compatibility view/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: /ORBIS Assistant compatibility view/i,
        }),
      ).not.toBeInTheDocument();
    });

    await expectDashboardHome();
  });

  it("closes an open detail surface on browser popstate", async () => {
    render(<AdminDashboard />);
    await expectDashboardHome();

    fireEvent.click(screen.getByRole("button", { name: /^Modules$/i }));
    expect(await screen.findByText(TERMUX_SYSTEM_INFO)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(screen.queryByText(TERMUX_SYSTEM_INFO)).not.toBeInTheDocument();
    });
    await expectDashboardHome();
  });
});
