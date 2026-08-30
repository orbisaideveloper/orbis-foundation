import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullscreenChatView } from "../FullscreenChatView";

const CHAT_PLACEHOLDER = "ORBIS-কে নির্দেশ দিন...";
const WEATHER_CLARIFICATION_PROMPT = "কোন জায়গার weather?";
const WEATHER_LOCATION_KIND = "weather-location";
const BENGALI_WEATHER_REQUEST = "আজকের ওয়েদারটা একটু বলবে আমাকে";
const MOCK_AI_RESPONSE = "This is a mocked AI response.";
const WEB_PROVIDER_NAME = "ORBIS Brain (Web)";
const WEB_CLARIFICATION_TYPE = "WEB_SEARCH_CLARIFICATION";
const DEFAULT_CONVERSATION_ID = "account-1:default-chat-v2";
const WEATHER_REQUEST = "আজকের weather বলো";

const mocks = vi.hoisted(() => {
  const declined = "declined" as const;
  return {
    consent: declined as "accepted" | "declined" | null,
    getSession: vi.fn(),
    init: vi.fn(),
    saveMessage: vi.fn(),
    saveTestLog: vi.fn(),
    setPending: vi.fn(),
    getMessages: vi.fn(),
    learningConsent: declined as "accepted" | "declined" | null,
    setLearningConsent: vi.fn(),
  };
});

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
    getMessagesByConversation: mocks.getMessages,
    saveMessage: mocks.saveMessage,
    saveTestLog: mocks.saveTestLog,
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

