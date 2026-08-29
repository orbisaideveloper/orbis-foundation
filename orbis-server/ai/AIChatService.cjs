const providerManager = require("./AIProviderManager.cjs");
const tavilySearch = require("./tools/TavilySearch.cjs");
const capabilityIntentMatcher = require("./brain/ChatCapabilityIntentMatcher.cjs");
const {
  foundationChatOrchestrator,
} = require("./FoundationChatOrchestrator.cjs");
const {
  getFoundationCapabilityStatus,
} = require("./FoundationCapabilityChatPolicy.cjs");
const {
  buildProviderPlanningInstruction,
} = require("./FoundationConversationPolicy.cjs");
const { verifyWebSearchResult } = require("./brain/WebEvidenceVerifier.cjs");
const {
  composeEvidenceAwareWebAnswer,
} = require("./brain/EvidenceAwareResponseComposer.cjs");

/**
 * TASK-013 — AI Chat -> Brain Command Integration
 *
 * Loads the SAME compiled CommonJS Brain runtime boundary that
 * orbis-server/bridge.cjs already uses for POST /api/brain/request
 * (orbis-server/brain-runtime/brain/BrainRequestGateway.js, generated at
 * build time from src/core/brain/BrainRequestGateway.ts via
 * `npm run build:brain-runtime`).
 *
 * AIChatService calls this SAME gateway in-process — it does not make an
 * internal HTTP call to /api/brain/request, and it does not import
 * src/core/brain/*.ts (a TypeScript module) directly from this CommonJS
 * production server. /api/brain/request remains the canonical external
 * HTTP entry point; this is the canonical in-process entry point, and
 * both resolve to the identical singleton object graph (Node's module
 * cache), so authorization/policy decisions are identical either way.
 *
 * If the compiled runtime has not been built yet (`npm run build` /
 * `npm run build:brain-runtime`), requiring it throws — this is treated
 * as a Brain-unavailable condition, not a crash, and never falls through
 * to executing anything else.
 */
function loadBrainRequestGateway() {
  try {
    const {
      brainRequestGateway,
    } = require("../brain-runtime/brain/BrainRequestGateway.js");
    return brainRequestGateway || null;
  } catch {
    console.error("[CHAT_BRAIN_BRIDGE] Brain runtime unavailable");
    return null;
  }
}

/**
 * Formats an IExecutionResult from the Brain into a plain-language chat
 * reply, in the same language (English or Bengali) as the user's message.
 * This never re-interprets the result — it only describes the structured
 * success/failure the Brain already decided.
 */
function formatSystemInfoReply(output, bn) {
  if (bn) {
    return (
      `এখানে আপনার সিস্টেমের তথ্য:\n` +
      `প্ল্যাটফর্ম: ${output.platform}\n` +
      `আর্কিটেকচার: ${output.architecture}\n` +
      `Node ভার্সন: ${output.nodeVersion}\n` +
      `Termux ভার্সন: ${output.termuxVersion}\n` +
      `CPU কোর: ${output.cpuCores}\n` +
      `মেমরি (ফ্রি/মোট): ${output.memoryFreeGB}GB / ${output.memoryTotalGB}GB`
    );
  }
  return (
    `Here is your system information:\n` +
    `Platform: ${output.platform}\n` +
    `Architecture: ${output.architecture}\n` +
    `Node version: ${output.nodeVersion}\n` +
    `Termux version: ${output.termuxVersion}\n` +
    `CPU cores: ${output.cpuCores}\n` +
    `Memory (free/total): ${output.memoryFreeGB}GB / ${output.memoryTotalGB}GB`
  );
}

function formatSuccessfulBrainResult(capabilityId, output, bn) {
  if (capabilityId === "termux.system.info" && output) {
    return formatSystemInfoReply(output, bn);
  }
  if (capabilityId === "termux.file.read" && output) {
    return bn
      ? `ফাইল "${output.path}" থেকে পড়া হয়েছে:\n\n${output.content}`
      : `Read from file "${output.path}":\n\n${output.content}`;
  }
  return bn
    ? "অনুরোধটি সফলভাবে সম্পন্ন হয়েছে।"
    : "The request completed successfully.";
}

