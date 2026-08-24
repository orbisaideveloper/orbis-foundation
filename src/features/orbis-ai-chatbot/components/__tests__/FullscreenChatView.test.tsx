import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullscreenChatView } from "../FullscreenChatView";

const CHAT_PLACEHOLDER = "ORBIS-কে নির্দেশ দিন...";
const WEATHER_CLARIFICATION_PROMPT = "কোন জায়গার weather?";
const WEATHER_LOCATION_KIND = "weather-location";
const BENGALI_WEATHER_REQUEST = "আজকের ওয়েদারটা একটু বলবে আমাকে";

const mocks = vi.hoisted(() => ({
  consent: "declined" as "accepted" | "declined" | null,
  getSession: vi.fn(),
  init: vi.fn(),
  saveMessage: vi.fn(),
  setPending: vi.fn(),
  learningConsent: "declined" as "accepted" | "declined" | null,
  setLearningConsent: vi.fn(),
}));

vi.mock("../../../../core/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

vi.mock("../../storage/ChatStorageManager", () => ({
  chatStorage: {
    getConsent: vi.fn(() => mocks.consent),
    setConsent: vi.fn(),
    getLearningConsent: vi.fn(() => mocks.learningConsent),
    setLearningConsent: mocks.setLearningConsent,
    getOrCreateAnonymousProfileId: vi.fn(() => "anonymous-test"),
    init: mocks.init,
    createConversation: vi.fn().mockResolvedValue(undefined),
    getMessagesByConversation: vi.fn().mockResolvedValue([]),
    saveMessage: mocks.saveMessage,
    getPendingClarification: vi.fn().mockResolvedValue(null),
    setPendingClarification: mocks.setPending,
    getCachedResponse: vi.fn().mockResolvedValue(null),
    saveCachedResponse: vi.fn().mockResolvedValue(undefined),
    getUsage: vi.fn().mockResolvedValue({
      budgetBytes: 500 * 1024 * 1024,
      logicalBytes: 1024,
      deviceUsageBytes: null,
      deviceQuotaBytes: null,
      warning: false,
    }),
    clearConversation: vi.fn().mockResolvedValue(undefined),
    clearPersonalMemory: vi.fn().mockResolvedValue(undefined),
    clearAllForProfile: vi.fn().mockResolvedValue(undefined),
  },
}));

function successfulResponse(content = "This is a mocked AI response.") {
  return {
    ok: true,
    json: async () => ({
      message: { role: "assistant", content },
      provider: { name: "Ollama", type: "local", model: "tinyllama" },
      clarification: { state: "none", pending: null },
    }),
  } as Response;
}

describe("FullscreenChatView", () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.consent = "declined";
    mocks.learningConsent = "declined";
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "test-access-token",
          user: { id: "account-1" },
        },
      },
      error: null,
    });
    mocks.init.mockResolvedValue(undefined);
    mocks.saveMessage.mockResolvedValue(undefined);
    mocks.setPending.mockResolvedValue(undefined);
    mocks.setLearningConsent.mockReset();
    fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(successfulResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  it("shows a deterministic greeting immediately and asks first-use consent", async () => {
    mocks.consent = null;
    render(<FullscreenChatView onClose={() => {}} />);
    expect(screen.getByText(/নমস্কার দাদা/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", { name: /Save Chatbot memory/i }),
    ).toBeInTheDocument();
  });

  it("sends only supported chat fields with verified auth in session-only mode", async () => {
    render(<FullscreenChatView onClose={() => {}} />);
    const input = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);
    fireEvent.change(input, { target: { value: "Hello ORBIS" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(
      await screen.findByText("This is a mocked AI response."),
    ).toBeInTheDocument();
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(request.headers).get("Authorization")).toBe(
      "Bearer test-access-token",
    );
    const body = JSON.parse(String(request.body));
    expect(body.attachments).toBeUndefined();
    expect(mocks.saveMessage).not.toHaveBeenCalled();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("persists clarification state only after storage consent", async () => {
    mocks.consent = "accepted";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: { role: "assistant", content: WEATHER_CLARIFICATION_PROMPT },
        provider: {
          name: "ORBIS Brain (Web)",
          type: "WEB_SEARCH_CLARIFICATION",
        },
        clarification: {
          state: "pending",
          pending: {
            kind: WEATHER_LOCATION_KIND,
            originalRequest: "আজকের weather বলো",
            createdAt: 1,
            expiresAt: Date.now() + 60_000,
          },
        },
      }),
    } as Response);
    render(<FullscreenChatView onClose={() => {}} />);
    const input = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "আজকের weather বলো" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await screen.findByText(WEATHER_CLARIFICATION_PROMPT);
    expect(mocks.setPending).toHaveBeenCalledWith(
      "account-1",
      "account-1:default-chat-v2",
      expect.objectContaining({ kind: WEATHER_LOCATION_KIND }),
    );
  });

  it("returns session-local pending context on a Bengali location follow-up", async () => {
    mocks.setPending.mockClear();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            role: "assistant",
            content: WEATHER_CLARIFICATION_PROMPT,
          },
          provider: {
            name: "ORBIS Brain (Web)",
            type: "WEB_SEARCH_CLARIFICATION",
          },
          clarification: {
            state: "pending",
            pending: {
              kind: WEATHER_LOCATION_KIND,
              originalRequest: BENGALI_WEATHER_REQUEST,
              createdAt: Date.now(),
              expiresAt: Date.now() + 60_000,
            },
          },
        }),
      } as Response)
      .mockResolvedValueOnce(successfulResponse("কলকাতার weather result"));
    render(<FullscreenChatView onClose={() => {}} />);
    const input = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);

    fireEvent.change(input, {
      target: { value: BENGALI_WEATHER_REQUEST },
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await screen.findByText(WEATHER_CLARIFICATION_PROMPT);
    fireEvent.change(input, { target: { value: "কলকাতা" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await screen.findByText("কলকাতার weather result");

    const followUpBody = JSON.parse(
      String((fetchMock.mock.calls[1][1] as RequestInit).body),
    );
    expect(followUpBody.pendingClarification).toEqual(
      expect.objectContaining({
        kind: WEATHER_LOCATION_KIND,
        originalRequest: BENGALI_WEATHER_REQUEST,
      }),
    );
    expect(mocks.setPending).not.toHaveBeenCalled();
  });

  it("keeps the greeting and offers recovery when IndexedDB fails", async () => {
    mocks.consent = "accepted";
    mocks.init.mockRejectedValueOnce(new Error("blocked"));
    render(<FullscreenChatView onClose={() => {}} />);
    expect(screen.getByText(/নমস্কার দাদা/i)).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Retry/);
    expect(
      screen.getByRole("button", { name: "Session only" }),
    ).toBeInTheDocument();
  });

  it("maps server timeout to an actionable safe category", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 504,
      json: async () => ({
        error: { category: "timeout", code: "PROVIDER_TIMEOUT" },
      }),
    } as Response);
    render(<FullscreenChatView onClose={() => {}} />);
    const input = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);
    fireEvent.change(input, { target: { value: "trigger timeout" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText(/সময়মতো সাড়া দেয়নি/)).toBeInTheDocument();
  });

  it("shows voice support warning when speech recognition is unavailable", async () => {
    render(<FullscreenChatView onClose={() => {}} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /voice input/i }),
    );
    expect(
      await screen.findByText("Voice Input support নেই।"),
    ).toBeInTheDocument();
  });

  it("keeps learning consent separate and requires candidate review before approval", async () => {
    fetchMock
      .mockResolvedValueOnce(successfulResponse("ordinary reply"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidate: {
            content:
              "Protected capability execution requires deterministic validation.",
            category: "OPERATING_RULE",
            tags: ["validation"],
          },
          approvalToken: "signed-approval-token",
          expiresAt: Date.now() + 60_000,
        }),
      } as Response);
    render(<FullscreenChatView onClose={() => {}} />);
    const input = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);
    fireEvent.change(input, {
      target: {
        value:
          "The application should validate requests before protected execution.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await screen.findByText("ordinary reply");
    fireEvent.click(screen.getByTitle("Local data controls"));
    fireEvent.click(
      screen.getByRole("button", { name: "Enable learning review" }),
    );
    expect(mocks.setLearningConsent).toHaveBeenCalledWith(
      "account-1",
      "accepted",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review latest message for learning",
      }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "Review generalized learning candidate",
      }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const previewBody = JSON.parse(
      String((fetchMock.mock.calls[1][1] as RequestInit).body),
    );
    expect(previewBody.consent).toBe(true);
    expect(
      screen.getByRole("button", { name: "Approve and save" }),
    ).toBeInTheDocument();
  });
});
