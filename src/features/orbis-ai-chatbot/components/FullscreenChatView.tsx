import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Database,
  Mic,
  MoreVertical,
  Plus,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import { supabase } from "../../../core/supabase/client";
import { DeviceChatRequestCache } from "../services/DeviceChatRequestCache";
import {
  prepareChatRequest,
  prepareContextRecoveryRequest,
} from "../services/ChatRequestBuilder";
import type { ChatRequestPayload } from "../services/ChatRequestBuilder";
import { chatStorage } from "../storage/ChatStorageManager";
import type {
  CachedChatResponse,
  ChatLearningPolicyTrace,
  ChatBrainDecisionTrace,
  ChatTestLogEntry,
  ChatWebEvidence,
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
import {
  getSpeechRecognitionConstructor,
  readVoiceResult,
  VOICE_LANGUAGES,
  VoiceLanguage,
  voiceErrorMessage,
} from "../../voice/browserSpeech";

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

interface ChatApiResponse {
  message?: { role?: string; content?: string };
  provider: { name: string; type: string; model?: string };
  route?: string;
  brainDecision?: string | null;
  brainDecisionTrace?: ChatBrainDecisionTrace | null;
  learningPolicy?: ChatLearningPolicyTrace | null;
  routingDurationMs?: number;
  evidence?: ChatWebEvidence | null;
  clarification?: {
    state?: string;
    pending?: PendingClarification | null;
  };
}

const RECOVERABLE_CONTEXT_ERROR_CODES = new Set([
  "CHAT_INPUT_INVALID",
  "CHAT_REQUEST_TOO_LARGE",
  "CHAT_TOO_MANY_MESSAGES",
  "REQUEST_TOO_LARGE",
]);

function shouldRetryWithMinimalContext(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { category?: unknown; code?: unknown };
  return (
    value.category === "invalid_request" &&
    typeof value.code === "string" &&
    RECOVERABLE_CONTEXT_ERROR_CODES.has(value.code)
  );
}

async function requestChatResponse(
  payload: ChatRequestPayload,
): Promise<CachedChatResponse["response"]> {
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
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const requestError = new Error("CHAT_REQUEST_FAILED");
    Object.assign(requestError, {
      category:
        response.status === 401 || response.status === 403
          ? "authentication"
          : body?.error?.category || "service_unavailable",
      code: typeof body?.error?.code === "string" ? body.error.code : undefined,
    });
    throw requestError;
  }
  return body;
}

const INITIAL_MESSAGE: ChatMessage = {
  id: 1,
  role: "assistant",
  content: "নমস্কার দাদা! ORBIS Brain প্রস্তুত। আপনি কী জানতে বা করতে চান?",
  providerName: "ORBIS",
};

function nextMessageId(): number {
  const randomValues = new Uint32Array(1);
  globalThis.crypto.getRandomValues(randomValues);
  return Date.now() * 1_000 + (randomValues[0] % 1_000);
}

function buildAssistantMessage(
  data: ChatApiResponse,
  cached: boolean,
  content: string,
): ChatMessage {
  return {
    id: nextMessageId(),
    role: "assistant",
    content,
    providerName: cached
      ? `${data.provider.name} (device cache)`
      : data.provider.name || "ORBIS",
    evidence: data.evidence || undefined,
  };
}

function brainDecisionTestLogMetadata(
  data: ChatApiResponse,
): Pick<
  ChatTestLogEntry,
  | "brainDecisionIntent"
  | "brainDecisionConfidence"
  | "brainDecisionReason"
  | "brainEvidenceRequired"
> {
  const trace = data.brainDecisionTrace;
  return {
    brainDecisionIntent: trace?.intent || null,
    brainDecisionConfidence: trace?.confidence || null,
    brainDecisionReason: trace?.reason || null,
    brainEvidenceRequired: trace?.evidenceRequired ?? null,
  };
}

