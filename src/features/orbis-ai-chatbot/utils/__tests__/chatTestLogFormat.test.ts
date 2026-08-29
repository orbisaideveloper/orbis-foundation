import { describe, expect, it } from "vitest";
import type { ResolvedChatTestLogEntry } from "../../storage/chatStorage.types";
import {
  formatTestLogEntries,
  formatTestLogEntry,
  testLogDayKey,
} from "../chatTestLogFormat";

const PROFILE_ID = "admin-1";
const CONVERSATION_ID = "admin-1:default-chat-v2";
const STARTED_AT = 1_700_000_000_000;
const WEB_PROVIDER_NAME = "ORBIS Brain (Web)";
const WEATHER_REQUEST = "আজকের weather বলো";

const entry: ResolvedChatTestLogEntry = {
  id: "entry-1",
  profileId: PROFILE_ID,
  conversationId: CONVERSATION_ID,
  userMessageId: 10,
  assistantMessageId: 11,
  startedAt: STARTED_AT,
  completedAt: 1_700_000_001_250,
  durationMs: 1_250,
  providerName: WEB_PROVIDER_NAME,
  providerType: "WEB_SEARCH",
  route: "web-search",
  brainDecision: "live-web-search",
  brainDecisionIntent: "live-information",
  brainDecisionConfidence: "high",
  brainDecisionReason: "time-sensitive-request",
  brainEvidenceRequired: true,
  routingDurationMs: 4,
  webSourceCount: 2,
  webEvidenceStatus: "verified",
  webLocationMatched: true,
  webNumericFactsSupported: true,
  delivery: "fresh",
  outcome: "success",
  clarificationState: null,
  errorCategory: null,
  userMessage: {
    id: 10,
    profileId: PROFILE_ID,
    conversationId: CONVERSATION_ID,
    role: "user",
    content: WEATHER_REQUEST,
    createdAt: STARTED_AT,
  },
  assistantMessage: {
    id: 11,
    profileId: PROFILE_ID,
    conversationId: CONVERSATION_ID,
    role: "assistant",
    content: "কলকাতার weather result",
    createdAt: 1_700_000_001_250,
    providerName: WEB_PROVIDER_NAME,
  },
};

describe("chat Test Log formatting", () => {
  it("keeps the complete local question, answer and real routing facts together", () => {
    const formatted = formatTestLogEntry(entry);
    expect(formatted).toContain(WEATHER_REQUEST);
    expect(formatted).toContain("কলকাতার weather result");
    expect(formatted).toContain(`${WEB_PROVIDER_NAME} · WEB_SEARCH`);
    expect(formatted).toContain("Route: web-search");
    expect(formatted).toContain("Brain decision: live-web-search");
    expect(formatted).toContain("Decision intent: live-information");
    expect(formatted).toContain("Decision confidence: high");
    expect(formatted).toContain("Evidence required: yes");
    expect(formatted).toContain("Verified web sources: 2");
    expect(formatted).toContain("Evidence verification: verified");
    expect(formatted).toContain("Location matched: yes");
    expect(formatted).toContain("Numeric facts supported: yes");
    expect(formatted).toContain("1.25 sec");
  });

  it("orders a copied day chronologically instead of newest-first", () => {
    const later = {
      ...entry,
      id: "entry-2",
      completedAt: entry.completedAt + 1,
      userMessage: { ...entry.userMessage!, content: "দ্বিতীয় প্রশ্ন" },
    };
    const payload = formatTestLogEntries([later, entry]);
    expect(payload.indexOf(WEATHER_REQUEST)).toBeLessThan(
      payload.indexOf("দ্বিতীয় প্রশ্ন"),
    );
  });

  it("creates a stable local day selector key", () => {
    expect(testLogDayKey(entry.completedAt)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
