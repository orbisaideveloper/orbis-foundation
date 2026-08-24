export type ChatRole = "user" | "assistant";
export type ChatConsent = "accepted" | "declined" | null;
export type LearningConsent = "accepted" | "declined" | null;

export interface ChatMessage {
  id: number;
  profileId: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  providerName?: string;
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
    routingDurationMs?: number;
    clarification?: {
      state: string;
      pending: PendingClarification | null;
    };
  };
  createdAt: number;
  expiresAt: number;
  freshnessClass: "price" | "weather" | "news" | "stable";
}

export interface ChatStorageUsage {
  budgetBytes: number;
  logicalBytes: number;
  deviceUsageBytes: number | null;
  deviceQuotaBytes: number | null;
  warning: boolean;
}
