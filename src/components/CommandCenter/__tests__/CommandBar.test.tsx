import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import CommandBar from "../CommandBar";

const VOICE_COMMAND = "আমার সিস্টেম তথ্য দেখাও";

describe("CommandBar Component", () => {
  afterEach(() => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });
  it("renders correctly and handles input submit", () => {
    const mockSubmit = vi.fn();
    render(<CommandBar onCommandSubmit={mockSubmit} />);

    const input = screen.getByPlaceholderText("ORBIS-কে নির্দেশ দিন...");
    fireEvent.change(input, { target: { value: "টেস্ট কমান্ড" } });

    const submitBtn = screen.getByText("রান");
    fireEvent.click(submitBtn);

    expect(mockSubmit).toHaveBeenCalledWith("টেস্ট কমান্ড");
  });

  it("triggers submit on Enter key", () => {
    const mockSubmit = vi.fn();
    render(<CommandBar onCommandSubmit={mockSubmit} />);

    const input = screen.getByPlaceholderText("ORBIS-কে নির্দেশ দিন...");
    fireEvent.change(input, { target: { value: "এন্টার টেস্ট" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(mockSubmit).toHaveBeenCalledWith("এন্টার টেস্ট");
  });

  it("handles voice button click gracefully when speech recognition is missing", () => {
    window.alert = vi.fn();
    render(<CommandBar onCommandSubmit={vi.fn()} />);

    const voiceBtn = screen.getByText("🎤");
    fireEvent.click(voiceBtn);

    expect(window.alert).toHaveBeenCalledWith(
      "Browser doesn't support voice input.",
    );
  });

  it("previews a voice transcript instead of executing it immediately", () => {
    const mockSubmit = vi.fn();
    let recognition: any;
    (window as any).SpeechRecognition = class {
      lang = "";
      continuous = true;
      interimResults = false;
      maxAlternatives = 1;
      onstart?: () => void;
      onend?: () => void;
      onresult?: (event: any) => void;
      onerror?: (event: any) => void;
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        recognition = this;
      }
      start() {
        this.onstart?.();
      }
    };

    render(<CommandBar onCommandSubmit={mockSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
    act(() => {
      recognition.onresult({
        results: [
          Object.assign([{ transcript: VOICE_COMMAND, confidence: 0.9 }], {
            isFinal: true,
          }),
        ],
      });
    });

    expect(screen.getByDisplayValue(VOICE_COMMAND)).toBeInTheDocument();
    expect(mockSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("রান"));
    expect(mockSubmit).toHaveBeenCalledWith(VOICE_COMMAND);
  });
});
