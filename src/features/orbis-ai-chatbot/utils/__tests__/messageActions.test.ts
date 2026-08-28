import { describe, it, expect, vi, afterEach } from "vitest";
import {
  copyMessageContent,
  isShareSupported,
  shareMessageContent,
} from "../messageActions";

const SAMPLE_MESSAGE = "complete message content";
const SHORT_MESSAGE = "hello";

describe("messageActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error cleaning up test-only globals
    delete navigator.clipboard;
    // @ts-expect-error cleaning up test-only globals
    delete navigator.share;
  });

  describe("copyMessageContent", () => {
    it("writes the complete content to the clipboard and resolves true", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      const result = await copyMessageContent(SAMPLE_MESSAGE);

      expect(writeText).toHaveBeenCalledWith(SAMPLE_MESSAGE);
      expect(result).toBe(true);
    });

    it("resolves false without throwing when clipboard API is unavailable", async () => {
      // @ts-expect-error simulating unsupported environment
      delete navigator.clipboard;

      await expect(copyMessageContent(SHORT_MESSAGE)).resolves.toBe(false);
    });

    it("resolves false without throwing when clipboard access is denied", async () => {
      const writeText = vi.fn().mockRejectedValue(new Error("denied"));
      Object.assign(navigator, { clipboard: { writeText } });

      await expect(copyMessageContent(SHORT_MESSAGE)).resolves.toBe(false);
    });

    it("uses the Android-compatible fallback when the Clipboard API is unavailable", async () => {
      // @ts-expect-error simulating unsupported environment
      delete navigator.clipboard;
      const execCommand = vi.fn(() => true);
      Object.assign(document, { execCommand });

      await expect(copyMessageContent(SHORT_MESSAGE)).resolves.toBe(true);
      expect(execCommand).toHaveBeenCalledWith("copy");
    });
  });

  describe("isShareSupported / shareMessageContent", () => {
    it("reports unsupported when navigator.share is missing", () => {
      // @ts-expect-error simulating unsupported environment
      delete navigator.share;
      expect(isShareSupported()).toBe(false);
    });

    it("calls navigator.share with the complete content", async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { share });

      const result = await shareMessageContent(SAMPLE_MESSAGE);

      expect(share).toHaveBeenCalledWith({
        text: SAMPLE_MESSAGE,
      });
      expect(result).toBe(true);
    });

    it("resolves false without throwing when share is cancelled/unsupported", async () => {
      const share = vi.fn().mockRejectedValue(new Error("AbortError"));
      Object.assign(navigator, { share });

      await expect(shareMessageContent(SHORT_MESSAGE)).resolves.toBe(false);
    });
  });
});
