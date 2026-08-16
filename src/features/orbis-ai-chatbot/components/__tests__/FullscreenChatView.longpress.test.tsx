import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { FullscreenChatView } from "../FullscreenChatView";

vi.mock("../../storage/ChatStorageManager", () => ({
  chatStorage: {
    init: vi.fn().mockResolvedValue(undefined),
    createConversation: vi.fn().mockResolvedValue(undefined),
    getMessagesByConversation: vi.fn().mockResolvedValue([]),
    saveMessage: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("FullscreenChatView long-press message actions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error test cleanup
    delete navigator.clipboard;
  });

  it("shows no permanent Copy button, then opens the menu and copies the full message on long-press", async () => {
    render(<FullscreenChatView onClose={() => {}} />);

    const bubble = await screen.findByText(/নমস্কার দাদা/i);

    // No permanently visible copy control anywhere in the chat.
    expect(
      screen.queryByRole("menuitem", { name: /copy/i }),
    ).not.toBeInTheDocument();

    fireEvent.pointerDown(bubble, { clientX: 0, clientY: 0, button: 0 });
    vi.advanceTimersByTime(500);

    const copyItem = await screen.findByRole("menuitem", { name: /copy/i });
    fireEvent.click(copyItem);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("নমস্কার দাদা"),
      );
    });

    // Menu closes after the action.
    expect(
      screen.queryByRole("menuitem", { name: /copy/i }),
    ).not.toBeInTheDocument();
  });

  it("cancels the long press on a short tap, leaving the menu closed", async () => {
    render(<FullscreenChatView onClose={() => {}} />);

    const bubble = await screen.findByText(/নমস্কার দাদা/i);

    fireEvent.pointerDown(bubble, { clientX: 0, clientY: 0, button: 0 });
    vi.advanceTimersByTime(100);
    fireEvent.pointerUp(bubble);
    vi.advanceTimersByTime(1000);

    expect(
      screen.queryByRole("menuitem", { name: /copy/i }),
    ).not.toBeInTheDocument();
  });
});
