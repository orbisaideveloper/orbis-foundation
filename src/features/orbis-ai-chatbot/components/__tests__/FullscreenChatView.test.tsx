import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("automatically sends the final voice transcript when recognition ends", async () => {
    let recognitionInstance: {
      onresult: ((event: unknown) => void) | null;
      onend: (() => void) | null;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    } | null = null;

    class MockSpeechRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();

      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        recognitionInstance = this;
      }
    }

    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      writable: true,
      value: MockSpeechRecognition,
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          message: { role: "assistant", content: "হ্যালো! আমি Ollama." },
          provider: {
            name: "Ollama",
            type: "local",
            model: "tinyllama:latest",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<FullscreenChatView onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Voice input" }));

    recognitionInstance?.onresult?.({
      results: [
        {
          0: { transcript: "হ্যালো তুমি কেমন আছো" },
        },
      ],
    });
    recognitionInstance?.onend?.();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat");
    });

    expect(await screen.findByText("হ্যালো! আমি Ollama.")).toBeInTheDocument();
    expect(screen.getByText("Ollama")).toBeInTheDocument();

    fetchMock.mockRestore();
  });
});
