import React from "react";
import { Bot } from "lucide-react";
import { useLongPress } from "../hooks/useLongPress";
import type { ChatWebEvidence } from "../storage/chatStorage.types";

export type ChatRole = "user" | "assistant";

export interface ChatMessageBubbleData {
  id: number;
  role: ChatRole;
  content: string;
  providerName?: string;
  evidence?: ChatWebEvidence;
}

interface ChatMessageBubbleProps {
  message: ChatMessageBubbleData;
  onActivate: (
    message: ChatMessageBubbleData,
    position: { x: number; y: number },
  ) => void;
  isMenuOpen: boolean;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  message,
  onActivate,
  isMenuOpen,
}) => {
  const longPress = useLongPress({
    disabled: isMenuOpen,
    onLongPress: (event) => {
      onActivate(message, { x: event.clientX, y: event.clientY });
    },
  });

  const userMessage = message.role === "user";

  return (
    <div
      className={`mx-auto flex w-full max-w-4xl gap-3 ${userMessage ? "justify-end" : ""}`}
    >
      {!userMessage && (
        <div className="mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-emerald-50 shadow-sm">
          <Bot className="h-5 w-5 text-emerald-600" />
        </div>
      )}
      <div
        className={`flex max-w-[85%] flex-col gap-1 pt-1 ${userMessage ? "items-end" : ""}`}
      >
        <span className="px-1 text-[12px] font-bold tracking-wide text-slate-500">
          {userMessage ? "You" : message.providerName || "ORBIS Core"}
        </span>
        <div
          {...longPress}
          data-testid={`chat-message-${message.id}`}
          aria-label={`${userMessage ? "Your" : "ORBIS"} message. Long-press or right-click for copy and share options.`}
          className={`select-text whitespace-pre-wrap break-words px-4 py-3 text-[15px] leading-[1.7] tracking-[0.2px] shadow-sm [overflow-wrap:anywhere] touch-manipulation ${
            userMessage
              ? "rounded-[20px] rounded-tr-[4px] border border-emerald-100 bg-emerald-100/90 font-medium text-slate-800"
              : "rounded-[20px] rounded-tl-[4px] border border-orange-100/80 bg-white/90 font-normal text-slate-800"
          }`}
        >
          {message.content}
        </div>
        {!userMessage && message.evidence?.sources.length ? (
          <section
            aria-label="Verified web sources"
            className="w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-slate-600"
          >
            <p className="font-semibold text-sky-800">
              Web sources · {message.evidence.sources.length}
            </p>
            <ul className="mt-1 space-y-1">
              {message.evidence.sources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="break-all text-sky-700 underline"
                  >
                    {source.title}
                  </a>
                  {source.publishedAt ? ` · ${source.publishedAt}` : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
};
