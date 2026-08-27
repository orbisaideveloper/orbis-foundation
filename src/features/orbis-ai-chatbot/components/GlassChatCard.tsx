import React, { useState } from "react";
import { Mic, Send, BrainCircuit, Sparkles } from "lucide-react";
import { FullscreenChatView } from "./FullscreenChatView";

export const GlassChatCard: React.FC = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <>
      <div
        className="relative overflow-hidden rounded-2xl border border-gray-200/50 bg-gradient-to-br from-orange-50/40 via-white/40 to-green-50/40 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:shadow-orange-500/10 cursor-pointer group dark:border-white/10 dark:from-orange-950/20 dark:via-black/40 dark:to-green-950/20"
      >
        <button
          type="button"
          aria-label="Open ORBIS chat"
          onClick={() => setIsChatOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsChatOpen(true);
            }
          }}
          className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        />
        <div className="pointer-events-none">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between border-b border-gray-200/50 pb-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-gradient-to-br from-orange-100 to-amber-100 p-2 dark:from-orange-500/20 dark:to-amber-500/20">
              <BrainCircuit className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="flex items-center gap-2 text-xl font-semibold tracking-wide text-gray-800 dark:text-white">
              ORBIS Neural Cockpit{" "}
              <Sparkles className="h-4 w-4 text-emerald-500" />
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="relative inline-flex h-3 w-3 rounded-full bg-slate-400"></span>
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Check availability in chat
            </span>
          </div>
        </div>

          {/* AI Last Response Area */}
          <div className="mb-6 flex min-h-[80px] items-center rounded-xl bg-white/50 p-4 text-sm text-gray-600 shadow-sm backdrop-blur-sm dark:bg-black/30 dark:text-gray-300">
            <p className="italic">
              "সিস্টেম অপ্টিমাইজড আছে। আমি আপনার পরবর্তী নির্দেশের জন্য
              প্রস্তুত..."
            </p>
          </div>

          {/* Input Area (Visual Only for Dashboard) */}
          <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              readOnly
              placeholder="ORBIS-কে নির্দেশ দিন..."
              className="w-full cursor-pointer rounded-full border border-gray-300/50 bg-white/60 py-3 pl-5 pr-12 text-sm text-gray-800 outline-none backdrop-blur-sm transition-all group-hover:border-emerald-400/50 dark:border-white/10 dark:bg-black/50 dark:text-white dark:placeholder-gray-400"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-400 transition-colors hover:text-orange-500"
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 hover:bg-emerald-500 active:scale-95"
          >
            <Send className="h-4 w-4 ml-0.5" />
          </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Chat Modal */}
      {isChatOpen && (
        <FullscreenChatView onClose={() => setIsChatOpen(false)} />
      )}
    </>
  );
};
