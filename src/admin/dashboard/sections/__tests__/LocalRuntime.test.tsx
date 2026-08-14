import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalRuntime } from "../LocalRuntime";

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
});

const MODAL_TITLE = "LOCAL RUNTIME DETAILS";

describe("LocalRuntime Dashboard Card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Renders the card with correct title", () => {
    render(<LocalRuntime />);
    expect(screen.getByText("LOCAL RUNTIME")).toBeInTheDocument();
  });

  it("2. Displays initial correct status for core components", () => {
    render(<LocalRuntime />);
    expect(screen.getByText("Execution Core")).toBeInTheDocument();
    expect(screen.getByText("Security Gate")).toBeInTheDocument();
    expect(screen.getAllByText("READY")[0]).toBeInTheDocument();
    expect(screen.getAllByText("ACTIVE")[0]).toBeInTheDocument();
  });

  it("3. Displays NOT IMPLEMENTED initially for Linux and Android", () => {
    render(<LocalRuntime />);
    const notImplementedBadges = screen.getAllByText("NOT IMPLEMENTED");
    expect(notImplementedBadges.length).toBeGreaterThanOrEqual(2);
  });

  it("4. Opens detail view modal on button click", () => {
    render(<LocalRuntime />);
    const viewButton = screen.getByText(/VIEW DETAILS/i);
    fireEvent.click(viewButton);
    expect(screen.getByText(MODAL_TITLE)).toBeInTheDocument();
  });

  it("5. Detail view contains required security and architecture info", () => {
    render(<LocalRuntime />);
    fireEvent.click(screen.getByText(/VIEW DETAILS/i));

    expect(screen.getByText("Policy Engine")).toBeInTheDocument();
    expect(screen.getByText("Runtime Registry")).toBeInTheDocument();
    expect(screen.getByText("Lifecycle Manager")).toBeInTheDocument();
    expect(screen.getByText("Authorization Gate")).toBeInTheDocument();

    expect(screen.getByText("PRIVILEGED")).toBeInTheDocument();
    expect(screen.getByText("SENSITIVE")).toBeInTheDocument();

    expect(screen.getByText("Root Access")).toBeInTheDocument();
    expect(screen.getByText("DISABLED")).toBeInTheDocument();
  });

  it("6. Detail view closes on close button click", () => {
    render(<LocalRuntime />);
    fireEvent.click(screen.getByText(/VIEW DETAILS/i));
    expect(screen.getByText(MODAL_TITLE)).toBeInTheDocument();

    // Close modal (assuming the X button is the only button with an SVG inside a specific div,
    // but we can query by generic role or wait for modal to disappear)
    const modalHeading = screen.getByText(MODAL_TITLE);
    const closeBtn = modalHeading.parentElement?.querySelector("button");
    if (closeBtn) fireEvent.click(closeBtn);

    expect(screen.queryByText(MODAL_TITLE)).not.toBeInTheDocument();
  });

  it("7. Copy Details button works and contains correct info without secrets", async () => {
    window.alert = vi.fn(); // mock alert
    render(<LocalRuntime />);
    fireEvent.click(screen.getByText(/VIEW DETAILS/i));

    const copyButton = screen.getByText(/COPY DETAILS/i);
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    const copiedText = vi.mocked(navigator.clipboard.writeText).mock
      .calls[0][0];
    expect(copiedText).toContain("ORBIS LOCAL RUNTIME STATUS");
    expect(copiedText).toContain("Linux Runtime: NOT IMPLEMENTED");
    expect(copiedText).toContain("PRIVILEGED = DENIED");
    expect(copiedText).not.toContain("password");
    expect(copiedText).not.toContain("secret");
  });

  it("8. Does not use child_process or execute commands (structural check)", () => {
    const componentCode = LocalRuntime.toString();
    expect(componentCode).not.toContain("child_process");
    expect(componentCode).not.toContain("exec(");
    expect(componentCode).not.toContain("spawn(");
  });
});
