import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GlassChatCard } from "../GlassChatCard";

/* eslint-disable sonarjs/no-duplicate-string */
const CARD_TITLE = "ORBIS Neural Cockpit";
const BRAIN_TITLE = "ORBIS Brain";
const CHAT_PLACEHOLDER = "ORBIS-কে নির্দেশ দিন...";
const AVAILABILITY_STATUS = "Check availability in chat";
const CHAT_PLACEHOLDER_REGEX = /ORBIS-কে নির্দেশ দিন/i;
const CARD_BUTTON_SELECTOR = '[role="button"]';

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

    const card = screen.getByText(CARD_TITLE).closest(CARD_BUTTON_SELECTOR)!;
    fireEvent.click(card);

    expect(
      document.querySelector(`textarea[placeholder="${CHAT_PLACEHOLDER}"]`),
    ).toBeInTheDocument();
    expect(screen.getByText(BRAIN_TITLE)).toBeInTheDocument();
  });

  it("opens fullscreen chat when Enter is pressed", () => {
    render(<GlassChatCard />);

    const card = screen.getByText(CARD_TITLE).closest(CARD_BUTTON_SELECTOR)!;

    fireEvent.keyDown(card, { key: "Enter" });

    expect(screen.getByText(BRAIN_TITLE)).toBeInTheDocument();
  });

  it("opens fullscreen chat when Space is pressed", () => {
    render(<GlassChatCard />);

    const card = screen.getByText(CARD_TITLE).closest(CARD_BUTTON_SELECTOR)!;

    fireEvent.keyDown(card, { key: " " });

    expect(screen.getByText(BRAIN_TITLE)).toBeInTheDocument();
  });

  it("does not open fullscreen chat for unrelated keys", () => {
    render(<GlassChatCard />);

    const card = screen.getByText(CARD_TITLE).closest(CARD_BUTTON_SELECTOR)!;

    fireEvent.keyDown(card, { key: "Escape" });

    expect(screen.queryByText("ORBIS Brain")).not.toBeInTheDocument();
  });

  it("closes fullscreen chat when the back button is clicked", () => {
    render(<GlassChatCard />);

    const card = screen.getByText(CARD_TITLE).closest(CARD_BUTTON_SELECTOR)!;
    fireEvent.click(card);

    expect(screen.getByText(BRAIN_TITLE)).toBeInTheDocument();

    const backButton = screen
      .getByText("ORBIS Brain")
      .closest("header")
      ?.querySelector("button");

    expect(backButton).toBeTruthy();
    fireEvent.click(backButton!);

    expect(screen.getByText(CARD_TITLE)).toBeInTheDocument();
    expect(screen.queryByText("ORBIS Brain")).not.toBeInTheDocument();
  });
});
