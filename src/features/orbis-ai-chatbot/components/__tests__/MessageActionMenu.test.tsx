import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MessageActionMenu } from "../MessageActionMenu";

describe("MessageActionMenu", () => {
  const position = { x: 10, y: 10 };

  it("shows Copy and Share when sharing is supported, and calls onCopy/onClose", () => {
    const onCopy = vi.fn();
    const onShare = vi.fn();
    const onClose = vi.fn();

    render(
      <MessageActionMenu
        position={position}
        canShare={true}
        onCopy={onCopy}
        onShare={onShare}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("menuitem", { name: /copy/i })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /share/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: /copy/i }));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 15000);

  it("hides Share when the platform does not support it", () => {
    render(
      <MessageActionMenu
        position={position}
        canShare={false}
        onCopy={vi.fn()}
        onShare={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("menuitem", { name: /copy/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /share/i }),
    ).not.toBeInTheDocument();
  });

  it("closes when clicking outside the menu", () => {
    const onClose = vi.fn();
    render(
      <>
        <div data-testid="outside">outside</div>
        <MessageActionMenu
          position={position}
          canShare={true}
          onCopy={vi.fn()}
          onShare={vi.fn()}
          onClose={onClose}
        />
      </>,
    );

    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <MessageActionMenu
        position={position}
        canShare={true}
        onCopy={vi.fn()}
        onShare={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
