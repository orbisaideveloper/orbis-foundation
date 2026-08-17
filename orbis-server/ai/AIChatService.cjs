const providerManager = require("./AIProviderManager.cjs");
const tavilySearch = require("./tools/TavilySearch.cjs");
const memoryEngine = require("./brain/MemoryEngine.cjs");
const capabilityIntentMatcher = require("./brain/ChatCapabilityIntentMatcher.cjs");

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
  } catch (err) {
    console.error(
      "[CHAT_BRAIN_BRIDGE] Brain runtime unavailable:",
      err.message,
    );
    return null;
  }
}

/**
 * Formats an IExecutionResult from the Brain into a plain-language chat
 * reply, in the same language (English or Bengali) as the user's message.
 * This never re-interprets the result — it only describes the structured
 * success/failure the Brain already decided.
 */
function formatBrainResultAsChatReply(capabilityId, result, lang) {
  const bn = lang === "bn";

  if (result && result.success) {
    if (capabilityId === "termux.system.info" && result.output) {
      const d = result.output;
      if (bn) {
        return (
          `এখানে আপনার সিস্টেমের তথ্য:\n` +
          `প্ল্যাটফর্ম: ${d.platform}\n` +
          `আর্কিটেকচার: ${d.architecture}\n` +
          `Node ভার্সন: ${d.nodeVersion}\n` +
          `Termux ভার্সন: ${d.termuxVersion}\n` +
          `CPU কোর: ${d.cpuCores}\n` +
          `মেমরি (ফ্রি/মোট): ${d.memoryFreeGB}GB / ${d.memoryTotalGB}GB`
        );
      }
      return (
        `Here is your system information:\n` +
        `Platform: ${d.platform}\n` +
        `Architecture: ${d.architecture}\n` +
        `Node version: ${d.nodeVersion}\n` +
        `Termux version: ${d.termuxVersion}\n` +
        `CPU cores: ${d.cpuCores}\n` +
        `Memory (free/total): ${d.memoryFreeGB}GB / ${d.memoryTotalGB}GB`
      );
    }
    // TASK-018 (Section 3.A): success-case formatting for termux.file.read.
    // Under the current architecture this branch cannot be reached via
    // chat yet, because termux.file.read is SENSITIVE and is always routed
    // to REQUIRE_APPROVAL by the existing, unmodified authorization chain
    // (see the REQUIRE_APPROVAL branch below). It is added now, matching
    // the same allow-listed "path"/"content" output shape bridge.cjs
    // already returns, so no further wiring is needed once an approval
    // flow exists.
    if (capabilityId === "termux.file.read" && result.output) {
      const d = result.output;
      if (bn) {
        return `ফাইল "${d.path}" থেকে পড়া হয়েছে:\n\n${d.content}`;
      }
      return `Read from file "${d.path}":\n\n${d.content}`;
    }
    return bn
      ? "অনুরোধটি সফলভাবে সম্পন্ন হয়েছে।"
      : "The request completed successfully.";
  }

  const error = (result && result.error) || "UNKNOWN_ERROR";

  if (error.includes("REQUIRE_APPROVAL")) {
    const token = result && result.approvalToken;
    if (token) {
      return bn
        ? `এই অনুরোধের জন্য আপনার অনুমোদন প্রয়োজন।\\n\\nApproval token: ${token}\\n\\nঅনুমোদন করতে লিখুন: APPROVE ${token}`
        : `This request requires your approval.\\n\\nApproval token: ${token}\\n\\nTo approve this exact request, reply: APPROVE ${token}`;
    }
    return bn
      ? "এই অনুরোধের জন্য অনুমোদন প্রয়োজন, তাই এটি এখনই কার্যকর করা হয়নি।"
      : "This request requires approval, so it was not executed yet.";
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
    ? `অনুরোধটি সম্পন্ন করা যায়নি: ${error}`
    : `The request could not be completed: ${error}`;
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
    ? `অনুমোদন সম্পন্ন হয়নি: ${error || "UNKNOWN_ERROR"}`
    : `The approval flow did not complete: ${error || "UNKNOWN_ERROR"}`;
}

class AIChatService {
  async processChatRequest(rawMessages) {
    if (!Array.isArray(rawMessages)) throw new Error("Invalid chat format.");

    const validMessages = rawMessages
      .filter(
        (m) =>
          (m?.role === "user" || m?.role === "assistant") &&
          typeof m?.content === "string",
      )
      .slice(-20);

    const formattedMessages = validMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const lastUserMessage =
      formattedMessages[formattedMessages.length - 1].content;
    const lowerCaseMessage = lastUserMessage.toLowerCase();

    try {
      // ---------------------------------------------------------
      // STEP 1: ORBIS DIRECT MEMORY
      // ---------------------------------------------------------
      const { brainKnowledge, memoryContext } =
        await memoryEngine.retrieveMemory(lowerCaseMessage);

      if (brainKnowledge) {
        return {
          message: { role: "assistant", content: brainKnowledge.content },
          provider: { name: "ORBIS Brain", type: "INTERNAL_MEMORY" },
        };
      }

      // ---------------------------------------------------------
      // TASK-019: explicit approval resolution happens before normal
      // capability routing. A bare "yes"/"হ্যাঁ" never authorizes anything.
      // ---------------------------------------------------------
      const approvalDecision =
        capabilityIntentMatcher.matchApprovalDecision(lastUserMessage);

      if (approvalDecision) {
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

      // ---------------------------------------------------------
      // STEP 1.5 (TASK-013): DETERMINISTIC BRAIN CAPABILITY REQUEST
      //
      // Only a fixed, hardcoded phrase (never AI-generated text) can
      // select a capabilityId here. If matched, the final ALLOW / DENY /
      // REQUIRE_APPROVAL decision belongs entirely to the existing
      // TASK-009 -> TASK-012 Brain chain via brainRequestGateway.submit()
      // — nothing here executes anything itself. A matched-but-denied
      // request is reported as denied and does NOT fall through to
      // web search or Ollama. An unmatched message falls through
      // unchanged to STEP 2.
      // ---------------------------------------------------------
      const capabilityRequest =
        capabilityIntentMatcher.matchRequest(lastUserMessage);
      const matchedCapabilityId = capabilityRequest?.capabilityId ?? null;

      if (matchedCapabilityId) {
        const brainRequestGateway = loadBrainRequestGateway();
        const lang = capabilityIntentMatcher.detectLanguage(lastUserMessage);

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
          };
        }

        if (!brainRequestGateway) {
          return {
            message: {
              role: "assistant",
              content: formatBrainResultAsChatReply(
                matchedCapabilityId,
                {
                  success: false,
                  error: "BRAIN_GATEWAY_UNAVAILABLE",
                },
                lang,
              ),
            },
            provider: { name: "ORBIS Brain", type: "BRAIN_CAPABILITY" },
          };
        }

        const brainResult = await brainRequestGateway.submit({
          capabilityId: matchedCapabilityId,
          input: capabilityRequest.input || {},
        });

        return {
          message: {
            role: "assistant",
            content: formatBrainResultAsChatReply(
              matchedCapabilityId,
              brainResult,
              lang,
            ),
          },
          provider: { name: "ORBIS Brain", type: "BRAIN_CAPABILITY" },
        };
      }

      // ---------------------------------------------------------
      // STEP 2: ORBIS DIRECT WEB SEARCH
      // ---------------------------------------------------------
      const temporalWords = [
        "latest",
        "update",
        "news",
        "price",
        "current",
        "today",
        "weather",
        "খবর",
        "বর্তমান",
        "আজকের",
        "এখন",
        "সর্বশেষ",
        "আবহাওয়া",
        "দাম",
      ];
      const regexPattern = new RegExp(
        `(?:^|\\s|[.,!?])(${temporalWords.join("|")})(?=\\s|[.,!?]|$)`,
        "i",
      );
      const needsWebSearch = regexPattern.test(lowerCaseMessage);

      if (needsWebSearch) {
        const searchResult = await tavilySearch.search(lastUserMessage);
        if (searchResult) {
          return {
            message: {
              role: "assistant",
              content: `[ORBIS Web Analysis]:\n${searchResult}`,
            },
            provider: { name: "ORBIS Brain (Web)", type: "WEB_SEARCH" },
          };
        }
      }

      // ---------------------------------------------------------
      // STEP 3: INDEPENDENT AI (OLLAMA)
      // ---------------------------------------------------------
      const activeProvider = providerManager.getActiveProvider();
      const aiMessages = [...formattedMessages];

      if (memoryContext) {
        aiMessages[aiMessages.length - 1].content +=
          `\n\n[System Note: Recall these past memories about the user if relevant: ${memoryContext}]`;
      }

      const providerResponse = await activeProvider.generateChat(aiMessages);

      // ---------------------------------------------------------
      // STEP 4: BACKGROUND LEARNING ENGINE
      // ---------------------------------------------------------
      memoryEngine
        .learnFromUser(lastUserMessage)
        .catch((err) =>
          console.warn("[ORBIS_LEARNING] Background save failed:", err.message),
        );

      return {
        message: { role: "assistant", content: providerResponse.content },
        provider: providerResponse.provider,
      };
    } catch (error) {
      console.error(
        "[AI_CHAT_SERVICE] Detailed Request failed:",
        error.message || error,
      );
      throw new Error(`Chat backend request failed: ${error.message || error}`);
    }
  }
}

module.exports = new AIChatService();
