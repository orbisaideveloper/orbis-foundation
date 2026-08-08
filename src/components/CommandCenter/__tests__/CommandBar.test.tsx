import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CommandBar from "../CommandBar";

describe("CommandBar Component", () => {
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
});
