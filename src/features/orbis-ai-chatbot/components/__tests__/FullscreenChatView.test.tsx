import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { FullscreenChatView } from "../FullscreenChatView";
import { chatStorage } from "../../storage/ChatStorageManager";

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
    fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          message: {
            role: "assistant",
            content: "This is a mocked AI response.",
          },
          provider: {
            name: "Ollama",
            type: "local",
            model: "tinyllama",
          },
        }),
      } as Response;
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    fetchMock.mockRestore();
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  it("renders initial message properly", async () => {
    render(<FullscreenChatView onClose={() => {}} />);

    expect(await screen.findByText(/নমস্কার দাদা/i)).toBeInTheDocument();
  });

  it("sends a message, calls API, and saves to local storage", async () => {
    render(<FullscreenChatView onClose={() => {}} />);

    await screen.findByText(/নমস্কার দাদা/i);

    const input = screen.getByPlaceholderText("ORBIS-কে নির্দেশ দিন...");
    const sendBtn = screen.getByRole("button", {
      name: /send message/i,
    });

    fireEvent.change(input, {
      target: { value: "Hello ORBIS" },
    });

    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(
      await screen.findByText("This is a mocked AI response."),
    ).toBeInTheDocument();

    expect(chatStorage.saveMessage).toHaveBeenCalled();
  });

  it("processes attachments and sends processed files to the API", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:orbis-test");

    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");

    render(<FullscreenChatView onClose={() => {}} />);

    await screen.findByText(/নমস্কার দাদা/i);

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const image = new File(["image-data"], "photo.png", { type: "image/png" });

    const csv = new File(["name,amount\nORBIS,1"], "data.csv", {
      type: "text/csv",
    });

    fireEvent.change(fileInput, {
      target: {
        files: [image, csv],
      },
    });

    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText("data.csv")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /send message/i,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const request = fetchMock.mock.calls[0][1];
    const body = JSON.parse(request.body);

    expect(body.attachments).toHaveLength(2);

    expect(body.attachments[0]).toMatchObject({
      fileName: "photo.png",
      mimeType: "image/png",
    });

    expect(body.attachments[1]).toMatchObject({
      fileName: "data.csv",
      mimeType: "text/csv",
      textContent: "name,amount\nORBIS,1",
    });

    expect(createObjectURL).toHaveBeenCalledWith(image);

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:orbis-test");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("shows the connection error when the chat API fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        error: "Server unavailable",
      }),
    } as Response);

    render(<FullscreenChatView onClose={() => {}} />);

    await screen.findByText(/নমস্কার দাদা/i);

    fireEvent.change(screen.getByPlaceholderText("ORBIS-কে নির্দেশ দিন..."), {
      target: {
        value: "trigger failure",
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /send message/i,
      }),
    );

    expect(
      await screen.findByText("দুঃখিত, সংযোগ করা যাচ্ছে না।"),
    ).toBeInTheDocument();
  });

  it("shows voice support warning when speech recognition is unavailable", async () => {
    render(<FullscreenChatView onClose={() => {}} />);

    await screen.findByText(/নমস্কার দাদা/i);

    const micButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.querySelector("svg.lucide-mic"),
    );

    expect(micButton).toBeDefined();

    fireEvent.click(micButton!);

    expect(
      await screen.findByText("Voice Input support নেই।"),
    ).toBeInTheDocument();
  });

  it("clears chat after confirmation", async () => {
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<FullscreenChatView onClose={() => {}} />);

    await screen.findByText(/নমস্কার দাদা/i);

    fireEvent.click(screen.getByTitle("Clear Chat"));

    expect(confirmMock).toHaveBeenCalled();

    confirmMock.mockRestore();
  });
});
