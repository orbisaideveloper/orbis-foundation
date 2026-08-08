import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SystemOverview } from "../SystemOverview";

// GlassChatCard কে মক (Mock) করছি যাতে শুধু SystemOverview টেস্ট হয়
vi.mock("../../../../features/orbis-ai-chatbot", () => ({
  GlassChatCard: () => <div data-testid="mock-chat-card">Mock Chat Card</div>,
}));

describe("SystemOverview", () => {
  it("renders SystemOverview header and GlassChatCard", () => {
    render(<SystemOverview />);
    expect(screen.getByText(/System Overview/i)).toBeDefined();
    expect(screen.getByText(/Smart Orchestration Management/i)).toBeDefined();
    expect(screen.getByTestId("mock-chat-card")).toBeDefined();
  });
});
