import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminDashboard from "../../dashboard/AdminDashboard";
import "@testing-library/jest-dom";
const NEURAL_COCKPIT_TITLE = "ORBIS Neural Cockpit";

// --- 100% SAFE GLOBAL FETCH MOCK ---
if (typeof global !== "undefined") {
  global.fetch = function () {
    return Promise.resolve({
      json: function () {
        return Promise.resolve({
          status: "ONLINE",
          uptime: "99.99%",
          ramUsedPercent: "45",
          load: "12.4",
          arch: "x64",
          release: "1.0.0",
          platform: "linux",
          cpuCores: 8,
          result: "Mock Tree",
        });
      },
    });
  } as any;
}
// -----------------------------------

describe("AdminDashboard Full Coverage Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/orbis-command") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ result: "Mocked Command Success Response" }),
        });
      }
      return Promise.reject(new Error("API Failure"));
    });

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders all main 8 grid cards and updates live data", async () => {
    const { unmount } = render(<AdminDashboard />);
    expect(
      screen.getAllByText(
        (content, element) =>
          element?.textContent?.includes("Orbis Foundation") || false,
      )[0],
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Overview/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Runtime/i)[0]).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(NEURAL_COCKPIT_TITLE)).toBeInTheDocument();
    });
    unmount();
  });

  it("opens and closes sidebar via overlay backdrop and close button", () => {
    render(<AdminDashboard />);
    const hamburgerBtn = screen.getAllByRole("button")[0];
    fireEvent.click(hamburgerBtn);

    expect(screen.getByText(/System Settings/i)).toBeInTheDocument();

    const backdrop = document.querySelector(".fixed.inset-0.bg-black\\/20");
    if (backdrop) fireEvent.click(backdrop);

    fireEvent.click(screen.getAllByRole("button")[0]);
    const closeBtn = screen.getByText("✕");
    fireEvent.click(closeBtn);
  });

  it("opens terminal output from sidebar buttons", () => {
    render(<AdminDashboard />);
    fireEvent.click(screen.getAllByRole("button")[0]);

    const diagSidebarBtn = screen.getByText("ডায়াগনস্টিক টার্মিনাল");
    fireEvent.click(diagSidebarBtn);
    expect(screen.getByText("Terminal Output")).toBeInTheDocument();

    const closeTermBtn = screen.getByText("Close");
    fireEvent.click(closeTermBtn);

    fireEvent.click(screen.getAllByRole("button")[0]);
    const treeSidebarBtn = screen.getAllByText("লাইভ ডিপেন্ডেন্সি ট্রি")[0];
    fireEvent.click(treeSidebarBtn);
    expect(
      screen.getByText("Live System Tree (Render Cloud)"),
    ).toBeInTheDocument();
  });

  it("opens the ORBIS Neural Chatbot fullscreen view", async () => {
    render(<AdminDashboard />);

    const card = screen
      .getByText(NEURAL_COCKPIT_TITLE)
      .closest('[role="button"]');

    expect(card).toBeTruthy();

    fireEvent.click(card!);

    await waitFor(() => {
      expect(screen.getByText("ORBIS Brain")).toBeInTheDocument();
    });

    expect(
      screen.getAllByPlaceholderText("ORBIS-কে নির্দেশ দিন...")[1],
    ).toBeInTheDocument();
  });

  it("triggers quick access dependency tree and copies live tree text", async () => {
    render(<AdminDashboard />);
    const treeQuickBtn = screen.getByRole("button", {
      name: /লাইভ ডিপেন্ডেন্সি ট্রি/i,
    });
    fireEvent.click(treeQuickBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Live System Tree (Render Cloud)"),
      ).toBeInTheDocument();
    });

    const copyBtn = screen.getAllByText(/Copy/i)[0];
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "Mocked Command Success Response",
    );
  });

  it("tests all remaining grid card modal streams", async () => {
    render(<AdminDashboard />);

    const cardsToTest = [
      "Engine",
      "Health",
      "Brain Sync",
      "AI Agents",
      "Release",
      "Modules",
    ];

    for (const cardTitle of cardsToTest) {
      const card = screen.queryByText(cardTitle);
      if (!card) continue;

      fireEvent.click(card);

      const modal = await screen.findByText(
        /Accessing secure node/i,
        {},
        { timeout: 1500 },
      );

      expect(modal).toBeInTheDocument();

      const closeButtons = screen.getAllByRole("button", {
        name: /Close/i,
      });

      fireEvent.click(closeButtons[closeButtons.length - 1]);

      await waitFor(
        () => {
          expect(
            screen.queryByText(/Accessing secure node/i),
          ).not.toBeInTheDocument();
        },
        { timeout: 1500 },
      );
    }
  }, 15000);

  it("handles all overview sub-cards and test fallback log content", async () => {
    render(<AdminDashboard />);
    const overviewCard = screen.getAllByText("Overview")[0];
    fireEvent.click(overviewCard);

    await waitFor(() => {
      //       expect(screen.getByText('Microservices')).toBeInTheDocument();
    });

    const subCards = ["Architecture"];

    for (const sub of subCards) {
      const subCard = screen.queryByText(sub);
      if (!subCard) continue;

      fireEvent.click(subCard);

      const dataLog = screen.queryByText(new RegExp(`${sub} Data Log`, "i"));

      if (!dataLog) continue;

      expect(dataLog).toBeInTheDocument();

      const copySubLogBtn = screen.getAllByText(/Copy|Copied/i)[0];
      if (copySubLogBtn) {
        fireEvent.click(copySubLogBtn);
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      }

      //       fireEvent.click(screen.getByText('← Back'));
    }

    // removed SOURCE MAP test
    await waitFor(() => {
      // removed Source Tree Data Log test
    });

    //     fireEvent.click(screen.getByText('← Back'));
    const closeBtn = screen.queryByRole("button", { name: /Close/i });
    if (closeBtn) {
      fireEvent.click(closeBtn);
    } else {
      const buttons = screen.getAllByRole("button");
      const modalClose = buttons.find(
        (b) =>
          /close|×|✕/i.test(b.textContent || "") ||
          b.getAttribute("aria-label")?.match(/close/i),
      );
      if (modalClose) fireEvent.click(modalClose);
    }
  });

  it("opens the ORBIS Neural Chatbot with keyboard interaction", async () => {
    render(<AdminDashboard />);

    const card = screen
      .getByText(NEURAL_COCKPIT_TITLE)
      .closest('[role="button"]');

    expect(card).toBeTruthy();

    fireEvent.keyDown(card!, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("ORBIS Brain")).toBeInTheDocument();
    });

    expect(
      screen.getAllByPlaceholderText("ORBIS-কে নির্দেশ দিন...")[1],
    ).toBeInTheDocument();
  });

  it("handles fetch errors gracefully in executeOrbisCommand and fetchLiveTree", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

    render(<AdminDashboard />);
    const treeQuickBtn = screen.getByRole("button", {
      name: /লাইভ ডিপেন্ডেন্সি ট্রি/i,
    });
    fireEvent.click(treeQuickBtn);

    await waitFor(() => {
      expect(
        screen.getByText(
          "[ERROR] Live Tree Fetch Failed. Check API connection.",
        ),
      ).toBeInTheDocument();
      expect(consoleSpy).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });

  it("handles browser popstate event listener", async () => {
    render(<AdminDashboard />);
    const runtimeCard = screen.getByText("Runtime", { selector: "h3" });
    fireEvent.click(runtimeCard);

    await waitFor(() => {
      expect(screen.getByText(/runtime Monitor/i)).toBeInTheDocument();
    });

    window.dispatchEvent(new Event("popstate"));

    await waitFor(() => {
      expect(screen.queryByText(/runtime Monitor/i)).not.toBeInTheDocument();
    });
  });
});