function webEvidenceTestLogMetadata(
  data: ChatApiResponse,
): Pick<
  ChatTestLogEntry,
  | "webSourceCount"
  | "webEvidenceStatus"
  | "webLocationMatched"
  | "webNumericFactsSupported"
> {
  const evidence = data.evidence;
  const verification = evidence?.verification;
  return {
    webSourceCount: evidence?.sources.length || null,
    webEvidenceStatus: verification?.status || null,
    webLocationMatched: verification?.locationMatched ?? null,
    webNumericFactsSupported: verification?.numericFactsSupported ?? null,
  };
}

function learningPolicyTestLogMetadata(
  data: ChatApiResponse,
): Pick<ChatTestLogEntry, "appliedLearningPolicyCodes"> {
  const applied = data.learningPolicy?.applied || [];
  return {
    appliedLearningPolicyCodes: applied
      .map((policy) => policy.code)
      .filter((code) => code === "time-sensitive-evidence"),
  };
}

function normalizedRoutingDuration(value: number | undefined): number | null {
  return Number.isFinite(value) ? value || 0 : null;
}

function successfulTestLogMetadata(
  data: ChatApiResponse,
  cached: boolean,
): Pick<
  ChatTestLogEntry,
  | "providerName"
  | "providerType"
  | "route"
  | "brainDecision"
  | "brainDecisionIntent"
  | "brainDecisionConfidence"
  | "brainDecisionReason"
  | "brainEvidenceRequired"
  | "appliedLearningPolicyCodes"
  | "routingDurationMs"
  | "delivery"
  | "outcome"
  | "clarificationState"
  | "webSourceCount"
  | "webEvidenceStatus"
  | "webLocationMatched"
  | "webNumericFactsSupported"
  | "errorCategory"
> {
  return {
    providerName: data.provider?.name || "ORBIS",
    providerType: data.provider?.type || "UNKNOWN",
    route: data.route || null,
    brainDecision: data.brainDecision || null,
    ...brainDecisionTestLogMetadata(data),
    ...learningPolicyTestLogMetadata(data),
    routingDurationMs: normalizedRoutingDuration(data.routingDurationMs),
    delivery: cached ? "device-cache" : "fresh",
    outcome: "success",
    clarificationState: data.clarification?.state || null,
    ...webEvidenceTestLogMetadata(data),
    errorCategory: null,
  };
}

function providerHealthLabel(providerHealth: ProviderHealth): string {
  if (providerHealth === "AVAILABLE") return "Available";
  if (providerHealth === "UNAVAILABLE") return "Unavailable";
  return "Not checked";
}

function voiceLanguageLabel(voiceLanguage: VoiceLanguage): string {
  if (voiceLanguage === "bn-IN") return "BN";
  if (voiceLanguage === "hi-IN") return "HI";
  return "EN";
}

function errorMessage(category: string, code?: string): string {
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
    if (code === "ATTACHMENTS_UNSUPPORTED") {
      return "Attachment এখনো chat-এ যুক্ত হয়নি।";
    }
    if (code === "CHAT_MESSAGE_TOO_LARGE") {
      return "একটি message খুব বড়। লেখা ছোট করে আবার পাঠান।";
    }
    if (code === "CHAT_REQUEST_TOO_LARGE" || code === "REQUEST_TOO_LARGE") {
      return "পুরোনো chat context বড় ছিল। নতুন করে চেষ্টা করুন।";
    }
    if (code === "CHAT_TOO_MANY_MESSAGES") {
      return "পুরোনো chat context সীমার বাইরে ছিল। নতুন করে চেষ্টা করুন।";
    }
    return "অনুরোধটির format ঠিক ছিল না। নতুন করে চেষ্টা করুন।";
  }
  return "ORBIS সেবা এখন উপলব্ধ নয়। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
}

