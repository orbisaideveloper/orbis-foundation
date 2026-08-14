import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalRuntime } from "../LocalRuntime";

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
    expect(
      screen.getByRole("heading", { name: "LOCAL RUNTIME" }),
    ).toBeInTheDocument();
  });

  it("2. Displays initial correct status for core components", () => {
    render(<LocalRuntime />);
    expect(screen.getByText("Execution Core")).toBeInTheDocument();
    expect(screen.getByText("Security Gate")).toBeInTheDocument();
    expect(screen.getByText("READY")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("3. Displays NOT IMPLEMENTED initially for Linux and Android", () => {
    render(<LocalRuntime />);
    expect(
      screen.getAllByText("NOT IMPLEMENTED").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("4. Opens detail view modal on button click", () => {
    render(<LocalRuntime />);
    fireEvent.click(screen.getByRole("button", { name: /VIEW DETAILS/i }));
    expect(
      screen.getByRole("heading", { name: MODAL_TITLE }),
    ).toBeInTheDocument();
  });

  it("5. Detail view contains required security and architecture info", () => {
    render(<LocalRuntime />);
    fireEvent.click(screen.getByRole("button", { name: /VIEW DETAILS/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /VIEW DETAILS/i }));
    expect(
      screen.getByRole("heading", { name: MODAL_TITLE }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /close local runtime details/i,
      }),
    );

    expect(
      screen.queryByRole("heading", { name: MODAL_TITLE }),
    ).not.toBeInTheDocument();
  });

  it("7. Copy Details button works and contains correct info without secrets", async () => {
    window.alert = vi.fn();

    render(<LocalRuntime />);
    fireEvent.click(screen.getByRole("button", { name: /VIEW DETAILS/i }));
    fireEvent.click(screen.getByRole("button", { name: /COPY DETAILS/i }));

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

  it("8. Does not use child_process or execute commands", () => {
    const componentCode = LocalRuntime.toString();

    expect(componentCode).not.toContain("child_process");
    expect(componentCode).not.toContain("exec(");
    expect(componentCode).not.toContain("spawn(");
  });
});
