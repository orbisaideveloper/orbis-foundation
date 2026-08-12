import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { FullscreenChatView } from "../FullscreenChatView";
import { chatStorage } from "../../storage/ChatStorageManager";

// ১. IndexedDB স্টোরেজ ম্যানেজারকে Mock করা হলো যাতে টেস্ট আটকে না যায়
vi.mock("../../storage/ChatStorageManager", () => ({
  chatStorage: {
    init: vi.fn().mockResolvedValue(undefined),
    createConversation: vi.fn().mockResolvedValue(undefined),
    getMessagesByConversation: vi.fn().mockResolvedValue([]),
    saveMessage: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("FullscreenChatView", () => {
  let fetchMock: any;

  beforeEach(() => {
    // ২. Fetch API কে Mock করা হলো
    fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          message: {
            role: "assistant",
            content: "This is a mocked AI response.",
          },
          provider: { name: "Ollama", type: "local", model: "tinyllama" },
        }),
      } as Response;
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("renders initial message properly", async () => {
    render(<FullscreenChatView onClose={() => {}} />);
    expect(await screen.findByText(/নমস্কার দাদা/i)).toBeInTheDocument();
  });

  it("sends a message, calls API, and saves to local storage", async () => {
    render(<FullscreenChatView onClose={() => {}} />);

    // ডাটাবেস লোড হওয়া পর্যন্ত অপেক্ষা করা
    await screen.findByText(/নমস্কার দাদা/i);

    const input = screen.getByPlaceholderText("ORBIS-কে নির্দেশ দিন...");
    const sendBtn = screen.getByRole("button", { name: /send message/i });

    // ইউজার ইনপুট দেওয়া হলো
    fireEvent.change(input, { target: { value: "Hello ORBIS" } });
    fireEvent.click(sendBtn);

    // Fetch কল হওয়ার জন্য অপেক্ষা
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // মক করা রেসপন্স স্ক্রিনে এসেছে কিনা যাচাই
    expect(
      await screen.findByText("This is a mocked AI response."),
    ).toBeInTheDocument();

    // মেসেজ লোকাল স্টোরেজে সেভ হয়েছে কিনা যাচাই
    expect(chatStorage.saveMessage).toHaveBeenCalled();
  });
});