function successfulResponse(content = MOCK_AI_RESPONSE) {
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
    mocks.consent = mocks.learningConsent = "declined";
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
    mocks.saveTestLog.mockResolvedValue(undefined);
    mocks.setPending.mockResolvedValue(undefined);
    mocks.getMessages.mockResolvedValue([]);
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

    expect(await screen.findByText(MOCK_AI_RESPONSE)).toBeInTheDocument();
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
          name: WEB_PROVIDER_NAME,
          type: WEB_CLARIFICATION_TYPE,
        },
        clarification: {
          state: "pending",
          pending: {
            kind: WEATHER_LOCATION_KIND,
            originalRequest: WEATHER_REQUEST,
            createdAt: 1,
            expiresAt: Date.now() + 60_000,
          },
        },
      }),
    } as Response);
    render(<FullscreenChatView onClose={() => {}} />);
    const input = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: WEATHER_REQUEST } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await screen.findByText(WEATHER_CLARIFICATION_PROMPT);
    expect(mocks.setPending).toHaveBeenCalledWith(
      "account-1",
      DEFAULT_CONVERSATION_ID,
      expect.objectContaining({ kind: WEATHER_LOCATION_KIND }),
    );
  });

  it("stores the real provider, route and latency as a local Test Log reference", async () => {
    mocks.consent = "accepted";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: { role: "assistant", content: MOCK_AI_RESPONSE },
        provider: { name: WEB_PROVIDER_NAME, type: "WEB_SEARCH" },
        route: "web-search",
        routingDurationMs: 4,
        learningPolicy: {
          applied: [
            {
              code: "time-sensitive-evidence",
              label: "Evidence verification",
            },
          ],
        },
        clarification: { state: "none", pending: null },
      }),
    } as Response);
    render(<FullscreenChatView onClose={() => {}} />);
    const input = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: WEATHER_REQUEST } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await screen.findByText(MOCK_AI_RESPONSE);
    expect(mocks.saveTestLog).toHaveBeenCalledWith(
      expect.objectContaining({
        providerName: WEB_PROVIDER_NAME,
        providerType: "WEB_SEARCH",
        route: "web-search",
        routingDurationMs: 4,
        appliedLearningPolicyCodes: ["time-sensitive-evidence"],
        delivery: "fresh",
        outcome: "success",
      }),
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
            name: WEB_PROVIDER_NAME,
            type: WEB_CLARIFICATION_TYPE,
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
      .mockResolvedValueOnce(successfulResponse("শিলিগুড়ির weather result"));
    render(<FullscreenChatView onClose={() => {}} />);
    const input = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);

    fireEvent.change(input, {
      target: { value: BENGALI_WEATHER_REQUEST },
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await screen.findByText(WEATHER_CLARIFICATION_PROMPT);
    fireEvent.change(input, { target: { value: "শিলিগুড়ি" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    await screen.findByText("শিলিগুড়ির weather result");

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

  it("does not retry or tell a user to shorten text for unsupported attachments", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { category: "invalid_request", code: "ATTACHMENTS_UNSUPPORTED" },
      }),
    } as Response);
    render(<FullscreenChatView onClose={() => {}} />);
    const input = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);
    fireEvent.change(input, { target: { value: "একটা PDF বানিয়ে দাও" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(
      await screen.findByText("Attachment এখনো chat-এ যুক্ত হয়নি।"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/লেখা ছোট করে/)).not.toBeInTheDocument();
  });

  it("retries any valid new question once with minimal context after legacy context is rejected", async () => {
    mocks.consent = "accepted";
    mocks.getMessages.mockResolvedValue(
      Array.from({ length: 124 }, (_, index) => ({
        id: index + 100,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `পুরোনো turn ${index}`,
        providerName: "ORBIS",
      })),
    );
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { category: "invalid_request", code: "CHAT_INPUT_INVALID" },
        }),
      } as Response)
      .mockResolvedValueOnce(successfulResponse("নতুন প্রশ্নের উত্তর"));

    render(<FullscreenChatView onClose={() => {}} />);
    const input = await screen.findByPlaceholderText(CHAT_PLACEHOLDER);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "নতুন যেকোনো প্রশ্ন" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText("নতুন প্রশ্নের উত্তর")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const initialBody = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    );
    const recoveryBody = JSON.parse(
      String((fetchMock.mock.calls[1][1] as RequestInit).body),
    );
    expect(initialBody.messages).toHaveLength(20);
    expect(recoveryBody).toEqual({
      messages: [{ role: "user", content: "নতুন যেকোনো প্রশ্ন" }],
    });
    expect(mocks.setPending).toHaveBeenCalledWith(
      "account-1",
      DEFAULT_CONVERSATION_ID,
      null,
    );
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

  it("previews multilingual voice text and waits for explicit Send", async () => {
    let recognition: any;
    (window as any).SpeechRecognition = class {
      lang = "";
      continuous = true;
      interimResults = false;
      maxAlternatives = 1;
      onresult?: (event: any) => void;
      onend?: () => void;
      onerror?: (event: any) => void;
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        recognition = this;
      }
      start() {}
      stop() {
        this.onend?.();
      }
    };

    render(<FullscreenChatView onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Voice input" }));
    recognition.onresult({
      results: [
        Object.assign(
          [{ transcript: "ঘনশ্যামকে ১২০ liter देना है", confidence: 0.91 }],
          { isFinal: true },
        ),
      ],
    });
    recognition.onend();

    expect(
      await screen.findByDisplayValue("ঘনশ্যামকে ১২০ liter देना है"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(await screen.findByText(MOCK_AI_RESPONSE)).toBeInTheDocument();
  });

  it("moves voice language selection to the header and keeps clear chat in data controls", async () => {
    render(<FullscreenChatView onClose={() => {}} />);
    const languageButton = await screen.findByRole("button", {
      name: "Voice language",
    });

    expect(languageButton).toHaveTextContent("BN");
    expect(screen.queryByTitle("Clear Chat")).not.toBeInTheDocument();

    fireEvent.click(languageButton);
    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "English (India)" }),
    );
    expect(languageButton).toHaveTextContent("EN");

    fireEvent.click(screen.getByTitle("Local data controls"));
    expect(
      screen.getByRole("button", { name: "Clear chat" }),
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
