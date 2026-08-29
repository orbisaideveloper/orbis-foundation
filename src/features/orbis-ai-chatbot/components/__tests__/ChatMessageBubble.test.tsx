import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatMessageBubble } from "../ChatMessageBubble";

const message = {
  id: 1,
  role: "assistant" as const,
  content: "Complete assistant answer with details.",
  providerName: "ORBIS",
};

function firePointer(
  element: Element,
  type: "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel",
  overrides: Partial<{ clientX: number; clientY: number; button: number }> = {},
) {
  fireEvent[type](element, {
    clientX: 0,
    clientY: 0,
    button: 0,
    pointerId: 1,
    ...overrides,
  });
}

describe("ChatMessageBubble long-press", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the message content with no visible copy/share buttons", () => {
    render(
      <ChatMessageBubble
        message={message}
        onActivate={vi.fn()}
        isMenuOpen={false}
      />,
    );

    expect(screen.getByText(message.content)).toBeInTheDocument();
    expect(screen.queryByText("Copy")).not.toBeInTheDocument();
    expect(screen.queryByText("Share")).not.toBeInTheDocument();
  });

  it("shows the validated web links beside a web answer", () => {
    render(
      <ChatMessageBubble
        message={{
          ...message,
          evidence: {
            kind: "web-search",
            retrievedAt: "2026-08-29T00:00:00.000Z",
            sources: [
              {
                title: "Official weather source",
                url: "https://weather.example.test/siliguri",
              },
            ],
          },
        }}
        onActivate={vi.fn()}
        isMenuOpen={false}
      />,
    );

    const source = screen.getByRole("link", { name: "Official weather source" });
    expect(source).toHaveAttribute("href", "https://weather.example.test/siliguri");
    expect(screen.getByLabelText("Verified web sources")).toHaveTextContent(
      "Web sources · 1",
    );
  });

  it("opens the action menu after holding past the threshold", () => {
    const onActivate = vi.fn();
    render(
      <ChatMessageBubble
        message={message}
        onActivate={onActivate}
        isMenuOpen={false}
      />,
    );

    const bubble = screen.getByTestId(`chat-message-${message.id}`);
    firePointer(bubble, "pointerDown");
    vi.advanceTimersByTime(500);

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(
      message,
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });

  it("does not activate on a short tap released before the threshold", () => {
    const onActivate = vi.fn();
    render(
      <ChatMessageBubble
        message={message}
        onActivate={onActivate}
        isMenuOpen={false}
      />,
    );

    const bubble = screen.getByTestId(`chat-message-${message.id}`);
    firePointer(bubble, "pointerDown");
    vi.advanceTimersByTime(150);
    firePointer(bubble, "pointerUp");
    vi.advanceTimersByTime(1000);

    expect(onActivate).not.toHaveBeenCalled();
  });

  it("cancels the pending long press when the pointer moves (scroll guard)", () => {
    const onActivate = vi.fn();
    render(
      <ChatMessageBubble
        message={message}
        onActivate={onActivate}
        isMenuOpen={false}
      />,
    );

    const bubble = screen.getByTestId(`chat-message-${message.id}`);
    firePointer(bubble, "pointerDown", { clientX: 0, clientY: 0 });
    firePointer(bubble, "pointerMove", { clientX: 0, clientY: 40 });
    vi.advanceTimersByTime(500);

    expect(onActivate).not.toHaveBeenCalled();
  });

  it("cancels the pending long press on pointer cancel", () => {
    const onActivate = vi.fn();
    render(
      <ChatMessageBubble
        message={message}
        onActivate={onActivate}
        isMenuOpen={false}
      />,
    );

    const bubble = screen.getByTestId(`chat-message-${message.id}`);
    firePointer(bubble, "pointerDown");
    firePointer(bubble, "pointerCancel");
    vi.advanceTimersByTime(1000);

    expect(onActivate).not.toHaveBeenCalled();
  });

  it("does not start a long press while its own menu is already open", () => {
    const onActivate = vi.fn();
    render(
      <ChatMessageBubble
        message={message}
        onActivate={onActivate}
        isMenuOpen={true}
      />,
    );

    const bubble = screen.getByTestId(`chat-message-${message.id}`);
    firePointer(bubble, "pointerDown");
    vi.advanceTimersByTime(500);

    expect(onActivate).not.toHaveBeenCalled();
  });
});
