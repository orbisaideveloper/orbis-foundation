import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../storage/chatStorage.types";
import {
  chatArchiveFileName,
  formatChatArchiveJson,
  formatChatArchiveText,
  selectChatArchiveMessages,
} from "../chatArchive";

const NOW = Date.UTC(2026, 8, 29, 16, 0, 0);

const PROFILE_ID = "profile-secret";
const CONVERSATION_ID = "conversation-secret";
const HOURS_25_AGO = "25 hours ago";
const HOURS_7_AGO = "7 hours ago";
const HOURS_5_AGO = "5 hours ago";
const HOURS_1_AGO = "1 hour ago";

function message(
  hoursAgo: number,
  role: "user" | "assistant",
  content: string,
): ChatMessage {
  return {
    id: hoursAgo + (role === "user" ? 1 : 100),
    profileId: PROFILE_ID,
    conversationId: CONVERSATION_ID,
    role,
    content,
    createdAt: NOW - hoursAgo * 60 * 60 * 1000,
    providerName: role === "assistant" ? "ORBIS" : undefined,
  };
}

describe("chatArchive", () => {
  const messages = [
    message(49, "user", "49 hours ago"),
    message(25, "assistant", HOURS_25_AGO),
    message(7, "user", HOURS_7_AGO),
    message(5, "assistant", HOURS_5_AGO),
    message(1, "user", HOURS_1_AGO),
  ];

  it("selects exact 6h, 24h, 48h and all ranges chronologically", () => {
    expect(
      selectChatArchiveMessages(messages, "6h", NOW).map(
        (item) => item.content,
      ),
    ).toEqual([HOURS_5_AGO, HOURS_1_AGO]);

    expect(
      selectChatArchiveMessages(messages, "24h", NOW).map(
        (item) => item.content,
      ),
    ).toEqual([HOURS_7_AGO, HOURS_5_AGO, HOURS_1_AGO]);

    expect(
      selectChatArchiveMessages(messages, "48h", NOW).map(
        (item) => item.content,
      ),
    ).toEqual([
      HOURS_25_AGO,
      HOURS_7_AGO,
      HOURS_5_AGO,
      HOURS_1_AGO,
    ]);

    expect(
      selectChatArchiveMessages(messages, "all", NOW).map(
        (item) => item.content,
      ),
    ).toEqual([
      "49 hours ago",
      HOURS_25_AGO,
      HOURS_7_AGO,
      HOURS_5_AGO,
      HOURS_1_AGO,
    ]);
  });

  it("formats a readable transcript without internal profile identifiers", () => {
    const selected = selectChatArchiveMessages(messages, "6h", NOW);
    const text = formatChatArchiveText(selected, "6h", NOW);

    expect(text).toContain("ORBIS CHAT ARCHIVE");
    expect(text).toContain("Last 6 hours");
    expect(text).toContain(HOURS_5_AGO);
    expect(text).toContain(HOURS_1_AGO);
    expect(text).not.toContain(PROFILE_ID);
    expect(text).not.toContain(CONVERSATION_ID);
  });

  it("creates a versioned JSON backup without local profile identifiers", () => {
    const selected = selectChatArchiveMessages(messages, "24h", NOW);
    const payload = JSON.parse(
      formatChatArchiveJson(selected, "24h", NOW),
    );

    expect(payload.schema).toBe("orbis-chat-archive/v1");
    expect(payload.range).toBe("24h");
    expect(payload.messages).toHaveLength(3);
    expect(JSON.stringify(payload)).not.toContain(PROFILE_ID);
    expect(JSON.stringify(payload)).not.toContain(CONVERSATION_ID);
  });

  it("creates deterministic safe archive filenames", () => {
    expect(chatArchiveFileName("48h", "json", NOW)).toBe(
      "orbis-chat-48h-2026-09-29T16-00-00-000Z.json",
    );
  });
});
