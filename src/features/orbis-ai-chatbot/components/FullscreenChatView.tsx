import React, { useState } from "react";
import { ArrowLeft, Mic, Send, Bot, Sparkles } from "lucide-react";

interface FullscreenChatViewProps {
  onClose: () => void;
}

export const FullscreenChatView: React.FC<FullscreenChatViewProps> = ({
  onClose,
}) => {
  const [inputText, setInputText] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-br from-orange-50/90 via-white/95 to-green-50/90 backdrop-blur-xl dark:from-orange-950/40 dark:via-gray-950/95 dark:to-emerald-950/40 animate-in fade-in zoom-in-95 duration-300">
      {/* 🇮🇳 Header Area (Glass) */}
      <header className="flex items-center justify-between border-b border-gray-200/50 bg-white/30 px-6 py-4 backdrop-blur-md dark:border-white/10 dark:bg-black/30">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-200/50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-orange-400 to-amber-500 shadow-lg">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-xl font-bold tracking-wide text-gray-800 dark:text-white">
              ORBIS Brain{" "}
              <span className="text-sm font-normal text-emerald-600 dark:text-emerald-400">
                Online
              </span>
            </h2>
          </div>
        </div>
      </header>

      {/* 💬 Chat History Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        {/* AI Greeting Message */}
        <div className="flex w-full max-w-4xl gap-4 mx-auto">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-orange-200 shadow-sm dark:from-orange-900/50 dark:to-orange-800/50">
            <Bot className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="flex flex-col gap-1 pt-1">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              ORBIS Core
            </span>
            <div className="rounded-2xl rounded-tl-none border border-orange-100/50 bg-white/60 p-4 text-gray-700 shadow-sm backdrop-blur-sm dark:border-orange-900/30 dark:bg-gray-900/60 dark:text-gray-300">
              নমস্কার দাদা! সিস্টেম ডায়াগনস্টিক এবং টার্মাক্স সার্ভার (Ollama)
              সম্পূর্ণ প্রস্তুত। আমি আপনাকে কীভাবে সাহায্য করতে পারি?
            </div>
          </div>
        </div>
      </div>

      {/* ⌨️ Input Area (Bottom Fixed) */}
      <div className="border-t border-gray-200/50 bg-white/40 p-4 backdrop-blur-md dark:border-white/10 dark:bg-black/40">
        <div className="mx-auto flex max-w-4xl items-end gap-3">
          <div className="relative flex-1">
            <textarea
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="ORBIS-কে নির্দেশ দিন..."
              className="max-h-32 min-h-[56px] w-full resize-none rounded-2xl border border-gray-300/50 bg-white/70 py-4 pl-6 pr-14 text-gray-800 shadow-inner outline-none backdrop-blur-md transition-all focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20 dark:border-white/10 dark:bg-black/50 dark:text-white dark:placeholder-gray-400"
            />
            <button
              type="button"
              className="absolute right-3 bottom-3 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-emerald-500 dark:hover:bg-gray-800 dark:hover:text-emerald-400"
            >
              <Mic className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 hover:from-emerald-400 hover:to-emerald-500 active:scale-95"
          >
            <Send className="h-5 w-5 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
};
