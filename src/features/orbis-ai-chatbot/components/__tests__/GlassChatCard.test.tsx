import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlassChatCard } from "../GlassChatCard";

const CARD_TITLE = "ORBIS Neural Cockpit";
const BRAIN_TITLE = "ORBIS Assistant";
const CHAT_PLACEHOLDER = "ORBIS-কে নির্দেশ দিন...";
const AVAILABILITY_STATUS = "Check availability in chat";
const CHAT_PLACEHOLDER_REGEX = /ORBIS-কে নির্দেশ দিন/i;
const CARD_BUTTON_NAME = "Open ORBIS chat";
const DIALOG_LABEL = "ORBIS Assistant test view";
const BACK_LABEL = "Back from ORBIS Assistant";

vi.mock("../FullscreenChatView", () => ({
  FullscreenChatView: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label={DIALOG_LABEL}>
      <header>
        <button type="button" aria-label={BACK_LABEL} onClick={onClose}>
          Back
        </button>
        <span>{BRAIN_TITLE}</span>
      </header>
      <textarea placeholder={CHAT_PLACEHOLDER} readOnly />
    </div>
  ),
}));

describe("GlassChatCard", () => {
  it("renders the card correctly", () => {
    render(<GlassChatCard />);

    expect(screen.getByText(CARD_TITLE)).toBeInTheDocument();
    expect(screen.getByText(AVAILABILITY_STATUS)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(CHAT_PLACEHOLDER_REGEX),
    ).toBeInTheDocument();
  });

  it("opens fullscreen chat when the card is clicked", () => {
    render(<GlassChatCard />);

    const card = screen.getByRole("button", { name: CARD_BUTTON_NAME });
    fireEvent.click(card);

    expect(screen.getByRole("dialog", { name: DIALOG_LABEL })).toBeInTheDocument();
    expect(screen.getByText(BRAIN_TITLE)).toBeInTheDocument();
  });

  it("opens fullscreen chat when Enter is pressed", () => {
    render(<GlassChatCard />);

    const card = screen.getByRole("button", { name: CARD_BUTTON_NAME });
    fireEvent.keyDown(card, { key: "Enter" });

    expect(screen.getByRole("dialog", { name: DIALOG_LABEL })).toBeInTheDocument();
  });

  it("opens fullscreen chat when Space is pressed", () => {
    render(<GlassChatCard />);

    const card = screen.getByRole("button", { name: CARD_BUTTON_NAME });
    fireEvent.keyDown(card, { key: " " });

    expect(screen.getByRole("dialog", { name: DIALOG_LABEL })).toBeInTheDocument();
  });

  it("does not open fullscreen chat for unrelated keys", () => {
    render(<GlassChatCard />);

    const card = screen.getByRole("button", { name: CARD_BUTTON_NAME });
    fireEvent.keyDown(card, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: DIALOG_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("closes fullscreen chat when the back button is clicked", () => {
    render(<GlassChatCard />);

    const card = screen.getByRole("button", { name: CARD_BUTTON_NAME });
    fireEvent.click(card);

    expect(screen.getByRole("dialog", { name: DIALOG_LABEL })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: BACK_LABEL }));

    expect(screen.getByText(CARD_TITLE)).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: DIALOG_LABEL }),
    ).not.toBeInTheDocument();
  });
});
