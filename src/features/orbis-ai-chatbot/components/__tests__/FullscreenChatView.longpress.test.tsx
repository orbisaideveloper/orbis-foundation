import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { FullscreenChatView } from "../FullscreenChatView";

vi.mock("../../storage/ChatStorageManager", () => ({
  chatStorage: {
    getConsent: vi.fn(() => "declined"),
    setConsent: vi.fn(),
    getLearningConsent: vi.fn(() => "declined"),
    setLearningConsent: vi.fn(),
    getOrCreateAnonymousProfileId: vi.fn(() => "anonymous-test"),
    init: vi.fn().mockResolvedValue(undefined),
    createConversation: vi.fn().mockResolvedValue(undefined),
    getMessagesByConversation: vi.fn().mockResolvedValue([]),
    saveMessage: vi.fn().mockResolvedValue(undefined),
    getPendingClarification: vi.fn().mockResolvedValue(null),
    setPendingClarification: vi.fn().mockResolvedValue(undefined),
    getCachedResponse: vi.fn().mockResolvedValue(null),
    saveCachedResponse: vi.fn().mockResolvedValue(undefined),
    getUsage: vi.fn().mockResolvedValue({
      budgetBytes: 500 * 1024 * 1024,
      logicalBytes: 0,
      deviceUsageBytes: null,
      deviceQuotaBytes: null,
      warning: false,
    }),
  },
}));

vi.mock("../../../../core/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: null }),
    },
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
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    const copyItem = screen.getByRole("menuitem", { name: /copy/i });
    fireEvent.click(copyItem);

    await act(async () => {
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("নমস্কার দাদা"),
    );

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