function formatApprovalRequiredReply(token, bn) {
  if (token) {
    return bn
      ? String.raw`এই অনুরোধের জন্য আপনার অনুমোদন প্রয়োজন।\n\nApproval token: ${token}\n\nঅনুমোদন করতে লিখুন: APPROVE ${token}`
      : String.raw`This request requires your approval.\n\nApproval token: ${token}\n\nTo approve this exact request, reply: APPROVE ${token}`;
  }
  return bn
    ? "এই অনুরোধের জন্য অনুমোদন প্রয়োজন, তাই এটি এখনই কার্যকর করা হয়নি।"
    : "This request requires approval, so it was not executed yet.";
}

function formatBrainErrorAsChatReply(error, approvalToken, bn) {
  if (error.includes("REQUIRE_APPROVAL")) {
    return formatApprovalRequiredReply(approvalToken, bn);
  }
  if (error.includes("DENY") || error.includes("NOT_AUTHORIZED")) {
    return bn
      ? "এই অনুরোধটি অনুমোদিত নয়, তাই প্রত্যাখ্যান করা হয়েছে।"
      : "This request is not authorized, so it was denied.";
  }
  if (
    error.includes("DISCOVERY_UNAVAILABLE") ||
    error.includes("BRIDGE_UNREACHABLE")
  ) {
    return bn
      ? "এই মুহূর্তে সিস্টেমের সাথে সংযোগ পাওয়া যাচ্ছে না, তাই অনুরোধটি সম্পন্ন করা যায়নি।"
      : "The system bridge isn't reachable right now, so the request could not be completed.";
  }
  if (
    error.includes("CAPABILITY_NOT_DISCOVERABLE") ||
    error.includes("CAPABILITY_NOT_FOUND")
  ) {
    return bn
      ? "অনুরোধ করা ফিচারটি এই মুহূর্তে উপলব্ধ নয়।"
      : "The requested capability isn't available right now.";
  }
  if (error.includes("BRAIN_GATEWAY_UNAVAILABLE")) {
    return bn
      ? "ব্রেইন সিস্টেম এই মুহূর্তে উপলব্ধ নয়।"
      : "The Brain system isn't available right now.";
  }
  return bn
    ? "অনুরোধটি নিরাপদভাবে সম্পন্ন করা যায়নি।"
    : "The request could not be completed safely.";
}

function formatBrainResultAsChatReply(capabilityId, result, lang) {
  const bn = lang === "bn";
  if (result?.success) {
    return formatSuccessfulBrainResult(capabilityId, result.output, bn);
  }
  return formatBrainErrorAsChatReply(
    result?.error || "UNKNOWN_ERROR",
    result?.approvalToken,
    bn,
  );
}

function formatApprovalResultAsChatReply(result, lang) {
  const bn = lang === "bn";
  const error = result?.error || "";

  if (result?.success) {
    const capabilityId = result?.metadata?.capabilityId || "termux.file.read";
    return formatBrainResultAsChatReply(capabilityId, result, lang);
  }

  if (error.includes("APPROVAL_REJECTED")) {
    return bn
      ? "অনুরোধটি বাতিল করা হয়েছে এবং কার্যকর করা হয়নি।"
      : "The request was rejected and was not executed.";
  }

  if (error.includes("APPROVAL_EXPIRED")) {
    return bn
      ? "অনুমোদনের সময় শেষ হয়ে গেছে। নতুন করে অনুরোধ করুন।"
      : "The approval expired. Please make the request again.";
  }

  if (error.includes("APPROVAL_REPLAY")) {
    return bn
      ? "এই approval token ইতিমধ্যে ব্যবহার করা হয়েছে।"
      : "This approval token has already been used.";
  }

  if (error.includes("APPROVAL_INVALID")) {
    return bn
      ? "Approval tokenটি বৈধ নয়।"
      : "That approval token is not valid.";
  }

  return bn
    ? "অনুমোদন নিরাপদভাবে সম্পন্ন হয়নি।"
    : "The approval flow did not complete safely.";
}

class AIChatService {
  async processChatRequest(rawMessages, context = {}) {
    return foundationChatOrchestrator.orchestrate(
      {
        messages: rawMessages,
        pendingClarification: context.pendingClarification,
      },
      (messages, routeDecision) =>
        this.executeNormalizedRequest(messages, routeDecision),
    );
  }

