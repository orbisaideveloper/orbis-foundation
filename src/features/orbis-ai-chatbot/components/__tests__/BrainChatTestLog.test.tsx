import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrainChatTestLog } from "../BrainChatTestLog";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  consent: "accepted" as "accepted" | "declined" | null,
  init: vi.fn(),
  getEntries: vi.fn(),
}));

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
      data: { session: { user: { id: "admin-1" } } },
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
    await waitFor(() => expect(mocks.getEntries).toHaveBeenCalledWith("admin-1"));
  });
});
