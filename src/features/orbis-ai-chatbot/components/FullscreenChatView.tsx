import React, { useRef, useState, useEffect } from "react";
import {
  ArrowLeft,
  Mic,
  Send,
  Bot,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { chatStorage } from "../storage/ChatStorageManager";

interface FullscreenChatViewProps {
  onClose: () => void;
}

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: number;
  role: ChatRole;
  content: string;
  providerName?: string;
}

interface ChatApiMessage {
  role: ChatRole;
  content: string;
}

interface ChatApiResponse {
  message?: ChatApiMessage;
  provider?: {
    name?: string;
    type?: string;
    model?: string;
  };
  error?: string;
}

interface SpeechRecognitionResultEventLike {
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface SpeechRecognitionWindow {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

const INITIAL_MESSAGE: ChatMessage = {
  id: 1,
  role: "assistant",
  content: "নমস্কার দাদা! ORBIS Brain প্রস্তুত। আপনি কী জানতে বা করতে চান?",
  providerName: "ORBIS",
};

const CONVERSATION_ID = "default-chat-v1";

export const FullscreenChatView: React.FC<FullscreenChatViewProps> = ({
  onClose,
}) => {
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isDbReady, setIsDbReady] = useState(false);

  // 🚀 অটো-স্ক্রল করার জন্য নতুন রেফারেন্স
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceTranscriptRef = useRef("");
  const initialized = useRef(false);

  // 🚀 যখনই মেসেজ আসবে, স্ক্রিন অটোমেটিক নিচে চলে যাবে
  const scrollToBottom = () => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const initChat = async () => {
      try {
        await chatStorage.init();
        try {
          await chatStorage.createConversation(
            CONVERSATION_ID,
            "My Orbis Chat",
          );
        } catch (e) {
          // Ignore
        }

        const history =
          await chatStorage.getMessagesByConversation(CONVERSATION_ID);

        if (history && history.length > 0) {
          setMessages(
            history.map((msg) => ({
              id: msg.id,
              role: msg.role as ChatRole,
              content: msg.content,
              providerName: msg.providerName,
            })),
          );
        } else {
          setMessages([INITIAL_MESSAGE]);
          await chatStorage.saveMessage({
            id: INITIAL_MESSAGE.id,
            conversationId: CONVERSATION_ID,
            role: INITIAL_MESSAGE.role,
            content: INITIAL_MESSAGE.content,
            createdAt: Date.now(),
            providerName: INITIAL_MESSAGE.providerName,
          });
        }
        setIsDbReady(true);
      } catch (error) {
        console.error("Local storage DB load failed:", error);
        setMessages([INITIAL_MESSAGE]);
        setIsDbReady(true);
      }
    };

    initChat();
  }, []);

  const handleClearHistory = () => {
    if (
      window.confirm(
        "সতর্কতা: আপনি কি আপনার ডিভাইসে সেভ থাকা সম্পূর্ণ চ্যাট মুছে ফেলতে চান?",
      )
    ) {
      try {
        indexedDB.deleteDatabase("OrbisChatDB");
        window.location.reload();
      } catch (e) {
        console.error("Failed to clear DB", e);
      }
    }
  };

  const sendMessage = async (messageOverride?: string) => {
    const message = (messageOverride ?? inputText).trim();
    if (!message || isSending || !isDbReady) return;

    if (
      message.includes("ডিলিট") ||
      message.toLowerCase().includes("clear") ||
      message.toLowerCase().includes("delete")
    ) {
      const warningMsg: ChatMessage = {
        id: Date.now(),
        role: "assistant",
        content:
          "আমি আপনার নির্দেশ বুঝতে পেরেছি। তবে ভুলবশত সব চ্যাট একসাথে মুছে যাওয়া এড়াতে আমি সরাসরি ডিলিট করছি না। নির্দিষ্ট তারিখ অনুযায়ী (Date-wise) বা অপ্রয়োজনীয় চ্যাট বেছে মোছার ফিচারটি ডেভেলপাররা যুক্ত করছেন। সম্পূর্ণ হিস্ট্রি মুছতে চাইলে উপরের লাল 'Trash' আইকনটি ব্যবহার করতে পারেন।",
        providerName: "System",
      };
      setMessages((current) => [
        ...current,
        { id: Date.now() - 1, role: "user", content: message },
        warningMsg,
      ]);
      setInputText("");
      return;
    }

    const userMsgId = Date.now();
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: message,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputText("");
    setIsSending(true);

    try {
      await chatStorage.saveMessage({
        id: userMsgId,
        conversationId: CONVERSATION_ID,
        role: "user",
        content: message,
        createdAt: Date.now(),
      });
    } catch (e) {
      console.error("Failed to save user msg", e);
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

      const data = (await response.json()) as ChatApiResponse;

      if (!response.ok) {
        throw new Error(data.error || `API error: ${response.status}`);
      }

      const assistantContent = data.message?.content?.trim();
      if (!assistantContent) throw new Error("AI কোনো response দেয়নি।");

      const providerName = data.provider?.name || "ORBIS";

      const astMsgId = Date.now() + 1;
      const astMessage: ChatMessage = {
        id: astMsgId,
        role: "assistant",
        content: assistantContent,
        providerName: providerName,
      };

      setMessages((current) => [...current, astMessage]);

      try {
        await chatStorage.saveMessage({
          id: astMsgId,
          conversationId: CONVERSATION_ID,
          role: "assistant",
          content: assistantContent,
          createdAt: Date.now(),
          providerName: providerName,
        });
      } catch (e) {
        console.error("Failed to save assistant msg", e);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorMsgId = Date.now() + 1;
      const errorMsg: ChatMessage = {
        id: errorMsgId,
        role: "assistant",
        content: `দুঃখিত, সংযোগ করা যাচ্ছে না।\n\n${errorMessage}`,
        providerName: "System",
      };
      setMessages((current) => [...current, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const toggleVoiceInput = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const speechWindow = window as Window & SpeechRecognitionWindow;
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now(),
          role: "assistant",
          content: "Voice Input support নেই।",
          providerName: "System",
        },
      ]);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "bn-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    voiceTranscriptRef.current = "";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      voiceTranscriptRef.current = transcript.trim();
      setInputText(transcript);
    };

    recognition.onend = () => {
      const transcript = voiceTranscriptRef.current.trim();
      setIsListening(false);
      recognitionRef.current = null;
      voiceTranscriptRef.current = "";
      if (transcript) void sendMessage(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
      setMessages((current) => [
        ...current,
        {
          id: Date.now(),
          role: "assistant",
          content: "Voice Input চালু করা যায়নি।",
          providerName: "System",
        },
      ]);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-br from-orange-50/90 via-white/95 to-green-50/90 backdrop-blur-xl dark:from-orange-950/40 dark:via-gray-950/95 dark:to-emerald-950/40 font-sans">
      <header className="flex items-center justify-between border-b border-gray-200/50 bg-white/30 px-6 py-4 backdrop-blur-md dark:border-white/10 dark:bg-black/30 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
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
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100/50 px-2 py-0.5 rounded-full dark:text-emerald-400">
                Online
              </span>
            </h2>
          </div>
        </div>

        <button
          onClick={handleClearHistory}
          title="চ্যাট হিস্ট্রি মুছুন"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-500 transition-colors hover:bg-red-100 hover:text-red-600 dark:bg-red-950/50 dark:hover:bg-red-900/80 shadow-sm"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-8 scroll-smooth">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mx-auto flex w-full max-w-4xl gap-4 ${
              message.role === "user" ? "justify-end" : ""
            }`}
          >
            {message.role === "assistant" && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-orange-200 shadow-sm border border-orange-200/50 mt-4 dark:from-orange-900/50 dark:to-orange-800/50">
                <Bot className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
            )}
            <div
              className={`flex max-w-[85%] flex-col gap-1.5 pt-1 ${
                message.role === "user" ? "items-end" : ""
              }`}
            >
              <span className="text-[12px] font-bold text-gray-500 tracking-wide dark:text-gray-400 px-1">
                {message.role === "user"
                  ? "You"
                  : message.providerName || "ORBIS Core"}
              </span>
              <div
                className={`whitespace-pre-wrap px-5 py-3.5 shadow-sm backdrop-blur-sm text-[15.5px] leading-[1.75] tracking-[0.2px] ${
                  message.role === "user"
                    ? "rounded-[20px] rounded-tr-[4px] border border-emerald-200/60 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium dark:border-emerald-800/30 dark:from-emerald-800 dark:to-emerald-900"
                    : "rounded-[20px] rounded-tl-[4px] border border-gray-200/60 bg-white/90 text-gray-800 font-normal dark:border-gray-700/50 dark:bg-gray-800/90 dark:text-gray-200"
                }`}
              >
                {message.content}
              </div>
            </div>
          </div>
        ))}
        {isSending && (
          <div className="mx-auto flex w-full max-w-4xl gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 border border-orange-200/50 mt-4 dark:bg-orange-900/40">
              <Bot className="h-5 w-5 text-orange-600" />
            </div>
            <div className="mt-5 rounded-[20px] rounded-tl-[4px] bg-white/80 px-5 py-3.5 text-[14px] font-medium text-gray-500 shadow-sm border border-gray-200/50 dark:bg-gray-800/80 animate-pulse">
              ORBIS ভাবছে...
            </div>
          </div>
        )}
        {/* 🚀 অটো-স্ক্রল নোঙর */}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      <div className="border-t border-gray-200/50 bg-white/60 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-black/60 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] z-10">
        <div className="mx-auto flex max-w-4xl items-end gap-3">
          <div className="relative flex-1">
            <textarea
              rows={1}
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="ORBIS-কে নির্দেশ দিন..."
              disabled={isSending || !isDbReady}
              className="max-h-32 min-h-[56px] w-full resize-none rounded-[24px] border border-gray-300/60 bg-white/80 py-4 pl-6 pr-14 text-[15px] font-medium text-gray-800 shadow-inner outline-none backdrop-blur-md transition-all focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white disabled:opacity-60 dark:border-white/10 dark:bg-black/50 dark:text-white dark:placeholder-gray-400"
            />
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={isSending || !isDbReady}
              aria-label={isListening ? "Stop voice input" : "Voice input"}
              className={`absolute bottom-2.5 right-2.5 rounded-full p-2.5 transition-all duration-300 ${
                isListening
                  ? "bg-red-100 text-red-600 animate-pulse dark:bg-red-900/40 dark:text-red-400"
                  : "text-gray-400 hover:bg-gray-100 hover:text-emerald-500 dark:hover:bg-gray-800 dark:hover:text-emerald-400"
              }`}
            >
              {isListening ? (
                <Square className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={!inputText.trim() || isSending || !isDbReady}
            aria-label="Send message"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 hover:from-emerald-400 hover:to-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            <Send className="ml-1 h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