  async executeNormalizedRequest(formattedMessages, routeDecision) {
    const lastUserMessage =
      formattedMessages[formattedMessages.length - 1].content;
    try {
      const brainResponse = await this.tryBrainRequest(lastUserMessage);
      if (brainResponse) return brainResponse;
      return await this.executeRoute(
        formattedMessages,
        lastUserMessage,
        routeDecision,
      );
    } catch (error) {
      const failureType = error instanceof Error ? "Error" : "NonError";
      console.error(`[AI_CHAT_SERVICE] ${failureType} request failed`);
      const code = "CHAT_BACKEND_UNAVAILABLE";
      const normalized = new Error(code);
      normalized.code = code;
      throw normalized;
    }
  }

  async tryBrainRequest(lastUserMessage) {
    const approvalResponse = await this.tryApprovalRequest(lastUserMessage);
    if (approvalResponse) return approvalResponse;

    const capabilityRequest =
      capabilityIntentMatcher.matchRequest(lastUserMessage);
    if (!capabilityRequest) return null;
    return this.executeCapabilityRequest(capabilityRequest, lastUserMessage);
  }

  async tryApprovalRequest(lastUserMessage) {
    const approvalDecision =
      capabilityIntentMatcher.matchApprovalDecision(lastUserMessage);
    if (!approvalDecision) return null;

    const approvalGateway = loadBrainRequestGateway();
    const lang = capabilityIntentMatcher.detectLanguage(lastUserMessage);
    if (
      !approvalGateway ||
      typeof approvalGateway.submitApproval !== "function"
    ) {
      return {
        message: {
          role: "assistant",
          content:
            lang === "bn"
              ? "অনুমোদন সিস্টেম এই মুহূর্তে উপলব্ধ নয়।"
              : "The approval system is unavailable right now.",
        },
        provider: { name: "ORBIS Brain", type: "BRAIN_APPROVAL" },
      };
    }

    const approvalResult = await approvalGateway.submitApproval(
      approvalDecision.token,
      approvalDecision.decision,
    );
    return {
      message: {
        role: "assistant",
        content: formatApprovalResultAsChatReply(approvalResult, lang),
      },
      provider: { name: "ORBIS Brain", type: "BRAIN_APPROVAL" },
    };
  }

  async executeCapabilityRequest(capabilityRequest, lastUserMessage) {
    const brainRequestGateway = loadBrainRequestGateway();
    const lang = capabilityIntentMatcher.detectLanguage(lastUserMessage);
    const { capabilityId } = capabilityRequest;

    if (capabilityRequest.needsInput) {
      return {
        message: {
          role: "assistant",
          content:
            lang === "bn"
              ? "কোন allow-listed ফাইলটি পড়ব বলুন: package.json অথবা README.md।"
              : "Which allow-listed file should I read: package.json or README.md?",
        },
        provider: { name: "ORBIS Brain", type: "BRAIN_CAPABILITY" },
        clarificationRequired: true,
      };
    }

    if (!brainRequestGateway) {
      return {
        message: {
          role: "assistant",
          content: formatBrainResultAsChatReply(
            capabilityId,
            { success: false, error: "BRAIN_GATEWAY_UNAVAILABLE" },
            lang,
          ),
        },
        provider: { name: "ORBIS Brain", type: "BRAIN_CAPABILITY" },
      };
    }

    const brainResult = await brainRequestGateway.submit({
      capabilityId,
      input: capabilityRequest.input || {},
    });
    return {
      message: {
        role: "assistant",
        content: formatBrainResultAsChatReply(capabilityId, brainResult, lang),
      },
      provider: { name: "ORBIS Brain", type: "BRAIN_CAPABILITY" },
    };
  }

  async executeRoute(formattedMessages, lastUserMessage, routeDecision) {
    if (routeDecision?.route === "brain-direct-reply") {
      const content = routeDecision.conversationPlan?.content;
      if (content) {
        return {
          message: { role: "assistant", content },
          provider: { name: "ORBIS Brain", type: "BRAIN_DIRECT" },
        };
      }
    }
    if (routeDecision?.route === "foundation-capability-status") {
      const content = getFoundationCapabilityStatus(lastUserMessage);
      if (content) {
        return {
          message: { role: "assistant", content },
          provider: {
            name: "ORBIS Foundation",
            type: "FOUNDATION_CAPABILITY_STATUS",
          },
        };
      }
    }
    if (routeDecision?.route === "web-search") {
      return this.executeWebSearch(lastUserMessage, routeDecision);
    }
    return this.executeProviderFallback(
      formattedMessages,
      routeDecision?.conversationPlan,
    );
  }

