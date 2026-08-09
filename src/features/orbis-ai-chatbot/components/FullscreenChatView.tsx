import React, { useRef, useState } from "react";
import { ArrowLeft, Mic, Send, Bot, Sparkles, Square } from "lucide-react";

interface FullscreenChatViewProps {
  onClose: () => void;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

interface SpeechRecognitionResultEventLike {
  results: {
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

export const FullscreenChatView: React.FC<FullscreenChatViewProps> = ({
  onClose,
}) => {
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      content: "নমস্কার দাদা! ORBIS Brain প্রস্তুত। আপনি কী জানতে বা করতে চান?",
    },
  ]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const sendMessage = async () => {
    const message = inputText.trim();

    if (!message || isSending) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: "user",
        content: message,
      },
    ]);

    setInputText("");
    setIsSending(true);

    try {
      const response = await fetch("/api/orbis-command", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command: message,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      const result =
        typeof data?.result === "string"
          ? data.result
          : typeof data?.response === "string"
            ? data.response
            : "ORBIS কোনো response ফেরত দেয়নি।";

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: result,
        },
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: `দুঃখিত, ORBIS AI-এর সঙ্গে সংযোগ করা যাচ্ছে না।\n\n${errorMessage}`,
        },
      ]);
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
          content:
            "এই browser-এ Voice Input support নেই। Chrome/Edge-এর supported browser ব্যবহার করুন।",
        },
      ]);
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "bn-IN";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let transcript = "";

      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }

      setInputText(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;

      setMessages((current) => [
        ...current,
        {
          id: Date.now(),
          role: "assistant",
          content:
            "Voice Input চালু করা যায়নি। Microphone permission এবং browser settings পরীক্ষা করুন।",
        },
      ]);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-br from-orange-50/90 via-white/95 to-green-50/90 backdrop-blur-xl dark:from-orange-950/40 dark:via-gray-950/95 dark:to-emerald-950/40">
      <header className="flex items-center justify-between border-b border-gray-200/50 bg-white/30 px-6 py-4 backdrop-blur-md dark:border-white/10 dark:bg-black/30">
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
              <span className="text-sm font-normal text-emerald-600 dark:text-emerald-400">
                Online
              </span>
            </h2>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-8">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mx-auto flex w-full max-w-4xl gap-4 ${
              message.role === "user" ? "justify-end" : ""
            }`}
          >
            {message.role === "assistant" && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-orange-200 shadow-sm dark:from-orange-900/50 dark:to-orange-800/50">
                <Bot className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
            )}

            <div
              className={`flex max-w-[85%] flex-col gap-1 pt-1 ${
                message.role === "user" ? "items-end" : ""
              }`}
            >
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {message.role === "user" ? "You" : "ORBIS Core"}
              </span>

              <div
                className={`whitespace-pre-wrap rounded-2xl border p-4 shadow-sm backdrop-blur-sm ${
                  message.role === "user"
                    ? "rounded-tr-none border-emerald-100/50 bg-emerald-500/10 text-gray-800 dark:border-emerald-900/30 dark:bg-emerald-900/30 dark:text-gray-200"
                    : "rounded-tl-none border-orange-100/50 bg-white/60 text-gray-700 dark:border-orange-900/30 dark:bg-gray-900/60 dark:text-gray-300"
                }`}
              >
                {message.content}
              </div>
            </div>
          </div>
        ))}

        {isSending && (
          <div className="mx-auto flex w-full max-w-4xl gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
              <Bot className="h-5 w-5 text-orange-600" />
            </div>
            <div className="rounded-2xl rounded-tl-none bg-white/60 p-4 text-sm text-gray-500 shadow-sm dark:bg-gray-900/60">
              ORBIS ভাবছে...
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200/50 bg-white/40 p-4 backdrop-blur-md dark:border-white/10 dark:bg-black/40">
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
              disabled={isSending}
              className="max-h-32 min-h-[56px] w-full resize-none rounded-2xl border border-gray-300/50 bg-white/70 py-4 pl-6 pr-14 text-gray-800 shadow-inner outline-none backdrop-blur-md transition-all focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60 dark:border-white/10 dark:bg-black/50 dark:text-white dark:placeholder-gray-400"
            />

            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={isSending}
              aria-label={isListening ? "Stop voice input" : "Voice input"}
              className={`absolute bottom-3 right-3 rounded-full p-2 transition-colors ${
                isListening
                  ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
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
            disabled={!inputText.trim() || isSending}
            aria-label="Send message"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 hover:from-emerald-400 hover:to-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            <Send className="ml-1 h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
