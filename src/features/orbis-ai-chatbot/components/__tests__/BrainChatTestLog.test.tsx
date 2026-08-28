import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrainChatTestLog } from "../BrainChatTestLog";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  consent: "accepted" as "accepted" | "declined" | null,
  init: vi.fn(),
  getEntries: vi.fn(),
}));

const ADMIN_ID = "admin-1";
const LOG_ENTRY = {
  id: "entry-1",
  profileId: ADMIN_ID,
  conversationId: `${ADMIN_ID}:default-chat-v2`,
  userMessageId: 1,
  assistantMessageId: 2,
  startedAt: 1_700_000_000_000,
  completedAt: 1_700_000_000_500,
  durationMs: 500,
  providerName: "ORBIS Brain",
  providerType: "WEB",
  route: "web-search",
  routingDurationMs: 5,
  delivery: "fresh" as const,
  outcome: "success" as const,
  clarificationState: null,
  errorCategory: null,
  userMessage: { id: 1, profileId: ADMIN_ID, conversationId: `${ADMIN_ID}:default-chat-v2`, role: "user" as const, content: "প্রশ্ন", createdAt: 1_700_000_000_000 },
  assistantMessage: { id: 2, profileId: ADMIN_ID, conversationId: `${ADMIN_ID}:default-chat-v2`, role: "assistant" as const, content: "উত্তর", createdAt: 1_700_000_000_500 },
};

vi.mock("../../../../core/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

vi.mock("../../storage/ChatStorageManager", () => ({
  chatStorage: {
    getOrCreateAnonymousProfileId: vi.fn(() => "anonymous-test"),
    getConsent: vi.fn(() => mocks.consent),
    init: mocks.init,
    getTestLogEntries: mocks.getEntries,
    clearTestLogs: vi.fn(),
  },
}));

describe("BrainChatTestLog", () => {
  beforeEach(() => {
    mocks.consent = "accepted";
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: ADMIN_ID } } },
    });
    mocks.init.mockResolvedValue(undefined);
    mocks.getEntries.mockResolvedValue([]);
  });

  it("never exposes phone-local logs in the public preview", () => {
    render(<BrainChatTestLog previewMode />);
    expect(screen.getByText(/private phone-local Chat Test Log/i)).toBeInTheDocument();
    expect(mocks.getEntries).not.toHaveBeenCalled();
  });

  it("shows an honest empty state until a real local chat creates a log", async () => {
    render(<BrainChatTestLog previewMode={false} />);
    expect(await screen.findByText(/এখনো কোনো local Chat Test Log নেই/i)).toBeInTheDocument();
    await waitFor(() => expect(mocks.getEntries).toHaveBeenCalledWith(ADMIN_ID));
  });

  it("copies a complete visible log through the browser copy helper", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mocks.getEntries.mockResolvedValue([LOG_ENTRY]);

    render(<BrainChatTestLog previewMode={false} />);
    const copyButton = await screen.findByRole("button", { name: /copy log/i });
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("প্রশ্ন")));
    expect(screen.getByText("Log কপি হয়েছে।")).toBeInTheDocument();
  });
});
