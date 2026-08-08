import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FullscreenChatView } from "../FullscreenChatView";

describe("FullscreenChatView", () => {
  it("renders the FullscreenChatView correctly", () => {
    render(<FullscreenChatView onClose={vi.fn()} />);

    expect(
      screen.getByPlaceholderText(/ORBIS-কে নির্দেশ দিন/i),
    ).toBeInTheDocument();

    expect(screen.getByText("ORBIS Brain")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("calls onClose when back button is clicked", () => {
    const mockOnClose = vi.fn();

    render(<FullscreenChatView onClose={mockOnClose} />);

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("updates textarea value when user types", () => {
    render(<FullscreenChatView onClose={vi.fn()} />);

    const textarea = screen.getByPlaceholderText(
      /ORBIS-কে নির্দেশ দিন/i,
    ) as HTMLTextAreaElement;

    fireEvent.change(textarea, {
      target: { value: "সিস্টেম স্ট্যাটাস চেক করো" },
    });

    expect(textarea.value).toBe("সিস্টেম স্ট্যাটাস চেক করো");
  });

  it("renders microphone and send buttons", () => {
    render(<FullscreenChatView onClose={vi.fn()} />);

    const buttons = screen.getAllByRole("button");

    expect(buttons).toHaveLength(3);
  });
});
