import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Database,
  Mic,
  MoreVertical,
  Send,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { supabase } from "../../../core/supabase/client";
import { DeviceChatRequestCache } from "../services/DeviceChatRequestCache";
import { chatStorage } from "../storage/ChatStorageManager";
import type {
  ChatStorageUsage,
  PendingClarification,
} from "../storage/chatStorage.types";
import { ChatMessageBubble, ChatMessageBubbleData } from "./ChatMessageBubble";
import {
  MessageActionMenu,
  MessageActionMenuPosition,
} from "./MessageActionMenu";
import {
  copyMessageContent,
  isShareSupported,
  shareMessageContent,
} from "../utils/messageActions";

interface FullscreenChatViewProps {
  onClose: () => void;
}

type ChatMessage = ChatMessageBubbleData;
type StorageState = "loading" | "persistent" | "ephemeral" | "error";
type ProviderHealth = "UNKNOWN" | "AVAILABLE" | "UNAVAILABLE";
interface LearningCandidate {
  content: string;
  category: string;
  tags: string[];
}
interface LearnedRecord extends LearningCandidate {
  id: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const INITIAL_MESSAGE: ChatMessage = {
  id: 1,
  role: "assistant",
  content: "নমস্কার দাদা! ORBIS Brain প্রস্তুত। আপনি কী জানতে বা করতে চান?",
  providerName: "ORBIS",
};
function nextMessageId(): number {
  return Date.now() * 1_000 + Math.floor(Math.random() * 1_000);
}

function errorMessage(category: string): string {
  if (category === "authentication") {
    return "আপনার সেশন শেষ হয়েছে। আবার সাইন ইন করে চেষ্টা করুন।";
  }
  if (category === "rate_limit") {
    return "খুব দ্রুত অনেক অনুরোধ হয়েছে। একটু অপেক্ষা করে আবার চেষ্টা করুন।";
  }
  if (category === "timeout") {
    return "AI সেবা সময়মতো সাড়া দেয়নি। আবার চেষ্টা করতে পারেন।";
  }
  if (category === "invalid_request") {
    return "অনুরোধটি পাঠানো যায়নি। লেখা ছোট করে আবার চেষ্টা করুন।";
  }
  return "ORBIS সেবা এখন উপলব্ধ নয়। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
}

export const FullscreenChatView: React.FC<FullscreenChatViewProps> = ({
  onClose,
}) => {
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [storageState, setStorageState] = useState<StorageState>("loading");
  const [storageError, setStorageError] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [showStorageControls, setShowStorageControls] = useState(false);
  const [usage, setUsage] = useState<ChatStorageUsage | null>(null);
  const [pending, setPending] = useState<PendingClarification | null>(null);
  const [providerHealth, setProviderHealth] =
    useState<ProviderHealth>("UNKNOWN");
  const [learningEnabled, setLearningEnabled] = useState(false);
  const [learningCandidate, setLearningCandidate] =
    useState<LearningCandidate | null>(null);
  const [learningApprovalToken, setLearningApprovalToken] = useState("");
  const [learnedRecords, setLearnedRecords] = useState<LearnedRecord[]>([]);
  const [learningStatus, setLearningStatus] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<{
    message: ChatMessage;
    position: MessageActionMenuPosition;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceTranscriptRef = useRef("");
  const initialized = useRef(false);
  const profileIdRef = useRef("");
  const conversationIdRef = useRef("");
  const cacheRef = useRef(new DeviceChatRequestCache(chatStorage));
  const cache = cacheRef.current;

  const persistent = storageState === "persistent";
  const ready = storageState !== "loading";

  const refreshUsage = useCallback(async () => {
    if (!profileIdRef.current || storageState !== "persistent") return;
    try {
      setUsage(await chatStorage.getUsage(profileIdRef.current));
    } catch {
      // Usage reporting is optional; chat remains usable.
    }
  }, [storageState]);

  const loadPersistentChat = useCallback(async () => {
    setStorageState("loading");
    setStorageError(null);
    try {
      await chatStorage.init();
      await chatStorage.createConversation(
        conversationIdRef.current,
        profileIdRef.current,
        "My ORBIS Chat",
      );
      const history = await chatStorage.getMessagesByConversation(
        conversationIdRef.current,
        profileIdRef.current,
      );
      if (history.length > 0) {
        setMessages(
          history.map(({ id, role, content, providerName }) => ({
            id,
            role,
            content,
            providerName,
          })),
        );
      }
      setPending(
        await chatStorage.getPendingClarification(
          profileIdRef.current,
          conversationIdRef.current,
        ),
      );
      setStorageState("persistent");
    } catch {
      setStorageError(
        "ডিভাইস স্টোরেজ চালু করা যায়নি। Retry করুন বা session-only ব্যবহার করুন।",
      );
      setStorageState("error");
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void (async () => {
      let profileId: string;
      try {
        const { data } = await supabase.auth.getSession();
        profileId =
          data.session?.user.id || chatStorage.getOrCreateAnonymousProfileId();
      } catch {
        profileId = chatStorage.getOrCreateAnonymousProfileId();
      }
      profileIdRef.current = profileId;
      conversationIdRef.current = `${profileId}:default-chat-v2`;
      setLearningEnabled(
        chatStorage.getLearningConsent(profileId) === "accepted",
      );
      const consent = chatStorage.getConsent(profileId);
      if (consent === "accepted") await loadPersistentChat();
      else if (consent === "declined") setStorageState("ephemeral");
      else {
        setShowConsent(true);
        setStorageState("ephemeral");
      }
    })();
  }, [loadPersistentChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    if (storageState === "persistent") void refreshUsage();
  }, [refreshUsage, storageState]);

  const persistMessage = async (message: ChatMessage) => {
    if (!persistent) return;
    try {
      await chatStorage.saveMessage({
        ...message,
        profileId: profileIdRef.current,
        conversationId: conversationIdRef.current,
        createdAt: Date.now(),
      });
    } catch {
      setStorageError(
        "Local storage budget or device storage is unavailable. Chat continues session-only.",
      );
      setStorageState("error");
    }
  };

  const chooseConsent = async (accepted: boolean) => {
    try {
      chatStorage.setConsent(
        profileIdRef.current,
        accepted ? "accepted" : "declined",
      );
    } catch {
      setStorageError(
        "Consent এই ডিভাইসে সংরক্ষণ করা যায়নি। Session-only mode ব্যবহার করুন।",
      );
      setStorageState("error");
      setShowConsent(false);
      return;
    }
    setShowConsent(false);
    if (accepted) await loadPersistentChat();
    else setStorageState("ephemeral");
  };

  const clearChat = async () => {
    if (!window.confirm("এই প্রোফাইলের বর্তমান local chat মুছে ফেলবেন?"))
      return;
    setMessages([INITIAL_MESSAGE]);
    setPending(null);
    if (persistent) {
      await chatStorage.clearConversation(conversationIdRef.current);
      await chatStorage.createConversation(
        conversationIdRef.current,
        profileIdRef.current,
        "My ORBIS Chat",
      );
      await chatStorage.setPendingClarification(
        profileIdRef.current,
        conversationIdRef.current,
        null,
      );
      await refreshUsage();
    }
  };

  const learningRequest = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const { data, error } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (error || !token) throw new Error("AUTH_REQUIRED");
      const response = await fetch(`/api/chat/learning${path}`, {
        ...init,
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.code || "LEARNING_FAILED");
      return body;
    },
    [],
  );

  const refreshLearnedRecords = useCallback(async () => {
    if (!learningEnabled) return;
    try {
      const body = await learningRequest("/records");
      setLearnedRecords(Array.isArray(body.records) ? body.records : []);
    } catch {
      setLearningStatus("Learned records are unavailable right now.");
    }
  }, [learningEnabled, learningRequest]);

  const toggleLearning = (enabled: boolean) => {
    try {
      chatStorage.setLearningConsent(
        profileIdRef.current,
        enabled ? "accepted" : "declined",
      );
      setLearningEnabled(enabled);
      setLearningCandidate(null);
      setLearningApprovalToken("");
      setLearningStatus(
        enabled
          ? "Learning review enabled. Nothing is saved without approval."
          : "Learning is off.",
      );
      if (!enabled) setLearnedRecords([]);
    } catch {
      setLearningEnabled(false);
      setLearningStatus("Learning consent could not be stored on this device.");
    }
  };

  const previewLearningCandidate = async () => {
    const latest = [...messages].reverse().find((item) => item.role === "user");
    if (!learningEnabled || !latest) return;
    setLearningStatus("Creating a privacy-checked candidate…");
    try {
      const body = await learningRequest("/preview", {
        method: "POST",
        body: JSON.stringify({ consent: true, sourceText: latest.content }),
      });
      setLearningCandidate(body.candidate);
      setLearningApprovalToken(body.approvalToken);
      setLearningStatus(null);
    } catch {
      setLearningCandidate(null);
      setLearningApprovalToken("");
      setLearningStatus(
        "No safe generalized candidate could be established from that message.",
      );
    }
  };

  const approveLearningCandidate = async () => {
    if (!learningCandidate || !learningApprovalToken) return;
    try {
      const result = await learningRequest("/approve", {
        method: "POST",
        body: JSON.stringify({
          consent: true,
          candidate: learningCandidate,
          approvalToken: learningApprovalToken,
        }),
      });
      setLearningCandidate(null);
      setLearningApprovalToken("");
      setLearningStatus(
        result.duplicate
          ? "This generalized knowledge already exists."
          : "Generalized knowledge approved and saved.",
      );
      await refreshLearnedRecords();
    } catch {
      setLearningStatus("The candidate was not saved.");
    }
  };

  const deleteLearnedRecord = async (id: string) => {
    if (!window.confirm("Delete this generalized learned record?")) return;
    try {
      await learningRequest(`/records/${id}`, { method: "DELETE" });
      await refreshLearnedRecords();
    } catch {
      setLearningStatus("The learned record could not be deleted.");
    }
  };

  const sendMessage = async (messageOverride?: string) => {
    const message = (messageOverride ?? inputText).trim();
    if (!message || isSending || !ready) return;

    const userMessage: ChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: message,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputText("");
    setIsSending(true);
    try {
      await persistMessage(userMessage);
      const result = await cache.run({
        profileId: profileIdRef.current,
        query: message,
        pending,
        persistent,
        request: async () => {
          const { data, error } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (error || !token) {
            const authError = new Error("AUTH_REQUIRED");
            Object.assign(authError, { category: "authentication" });
            throw authError;
          }
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              messages: nextMessages
                .slice(-20)
                .map(({ role, content }) => ({ role, content })),
              pendingClarification: pending || undefined,
            }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            const requestError = new Error("CHAT_REQUEST_FAILED");
            Object.assign(requestError, {
              category:
                response.status === 401 || response.status === 403
                  ? "authentication"
                  : body?.error?.category || "service_unavailable",
            });
            throw requestError;
          }
          return body;
        },
      });
      const data = result.response;
      const content = data.message?.content?.trim();
      if (!content) throw new Error("EMPTY_RESPONSE");
      const assistantMessage: ChatMessage = {
        id: nextMessageId(),
        role: "assistant",
        content,
        providerName: result.cached
          ? `${data.provider.name} (device cache)`
          : data.provider.name || "ORBIS",
      };
      setMessages((current) => [...current, assistantMessage]);
      await persistMessage(assistantMessage);
      const nextPending = data.clarification?.pending || null;
      setPending(nextPending);
      if (persistent) {
        try {
          await chatStorage.setPendingClarification(
            profileIdRef.current,
            conversationIdRef.current,
            nextPending,
          );
        } catch {
          setStorageError(
            "Pending context could not be saved. It remains available for this session.",
          );
          setStorageState("error");
        }
      }
      setProviderHealth(
        data.provider.type.includes("UNAVAILABLE")
          ? "UNAVAILABLE"
          : "AVAILABLE",
      );
      await refreshUsage();
    } catch (error) {
      const category =
        error && typeof error === "object" && "category" in error
          ? String(error.category)
          : "service_unavailable";
      setProviderHealth("UNAVAILABLE");
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          content: errorMessage(category),
          providerName: "System",
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
    const speechWindow = window as any;
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
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

  const healthLabel =
    providerHealth === "AVAILABLE"
      ? "Available"
      : providerHealth === "UNAVAILABLE"
        ? "Unavailable"
        : "Not checked";

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#F8FAFC] font-sans dark:bg-[#0B1120]">
      <header className="z-10 flex items-center justify-between border-b border-gray-200/60 bg-white/80 px-6 py-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-black/40">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 shadow-md">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-gray-800 dark:text-white">
                ORBIS Brain
              </h2>
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {healthLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void clearChat()}
            title="Clear Chat"
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowStorageControls((value) => !value)}
            title="Local data controls"
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      {storageState === "loading" && (
        <p
          role="status"
          className="bg-blue-50 px-4 py-2 text-center text-xs text-blue-700"
        >
          Loading device storage…
        </p>
      )}
      {storageError && (
        <div
          role="alert"
          className="flex items-center justify-center gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          <span>{storageError}</span>
          <button
            type="button"
            onClick={() => void loadPersistentChat()}
            className="font-bold underline"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => {
              setStorageError(null);
              setStorageState("ephemeral");
            }}
            className="font-bold underline"
          >
            Session only
          </button>
        </div>
      )}