  async executeWebSearch(lastUserMessage, routeDecision) {
    const weatherRequest =
      capabilityIntentMatcher.matchWeatherRequest(lastUserMessage);
    if (
      weatherRequest &&
      !weatherRequest.location &&
      routeDecision?.weatherLocationResolved !== true
    ) {
      const lang = capabilityIntentMatcher.detectLanguage(lastUserMessage);
      return {
        message: {
          role: "assistant",
          content:
            lang === "bn"
              ? "কোন জায়গার weather জানতে চান? জায়গার নাম বললে খুঁজে দেখছি।"
              : "Which location's weather would you like? Let me know the place name and I'll look it up.",
        },
        provider: {
          name: "ORBIS Brain (Web)",
          type: "WEB_SEARCH_CLARIFICATION",
        },
      };
    }

    if (routeDecision?.configured === false) {
      const lang = capabilityIntentMatcher.detectLanguage(lastUserMessage);
      return {
        message: {
          role: "assistant",
          content:
            lang === "bn"
              ? "লাইভ সার্চ এখন কনফিগার করা নেই। পরে আবার চেষ্টা করুন বা একটি সাধারণ প্রশ্ন করুন।"
              : "Live search is not configured right now. Try again later or ask a non-live question.",
        },
        provider: { name: "ORBIS Brain (Web)", type: "WEB_UNAVAILABLE" },
      };
    }

    const searchLang = capabilityIntentMatcher.detectLanguage(lastUserMessage);
    const searchResult = await tavilySearch.search(lastUserMessage, searchLang);
    const verifiedResult = verifyWebSearchResult(
      lastUserMessage,
      searchResult,
      {
        expectedLocation:
          routeDecision?.weatherLocation || weatherRequest?.location || null,
      },
    );
    if (verifiedResult) {
      return {
        message: {
          role: "assistant",
          content: composeEvidenceAwareWebAnswer(
            verifiedResult.answer,
            searchLang,
          ),
        },
        provider: { name: "ORBIS Brain (Web)", type: "WEB_SEARCH" },
        evidence: verifiedResult.evidence,
      };
    }

    const unavailableLang =
      capabilityIntentMatcher.detectLanguage(lastUserMessage);
    return {
      message: {
        role: "assistant",
        content:
          unavailableLang === "bn"
            ? "লাইভ সার্চ থেকে এখন যাচাইযোগ্য current result পাওয়া যায়নি। কোনো পুরোনো ফল বর্তমান তথ্য হিসেবে দেখানো হয়নি।"
            : "Live search did not return a verifiable current result. No stale result was shown as current.",
      },
      provider: { name: "ORBIS Brain (Web)", type: "WEB_UNAVAILABLE" },
    };
  }

  async executeProviderFallback(formattedMessages, conversationPlan) {
    const aiMessages = [...formattedMessages];
    aiMessages.unshift({
      role: "system",
      content:
        "You are ORBIS's Brain-guided general-conversation writer. " +
        buildProviderPlanningInstruction(conversationPlan) +
        " You do not have " +
        "live internet access, and no real-time API, search engine, or " +
        "external service was called for this specific reply unless the " +
        "conversation explicitly shows ORBIS already did so. Never claim " +
        "to have used Tavily, a weather API, a search engine, a live " +
        "price/news/sports API, or any other real-time service you did " +
        "not actually call in this exchange. Never invent live numbers, " +
        "current facts, or a source/API attribution for them. If asked " +
        "for current/live/time-sensitive information you cannot verify, " +
        "say plainly that you don't have live access to it, rather than " +
        "making up an answer. If an essential detail is unclear, ask one " +
        "short, focused follow-up question instead of guessing. Never claim " +
        "to have created, written, downloaded, attached, or delivered a " +
        "file, spreadsheet, PDF, or other external result unless the " +
        "matching integrated capability actually succeeded in this exchange.",
    });

    const providerResponse = await providerManager.generateChat(aiMessages);
    return {
      message: { role: "assistant", content: providerResponse.content },
      provider: providerResponse.provider,
    };
  }
}

module.exports = new AIChatService();
