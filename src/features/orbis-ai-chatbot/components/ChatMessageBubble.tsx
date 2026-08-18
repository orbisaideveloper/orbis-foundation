import React from "react";
import { Bot } from "lucide-react";
import { useLongPress } from "../hooks/useLongPress";

export type ChatRole = "user" | "assistant";

export interface ChatMessageBubbleData {
  id: number;
  role: ChatRole;
  content: string;
  providerName?: string;
}

interface ChatMessageBubbleProps {
  message: ChatMessageBubbleData;
  /** Called with the message and the screen position to open the action menu. */
  onActivate: (
    message: ChatMessageBubbleData,
    position: { x: number; y: number },
  ) => void;
  /** True while the action menu for this specific message is open. */
  isMenuOpen: boolean;
}

/**
 * Renders a single chat bubble. Visual output is unchanged from the
 * original inline markup in FullscreenChatView; the only addition is the
 * long-press / right-click gesture that opens the contextual action menu.
 */
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

  return (
    <div
      className={`mx-auto flex w-full max-w-4xl gap-3 ${message.role === "user" ? "justify-end" : ""}`}
    >
      {message.role === "assistant" && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-orange-200 shadow-sm border border-orange-200/50 mt-5 dark:from-orange-900/50 dark:to-orange-800/50">
          <Bot className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </div>
      )}
      <div
        className={`flex max-w-[85%] flex-col gap-1 pt-1 ${message.role === "user" ? "items-end" : ""}`}
      >
        <span className="text-[12px] font-bold text-gray-500 tracking-wide dark:text-gray-400 px-1">
          {message.role === "user"
            ? "You"
            : message.providerName || "ORBIS Core"}
        </span>
        <div
          {...longPress}
          data-testid={`chat-message-${message.id}`}
          aria-label={`${message.role === "user" ? "Your" : "ORBIS"} message. Long-press or right-click for copy and share options.`}
          className={`select-text whitespace-pre-wrap break-words [overflow-wrap:anywhere] px-4 py-3 shadow-sm text-[15px] leading-[1.7] tracking-[0.2px] touch-manipulation ${message.role === "user" ? "rounded-[20px] rounded-tr-[4px] border border-emerald-200/60 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium dark:border-emerald-800/30 dark:from-emerald-800 dark:to-emerald-900" : "rounded-[20px] rounded-tl-[4px] border border-gray-200/60 bg-white text-gray-800 font-normal dark:border-gray-700/50 dark:bg-gray-800/90 dark:text-gray-200"}`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
};
