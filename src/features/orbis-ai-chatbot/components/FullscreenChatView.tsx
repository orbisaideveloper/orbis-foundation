import React, { useRef, useState, useEffect } from "react";
import {
  ArrowLeft,
  Mic,
  Send,
  Bot,
  Sparkles,
  Square,
  Trash2,
  Plus,
  MoreVertical,
} from "lucide-react";
import { chatStorage } from "../storage/ChatStorageManager";
import {
  AttachmentPreview,
  PendingAttachment,
} from "./attachments/AttachmentPreview";

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
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceTranscriptRef = useRef("");
  const initialized = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending, attachments]);

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
        } catch (e) {}
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
            ...INITIAL_MESSAGE,
            conversationId: CONVERSATION_ID,
            createdAt: Date.now(),
          });
        }
        setIsDbReady(true);
      } catch (error) {
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
      } catch (e) {}
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newAttachments: PendingAttachment[] = Array.from(files).map(
      (file) => {
        const id = Math.random().toString(36).substring(7);
        let type: PendingAttachment["type"] = "other";
        let previewUrl: string | undefined;
        if (file.type.startsWith("image/")) {
          type = "image";
          previewUrl = URL.createObjectURL(file);
        } else if (
          file.type.includes("pdf") ||
          file.type.includes("word") ||
          file.type.includes("text")
        ) {
          type = "document";
        } else if (
          file.type.includes("excel") ||
          file.type.includes("spreadsheet") ||
          file.type.includes("csv")
        ) {
          type = "spreadsheet";
        }
        return { id, file, type, previewUrl };
      },
    );
    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => {
      const filtered = prev.filter((att) => att.id !== id);
      const removed = prev.find((att) => att.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return filtered;
    });
  };

  const sendMessage = async (messageOverride?: string) => {
    const message = (messageOverride ?? inputText).trim();
    if ((!message && attachments.length === 0) || isSending || !isDbReady)
      return;

    const userMsgId = Date.now();
    let finalMessageContent = message;
    if (attachments.length > 0) {
      const fileNames = attachments.map((a) => a.file.name).join(", ");
      finalMessageContent += `\n[অ্যাটাচমেন্ট: ${fileNames}]`;
    }

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: finalMessageContent.trim(),
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputText("");
    attachments.forEach((att) => {
      if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
    });
    setAttachments([]);
    setIsSending(true);

    try {
      await chatStorage.saveMessage({
        id: userMsgId,
        conversationId: CONVERSATION_ID,
        role: "user",
        content: finalMessageContent.trim(),
        createdAt: Date.now(),
      });
    } catch (e) {}

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
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || `API error: ${response.status}`);
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
      } catch (e) {}
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: `দুঃখিত, সংযোগ করা যাচ্ছে না।`,
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
    const speechWindow = window as any;
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
    recognition.onresult = (event: any) => {
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
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#F8FAFC] font-sans dark:bg-[#0B1120]">
      <header className="flex items-center justify-between border-b border-gray-200/60 bg-white/80 px-6 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-black/40 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 shadow-md">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold tracking-wide text-gray-800 dark:text-white leading-tight">
                ORBIS Brain
              </h2>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1.5 dark:text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Online
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearHistory}
            title="Clear Chat"
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/50"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <button
            title="More Options"
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-8 scroll-smooth bg-[url('/noise.png')] bg-opacity-5">
        {messages.map((message) => (
          <div
            key={message.id}
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
                className={`whitespace-pre-wrap px-4 py-3 shadow-sm text-[15px] leading-[1.7] tracking-[0.2px] ${message.role === "user" ? "rounded-[20px] rounded-tr-[4px] border border-emerald-200/60 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-medium dark:border-emerald-800/30 dark:from-emerald-800 dark:to-emerald-900" : "rounded-[20px] rounded-tl-[4px] border border-gray-200/60 bg-white text-gray-800 font-normal dark:border-gray-700/50 dark:bg-gray-800/90 dark:text-gray-200"}`}
              >
                {message.content}
              </div>
            </div>
          </div>
        ))}

        {/* 🚀 The NEW Unique "Quantum Pulse" Animation (No Text) */}
        {isSending && (
          <div className="mx-auto flex w-full max-w-4xl gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-50 to-orange-50 border border-emerald-100/50 mt-2 dark:from-emerald-900/20 dark:to-orange-900/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
              <Bot className="h-5 w-5 text-emerald-500 animate-pulse" />
            </div>
            <div className="mt-2 rounded-[20px] rounded-tl-[4px] bg-white/90 px-4 py-2.5 shadow-[0_4px_20px_-4px_rgba(16,185,129,0.15)] border border-emerald-100/50 dark:bg-gray-800/90 dark:border-emerald-900/30 flex items-center gap-3.5 w-fit">
              <div className="relative flex h-6 w-6 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite] rounded-full bg-emerald-400 opacity-40"></span>
                <span className="absolute inline-flex h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent border-l-transparent"></span>
                <Sparkles className="relative h-2.5 w-2.5 text-orange-500 animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-1.5 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-500 animate-[bounce_1s_infinite_-0.3s]"></span>
                <span className="h-3.5 w-1.5 rounded-full bg-gradient-to-b from-orange-400 to-amber-500 animate-[bounce_1s_infinite_-0.15s]"></span>
                <span className="h-2 w-1.5 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-500 animate-[bounce_1s_infinite]"></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      <div className="bg-transparent p-4 pb-6 z-10 w-full relative">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col rounded-[28px] border border-gray-300/60 bg-white shadow-lg p-1.5 transition-all focus-within:border-emerald-500/50 focus-within:ring-4 focus-within:ring-emerald-500/10 dark:border-gray-700 dark:bg-[#1E293B]">
            {attachments.length > 0 && (
              <div className="pt-2">
                <AttachmentPreview
                  attachments={attachments}
                  onRemove={handleRemoveAttachment}
                />
              </div>
            )}
            <div className="flex items-end gap-2 w-full">
              {/* 🚀 Changed accept attribute to any file to force generic File Picker on Android */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                multiple
                accept="*/*"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-emerald-600 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <Plus className="h-6 w-6" />
              </button>
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
                className="max-h-32 min-h-[44px] w-full flex-1 resize-none bg-transparent py-3 px-1 text-[15.5px] text-gray-800 outline-none disabled:opacity-60 dark:text-white dark:placeholder-gray-400"
              />
              <div className="flex shrink-0 items-center gap-1 pb-0.5 pr-0.5">
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  disabled={isSending || !isDbReady}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 ${isListening ? "bg-red-100 text-red-600 animate-pulse dark:bg-red-900/40 dark:text-red-400" : "text-gray-400 hover:bg-gray-100 hover:text-emerald-500 dark:hover:bg-gray-800 dark:hover:text-emerald-400"}`}
                >
                  {isListening ? (
                    <Square className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={
                    (!inputText.trim() && attachments.length === 0) ||
                    isSending ||
                    !isDbReady
                  }
                  aria-label="Send message"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md transition-all hover:scale-105 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 dark:bg-emerald-600"
                >
                  <Send className="ml-0.5 h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="text-center mt-2">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium tracking-wide">
              ORBIS can make mistakes. Consider verifying important information.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
