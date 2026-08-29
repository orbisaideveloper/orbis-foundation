export type ChatRole = "user" | "assistant";
export type ChatConsent = "accepted" | "declined" | null;
export type LearningConsent = "accepted" | "declined" | null;

export interface ChatWebSource {
  title: string;
  url: string;
  publishedAt?: string;
}

/** Evidence returned by the server for a live web answer; stored only on this device. */
export interface ChatWebEvidence {
  kind: "web-search";
  retrievedAt: string;
  sources: ChatWebSource[];
}

export interface ChatMessage {
  id: number;
  profileId: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  providerName?: string;
  evidence?: ChatWebEvidence;
  model?: string;
  important?: boolean;
}

export interface Conversation {
  id: string;
  profileId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

export interface PersonalMemoryRecord {
  id: string;
  profileId: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
}

export type PendingClarificationKind = "weather-location" | "capability-input";

export interface PendingClarification {
  kind: PendingClarificationKind;
  originalRequest: string;
  createdAt: number;
  expiresAt: number;
}

export interface CachedChatResponse {
  key: string;
  profileId: string;
  normalizedQuery: string;
  response: {
    message: { role: "assistant"; content: string };
    provider: { name: string; type: string; model?: string };
    route?: string;
    brainDecision?: string | null;
    routingDurationMs?: number;
    evidence?: ChatWebEvidence | null;
    clarification?: {
      state: string;
      pending: PendingClarification | null;
    };
  };
  createdAt: number;
  expiresAt: number;
  freshnessClass: "price" | "weather" | "news" | "stable";
}

/**
 * Privacy-safe diagnostic metadata for one local chat exchange.
 *
 * The question and answer are deliberately not duplicated here. They remain
 * in the existing device-local message store and are joined by message ID
 * when the Admin opens the Brain Test Lab.
 */
export interface ChatTestLogEntry {
  id: string;
  profileId: string;
  conversationId: string;
  userMessageId: number;
  assistantMessageId: number;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  providerName: string;
  providerType: string;
  route: string | null;
  brainDecision?: string | null;
  routingDurationMs: number | null;
  webSourceCount?: number | null;
  delivery: "fresh" | "device-cache";
  outcome: "success" | "error";
  clarificationState: string | null;
  errorCategory: string | null;
}

export interface ResolvedChatTestLogEntry extends ChatTestLogEntry {
  userMessage: ChatMessage | null;
  assistantMessage: ChatMessage | null;
}

export interface ChatStorageUsage {
  budgetBytes: number;
  logicalBytes: number;
  deviceUsageBytes: number | null;
  deviceQuotaBytes: number | null;
  warning: boolean;
}