      {showStorageControls && (
        <section
          aria-label="Local Chatbot data controls"
          className="z-20 border-b bg-white p-4 text-sm shadow-sm dark:bg-gray-900 dark:text-gray-200"
        >
          <div className="mx-auto max-w-4xl space-y-2">
            <p className="font-semibold">
              <Database className="mr-2 inline h-4 w-4" />
              {persistent ? "Saving on this device" : "Session-only memory"}
            </p>
            <p>
              Budget: 500 MB. Used by this profile:{" "}
              {usage
                ? `${(usage.logicalBytes / 1024 / 1024).toFixed(2)} MB`
                : "not available"}
              .
            </p>
            {usage?.warning && (
              <p role="alert" className="text-amber-700">
                Local Chatbot storage is above 80% of its budget.
              </p>
            )}
            <p className="text-xs text-gray-500">
              Browser/app data removal or uninstall removes local history. No
              encrypted backup exists yet.
            </p>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="font-semibold">Foundation text learning</p>
              <p className="mt-1 text-xs text-gray-500">
                Separate from chat history. Off by default. Only a reviewed,
                generalized candidate can be stored; personal memory stays on
                this device.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleLearning(!learningEnabled)}
                  className="rounded border px-3 py-1"
                >
                  {learningEnabled
                    ? "Turn learning off"
                    : "Enable learning review"}
                </button>
                <button
                  type="button"
                  disabled={
                    !learningEnabled ||
                    !messages.some((item) => item.role === "user")
                  }
                  onClick={() => void previewLearningCandidate()}
                  className="rounded border px-3 py-1 disabled:opacity-50"
                >
                  Review latest message for learning
                </button>
                <button
                  type="button"
                  disabled={!learningEnabled}
                  onClick={() => void refreshLearnedRecords()}
                  className="rounded border px-3 py-1 disabled:opacity-50"
                >
                  List learned records
                </button>
              </div>
              {learningStatus && (
                <p
                  role="status"
                  className="mt-2 text-xs text-slate-600 dark:text-slate-300"
                >
                  {learningStatus}
                </p>
              )}
              {learnedRecords.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {learnedRecords.map((record) => (
                    <li
                      key={record.id}
                      className="flex items-start justify-between gap-3 rounded border p-2"
                    >
                      <span className="text-xs">{record.content}</span>
                      <button
                        type="button"
                        onClick={() => void deleteLearnedRecord(record.id)}
                        className="text-xs font-semibold text-red-600"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {persistent ? (
                <button
                  type="button"
                  onClick={() => {
                    chatStorage.setConsent(profileIdRef.current, "declined");
                    setStorageState("ephemeral");
                    cache.clearEphemeral();
                  }}
                  className="rounded border px-3 py-1"
                >
                  Revoke storage consent
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void chooseConsent(true)}
                  className="rounded border px-3 py-1"
                >
                  Enable device storage
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  void chatStorage
                    .clearPersonalMemory(profileIdRef.current)
                    .then(refreshUsage)
                }
                disabled={!persistent}
                className="rounded border px-3 py-1 disabled:opacity-50"
              >
                Clear personal memory
              </button>
              <button
                type="button"
                onClick={() => void clearChat()}
                className="rounded border px-3 py-1"
              >
                Clear chat
              </button>
              <button
                type="button"
                disabled={!persistent}
                onClick={() => {
                  if (
                    window.confirm(
                      "এই profile-এর সব local Chatbot data মুছে ফেলবেন?",
                    )
                  )
                    void chatStorage
                      .clearAllForProfile(profileIdRef.current)
                      .then(() => {
                        setMessages([INITIAL_MESSAGE]);
                        setPending(null);
                        setStorageState("ephemeral");
                        setShowConsent(true);
                      });
                }}
                className="rounded border border-red-300 px-3 py-1 text-red-600 disabled:opacity-50"
              >
                Delete all local Chatbot data
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="flex-1 space-y-6 overflow-y-auto p-4 md:p-8">
        {messages.map((message) => (
          <ChatMessageBubble
            key={message.id}
            message={message}
            onActivate={(selected, position) =>
              setActiveMenu({ message: selected, position })
            }
            isMenuOpen={activeMenu?.message.id === message.id}
          />
        ))}
        {isSending && (
          <div className="mx-auto flex max-w-4xl items-center gap-3 text-sm text-emerald-600">
            <Bot className="h-5 w-5 animate-pulse" /> ORBIS processing…
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {activeMenu && (
        <MessageActionMenu
          position={activeMenu.position}
          canShare={isShareSupported()}
          onCopy={() => void copyMessageContent(activeMenu.message.content)}
          onShare={() => void shareMessageContent(activeMenu.message.content)}
          onClose={() => setActiveMenu(null)}
        />
      )}

      <div className="p-4 pb-6">
        <div className="mx-auto max-w-4xl rounded-[28px] border border-gray-300/60 bg-white p-1.5 shadow-lg dark:border-gray-700 dark:bg-[#1E293B]">
          <div className="flex items-end gap-2">
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
              disabled={isSending || !ready}
              className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-3 text-[15.5px] outline-none disabled:opacity-60 dark:text-white"
            />
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={isSending || !ready}
              aria-label="Voice input"
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
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
              disabled={!inputText.trim() || isSending || !ready}
              aria-label="Send message"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] text-gray-400">
          Attachments are not supported and are never sent. ORBIS can make
          mistakes.
        </p>
      </div>

      {showConsent && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="memory-consent-title"
            className="max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 dark:text-white"
          >
            <h3 id="memory-consent-title" className="text-lg font-bold">
              Save Chatbot memory on this device?
            </h3>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              If enabled, chat history, pending clarifications, cache, and
              personal memory stay only in this browser profile. Declining keeps
              context only for this open session.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => void chooseConsent(true)}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white"
              >
                Save on device
              </button>
              <button
                type="button"
                onClick={() => void chooseConsent(false)}
                className="rounded-lg border px-4 py-2 font-semibold"
              >
                Session only
              </button>
            </div>
          </section>
        </div>
      )}

      {learningCandidate && (
        <div className="absolute inset-0 z-[75] flex items-center justify-center bg-black/40 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="learning-review-title"
            className="max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 dark:text-white"
          >
            <h3 id="learning-review-title" className="text-lg font-bold">
              Review generalized learning candidate
            </h3>
            <p className="mt-2 text-xs text-gray-500">
              This is the only text that will be stored. The source chat and
              response are never written to the database.
            </p>
            <p className="mt-4 rounded border p-3 text-sm">
              {learningCandidate.content}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              {learningCandidate.category} · {learningCandidate.tags.join(", ")}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => void approveLearningCandidate()}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white"
              >
                Approve and save
              </button>
              <button
                type="button"
                onClick={() => {
                  setLearningCandidate(null);
                  setLearningApprovalToken("");
                }}
                className="rounded-lg border px-4 py-2 font-semibold"
              >
                Reject
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