export const FullscreenChatView: React.FC<FullscreenChatViewProps> = ({
  onClose,
}) => {
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>("bn-IN");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceTranscriptRef = useRef("");
  const initialized = useRef(false);
  const profileIdRef = useRef("");
  const conversationIdRef = useRef("");
  const cacheRef = useRef(new DeviceChatRequestCache(chatStorage));
  const cache = cacheRef.current;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 176)}px`;
    input.style.overflowY = input.scrollHeight > 176 ? "auto" : "hidden";
  }, [inputText]);

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
          history.map(({ id, role, content, providerName, evidence }) => ({
            id,
            role,
            content,
            providerName,
            evidence,
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

  const persistTestLog = async (entry: ChatTestLogEntry) => {
    if (!persistent) return;
    try {
      await chatStorage.saveTestLog(entry);
    } catch {
      setStorageError(
        "Chat Test Log এই ডিভাইসে সংরক্ষণ করা যায়নি। Chat চলতে থাকবে।",
      );
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

  const createTestLogReference = (
    userMessage: ChatMessage,
    assistantMessage: ChatMessage,
    startedAt: number,
  ): Pick<
    ChatTestLogEntry,
    | "id"
    | "profileId"
    | "conversationId"
    | "userMessageId"
    | "assistantMessageId"
    | "startedAt"
    | "completedAt"
    | "durationMs"
  > => {
    const completedAt = Date.now();
    return {
      id: crypto.randomUUID(),
      profileId: profileIdRef.current,
      conversationId: conversationIdRef.current,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
    };
  };

  const handleSuccessfulChatResponse = async (
    data: ChatApiResponse,
    cached: boolean,
    userMessage: ChatMessage,
    startedAt: number,
  ) => {
    const content = data.message?.content?.trim();
    if (!content) throw new Error("EMPTY_RESPONSE");
    const assistantMessage = buildAssistantMessage(data, cached, content);
    setMessages((current) => [...current, assistantMessage]);
    await persistMessage(assistantMessage);
    await persistTestLog({
      ...createTestLogReference(userMessage, assistantMessage, startedAt),
      ...successfulTestLogMetadata(data, cached),
    });
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
      data.provider.type.includes("UNAVAILABLE") ? "UNAVAILABLE" : "AVAILABLE",
    );
    await refreshUsage();
  };

  const handleFailedChatResponse = async (
    error: unknown,
    userMessage: ChatMessage,
    startedAt: number,
  ) => {
    const category =
      error && typeof error === "object" && "category" in error
        ? String(error.category)
        : "service_unavailable";
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : undefined;
    setProviderHealth("UNAVAILABLE");
    const assistantMessage: ChatMessage = {
      id: nextMessageId(),
      role: "assistant",
      content: errorMessage(category, code),
      providerName: "System",
    };
    setMessages((current) => [...current, assistantMessage]);
    await persistMessage(assistantMessage);
    await persistTestLog({
      ...createTestLogReference(userMessage, assistantMessage, startedAt),
      providerName: "System",
      providerType: "ERROR",
      route: null,
      brainDecision: null,
      brainDecisionIntent: null,
      brainDecisionConfidence: null,
      brainDecisionReason: null,
      brainEvidenceRequired: null,
      appliedLearningPolicyCodes: [],
      routingDurationMs: null,
      delivery: "fresh",
      outcome: "error",
      clarificationState: null,
      webSourceCount: null,
      webEvidenceStatus: null,
      webLocationMatched: null,
      webNumericFactsSupported: null,
      errorCategory: category,
    });
  };

  const clearPendingContext = async () => {
    setPending(null);
    if (!persistent) return;
    try {
      await chatStorage.setPendingClarification(
        profileIdRef.current,
        conversationIdRef.current,
        null,
      );
    } catch {
      setStorageError("Pending context could not be cleared from this device.");
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
    const startedAt = Date.now();
    try {
      await persistMessage(userMessage);
      const prepared = prepareChatRequest(nextMessages, pending);
      if (prepared.droppedInvalidPending) {
        await clearPendingContext();
      }
      if (prepared.errorCode) {
        const preparationError = new Error(prepared.errorCode);
        Object.assign(preparationError, {
          category: "invalid_request",
          code: prepared.errorCode,
        });
        throw preparationError;
      }
      let result: {
        response: CachedChatResponse["response"];
        cached: boolean;
      };
      try {
        result = await cache.run({
          profileId: profileIdRef.current,
          conversationId: conversationIdRef.current,
          query: message,
          pending: prepared.pendingClarification,
          persistent,
          request: () => requestChatResponse(prepared.payload),
        });
      } catch (error) {
        if (!shouldRetryWithMinimalContext(error)) throw error;
        const recovery = prepareContextRecoveryRequest(nextMessages);
        if (recovery.errorCode) throw error;

        // The first request was rejected before the Brain/provider ran. Drop
        // only incompatible pending context and retry this one user question;
        // the complete local history remains untouched on the device.
        await clearPendingContext();
        result = await cache.run({
          profileId: profileIdRef.current,
          conversationId: conversationIdRef.current,
          query: message,
          pending: null,
          persistent,
          request: () => requestChatResponse(recovery.payload),
        });
      }
      await handleSuccessfulChatResponse(
        result.response as ChatApiResponse,
        result.cached,
        userMessage,
        startedAt,
      );
    } catch (error) {
      await handleFailedChatResponse(error, userMessage, startedAt);
    } finally {
      setIsSending(false);
    }
  };

  const toggleVoiceInput = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const SpeechRecognition = getSpeechRecognitionConstructor();
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
    recognition.lang = voiceLanguage;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    voiceTranscriptRef.current = "";
    recognition.onresult = (event: any) => {
      const result = readVoiceResult(event);
      voiceTranscriptRef.current = result.transcript;
      setInputText(result.transcript);
      if (result.transcript) {
        setVoiceStatus("Transcript দেখে Send চাপুন।");
      }
    };
    recognition.onend = () => {
      const transcript = voiceTranscriptRef.current.trim();
      setIsListening(false);
      recognitionRef.current = null;
      if (!transcript)
        setVoiceStatus("কোনো কথা শোনা যায়নি। আবার চেষ্টা করুন।");
    };
    recognition.onerror = (event: any) => {
      setIsListening(false);
      recognitionRef.current = null;
      setVoiceStatus(voiceErrorMessage(event?.error));
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    setVoiceStatus("শুনছি…");
    recognition.start();
  };

  const healthLabel = providerHealthLabel(providerHealth);
  const voiceLanguageCode = voiceLanguageLabel(voiceLanguage);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_0_0,rgba(255,225,180,0.72),transparent_34%),radial-gradient(circle_at_100%_100%,rgba(211,247,213,0.78),transparent_34%),linear-gradient(155deg,#fff3df,#fff9ed_48%,#edfbea)] font-sans">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-emerald-100/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-2xl sm:px-6 sm:py-4">
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
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-orange-100 bg-gradient-to-br from-emerald-50 via-white to-orange-100 shadow-sm">
              <Sparkles className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-slate-800">
                ORBIS Assistant
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {healthLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="relative flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setShowLanguageMenu((value) => !value);
              setShowStorageControls(false);
            }}
            aria-label="Voice language"
            aria-expanded={showLanguageMenu}
            className="flex h-10 min-w-10 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 text-[11px] font-black text-emerald-700"
          >
            {voiceLanguageCode}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowStorageControls((value) => !value);
              setShowLanguageMenu(false);
            }}
            title="Local data controls"
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {showLanguageMenu && (
            <div
              role="menu"
              aria-label="Voice language options"
              className="absolute right-11 top-11 z-30 w-48 overflow-hidden rounded-2xl border border-emerald-100 bg-white p-1.5 shadow-xl"
            >
              {VOICE_LANGUAGES.map((language) => (
                <button
                  key={language.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={voiceLanguage === language.value}
                  disabled={isListening || isSending || !ready}
                  onClick={() => {
                    setVoiceLanguage(language.value);
                    setShowLanguageMenu(false);
                  }}
                  className={`block min-h-[42px] w-full rounded-xl px-3 py-2 text-left text-xs ${
                    voiceLanguage === language.value
                      ? "bg-emerald-600 font-bold text-white"
                      : "text-slate-600 hover:bg-emerald-50"
                  } disabled:opacity-50`}
                >
                  {language.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="z-10 shrink-0 border-b border-orange-100/70 bg-[#fff8e9]/80 px-3 py-2 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setInputText("আমার Termux system info দেখাও")}
            className="shrink-0 rounded-full border border-emerald-100 bg-white/85 px-3 py-1.5 text-[10px] font-semibold text-emerald-700"
          >
            System info
          </button>
          <button
            type="button"
            onClick={() => setInputText("আজকের weather বলো")}
            className="shrink-0 rounded-full border border-orange-100 bg-white/85 px-3 py-1.5 text-[10px] font-semibold text-orange-700"
          >
            Weather
          </button>
          <button
            type="button"
            disabled
            title="Market Intelligence is not connected yet"
            className="shrink-0 cursor-not-allowed rounded-full border border-slate-200 bg-white/60 px-3 py-1.5 text-[10px] font-semibold text-slate-400"
          >
            Market research · Not connected
          </button>
        </div>
      </div>

      {storageState === "loading" && (
        <output className="block bg-blue-50 px-4 py-2 text-center text-xs text-blue-700">
          Loading device storage…
        </output>
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
                <output className="mt-2 block text-xs text-slate-600 dark:text-slate-300">
                  {learningStatus}
                </output>
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

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-transparent p-4 pb-6 md:p-8">
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

      <div className="z-10 shrink-0 border-t border-orange-100/70 bg-[#fff4e2]/90 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-2xl sm:px-4">
        <div className="mx-auto max-w-4xl rounded-[24px] border border-orange-100 bg-white/90 p-1.5 shadow-[0_10px_30px_rgba(103,93,70,0.10)]">
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled
              aria-label="Attachments unavailable"
              title="Attachments are not connected yet"
              className="flex h-10 w-10 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-slate-50 text-slate-300"
            >
              <Plus className="h-5 w-5" />
            </button>
            <textarea
              ref={inputRef}
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
              className="min-h-[44px] max-h-44 flex-1 resize-none bg-transparent px-2 py-3 text-[15px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={isSending || !ready}
              aria-label={isListening ? "Stop voice input" : "Voice input"}
              aria-pressed={isListening}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-emerald-600 ${isListening ? "animate-pulse bg-red-100" : "bg-emerald-50 hover:bg-emerald-100"}`}
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
              className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-200 text-slate-700 shadow-sm hover:bg-orange-300 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {voiceStatus ? (
            <div className="flex justify-end px-2 pb-1 pt-0.5">
              <output className="max-w-full break-words text-right text-[11px] text-slate-500">
                {voiceStatus}
              </output>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-center text-[9px] leading-relaxed text-slate-400">
          Attachments are not connected yet. ORBIS can make mistakes. Verify
          important information before taking action.
        </p>
      </div>

      {showConsent && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <dialog
            open
            aria-modal="true"
            aria-labelledby="memory-consent-title"
            className="m-0 max-w-md rounded-2xl border-0 bg-white p-6 shadow-2xl dark:bg-gray-900 dark:text-white"
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
          </dialog>
        </div>
      )}

      {learningCandidate && (
        <div className="absolute inset-0 z-[75] flex items-center justify-center bg-black/40 p-4">
          <dialog
            open
            aria-modal="true"
            aria-labelledby="learning-review-title"
            className="m-0 max-w-lg rounded-2xl border-0 bg-white p-6 shadow-2xl dark:bg-gray-900 dark:text-white"
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
          </dialog>
        </div>
      )}
    </div>
  );
};
