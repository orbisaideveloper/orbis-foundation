export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: number;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  providerName?: string;
  model?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}
