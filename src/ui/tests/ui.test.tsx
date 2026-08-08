import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppHeader } from "../layout/AppHeader";
import { AppLayout } from "../layout/AppLayout";
import { GlassCard } from "../components/GlassCard";
import { JsonViewer } from "../components/JsonViewer";

describe("UI Components Render Test (Coverage Restoration)", () => {
  it("should render AppHeader correctly", () => {
    const html = renderToStaticMarkup(<AppHeader />);
    expect(html).toContain("ORBIS");
  });

  it("should render GlassCard and handle rawData prop visually", () => {
    const mockData = { test: "value" };
    const html = renderToStaticMarkup(
      <GlassCard title="Test Widget" rawData={mockData}>
        <div>Widget Content</div>
      </GlassCard>,
    );
    expect(html).toContain("Test Widget");
    expect(html).toContain("Widget Content");
    // Button should render when rawData is passed
    expect(html).toContain("Expand JSON View");
  });

  it("should render JsonViewer correctly", () => {
    const mockData = { test: "value" };
    const html = renderToStaticMarkup(<JsonViewer data={mockData} />);
    expect(html).toContain("test");
    expect(html).toContain("value");
  });
});
