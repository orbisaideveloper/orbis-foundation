import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnimatedMonitorFrame } from "../AnimatedMonitorFrame";

describe("AnimatedMonitorFrame", () => {
  it("preserves caller-owned title, content, styling, and close behavior", () => {
    const onClose = vi.fn();
    render(
      <AnimatedMonitorFrame
        className="caller-frame"
        contentClassName="caller-content"
        headerClassName="caller-header"
        onClose={onClose}
        title="Caller title"
      >
        <p>Caller content</p>
      </AnimatedMonitorFrame>,
    );

    expect(screen.getByText("Caller title")).toBeInTheDocument();
    expect(screen.getByText("Caller content")).toBeInTheDocument();
    expect(document.querySelector(".caller-frame")).not.toBeNull();
    expect(document.querySelector(".caller-content")).not.toBeNull();
    expect(document.querySelector(".caller-header")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
