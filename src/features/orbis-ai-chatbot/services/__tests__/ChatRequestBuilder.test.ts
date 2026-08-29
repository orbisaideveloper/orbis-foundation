import { describe, expect, it } from "vitest";
import {
  chatRequestByteLength,
  MAX_CHAT_REQUEST_BYTES,
  MAX_CHAT_REQUEST_MESSAGES,
  prepareContextRecoveryRequest,
  prepareChatRequest,
} from "../ChatRequestBuilder";

const NOW = 1_800_000_000_000;

describe("ChatRequestBuilder", () => {
  it("keeps the newest user message while removing only complete old turns", () => {
    const source = Array.from({ length: 24 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn-${index}`,
    }));
    source.push({ role: "user", content: "latest user request" });

    const result = prepareChatRequest(source, null, NOW);

    expect(result.errorCode).toBeNull();
    expect(result.payload.messages).toHaveLength(MAX_CHAT_REQUEST_MESSAGES);
    expect(result.payload.messages.at(-1)).toEqual({
      role: "user",
      content: "latest user request",
    });
  });

  it("keeps a bounded UTF-8 payload and drops oldest context before the newest request", () => {
    const source = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `পুরোনো-${index}-${"ক".repeat(5_000)}`,
    }));
    source.push({ role: "user", content: "আমার সর্বশেষ অনুরোধ" });

    const result = prepareChatRequest(source, null, NOW);

    expect(result.errorCode).toBeNull();
    expect(chatRequestByteLength(result.payload)).toBeLessThanOrEqual(
      MAX_CHAT_REQUEST_BYTES,
    );
    expect(result.payload.messages.at(-1)?.content).toBe("আমার সর্বশেষ অনুরোধ");
    expect(result.payload.messages.length).toBeLessThan(
      MAX_CHAT_REQUEST_MESSAGES,
    );
  });

  it("removes expired clarification context instead of sending it again", () => {
    const result = prepareChatRequest(
      [{ role: "user", content: "একটা PDF বানিয়ে দাও" }],
      {
        kind: "weather-location",
        originalRequest: "আজকের weather বলো",
        createdAt: NOW - 11 * 60 * 1000,
        expiresAt: NOW - 1,
      },
      NOW,
    );

    expect(result.droppedInvalidPending).toBe(true);
    expect(result.pendingClarification).toBeNull();
    expect(result.payload.pendingClarification).toBeUndefined();
  });

  it("reports an oversized newest message without silently changing it", () => {
    const content = "x".repeat(16_001);
    const result = prepareChatRequest([{ role: "user", content }], null, NOW);

    expect(result.errorCode).toBe("CHAT_MESSAGE_TOO_LARGE");
    expect(result.payload.messages[0].content).toBe(content);
  });

  it("builds a minimal recovery payload without changing the saved transcript", () => {
    const newestQuestion = "নতুন যেকোনো প্রশ্ন";
    const source = [
      { role: "user" as const, content: "পুরোনো প্রশ্ন" },
      { role: "assistant" as const, content: "পুরোনো উত্তর" },
      { role: "user" as const, content: `  ${newestQuestion}  ` },
    ];

    const result = prepareContextRecoveryRequest(source);

    expect(result.errorCode).toBeNull();
    expect(result.payload).toEqual({
      messages: [{ role: "user", content: newestQuestion }],
    });
    expect(source).toEqual([
      { role: "user", content: "পুরোনো প্রশ্ন" },
      { role: "assistant", content: "পুরোনো উত্তর" },
      { role: "user", content: `  ${newestQuestion}  ` },
    ]);
  });
});
