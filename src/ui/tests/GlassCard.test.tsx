/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GlassCard } from "../components/GlassCard";

// Mock Browser Clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
});

describe("GlassCard Interactions (Coverage Restoration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should copy string data to clipboard and show visual feedback", async () => {
    render(
      <GlassCard title="Test String" rawData="Direct String Data">
        <div>Content</div>
      </GlassCard>,
    );

    // Find and click the Copy button
    const copyBtn = screen.getByTitle("Copy to Clipboard");
    fireEvent.click(copyBtn);

    // Check if clipboard API was called
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "Direct String Data",
    );

    // Check if the icon changes to "Copied!"
    await waitFor(() => {
      expect(screen.getByTitle("Copied!")).toBeDefined();
    });
  });

  it("should copy object data as JSON to clipboard", async () => {
    const mockData = { status: "OK" };
    render(
      <GlassCard title="Test Object" rawData={mockData}>
        <div>Content</div>
      </GlassCard>,
    );

    const copyBtn = screen.getByTitle("Copy to Clipboard");
    fireEvent.click(copyBtn);

    // Should convert object to formatted JSON
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify(mockData, null, 2),
    );
  });

  it("should toggle expanded JSON view", async () => {
    render(
      <GlassCard title="Expand Test" rawData={{ data: "test" }}>
        <div>Content</div>
      </GlassCard>,
    );

    // Expand view
    const expandBtn = screen.getByTitle("Expand JSON View");
    fireEvent.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByTitle("Collapse View")).toBeDefined();
    });

    // Collapse view
    const collapseBtn = screen.getByTitle("Collapse View");
    fireEvent.click(collapseBtn);

    await waitFor(() => {
      expect(screen.getByTitle("Expand JSON View")).toBeDefined();
    });
  });
});
