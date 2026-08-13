const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const providerManager = require("./AIProviderManager.cjs");
const tavilySearch = require("./tools/TavilySearch.cjs");

const connectionString = process.env.DATABASE_URL;
let prisma;

// Prisma Initialization (Fail-Safe)
try {
  if (connectionString) {
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg({ pool });
    prisma = new PrismaClient({ adapter });
  } else {
    prisma = new PrismaClient();
  }
} catch (initError) {
  console.warn("[PRISMA_INIT] Failed to initialize Prisma:", initError.message);
}

class AIChatService {
  async processChatRequest(rawMessages, sessionId = "default-user") {
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
      // STEP 1: ORBIS FIRST (Local Memory Check)
      // ---------------------------------------------------------
      let brainKnowledge = null;
      if (prisma) {
        try {
          brainKnowledge = await prisma.foundationBrainKnowledge.findFirst({
            where: {
              isActive: true,
              OR: [
                { content: { contains: lowerCaseMessage } },
                { tags: { contains: lowerCaseMessage } },
              ],
            },
          });
        } catch (dbError) {
          console.warn(
            "[AI_BRAIN_MEMORY] Optional lookup skipped:",
            dbError.message,
          );
        }
      }

      if (brainKnowledge) {
        return {
          message: { role: "assistant", content: brainKnowledge.content },
          provider: { name: "ORBIS Brain", type: "INTERNAL_MEMORY" },
        };
      }

      // ---------------------------------------------------------
      // STEP 2: FAST HEURISTIC ROUTING (ORBIS + TAVILY DIRECT)
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
      const needsWebSearch = temporalWords.some((kw) =>
        lowerCaseMessage.includes(kw),
      );

      let finalResponseContent = "";
      let providerMetadata = {};

      if (needsWebSearch) {
        const searchResult = await tavilySearch.search(lastUserMessage);
        if (searchResult) {
          // ORBIS নিজেই Tavily এর ডেটা প্রসেস করে দিচ্ছে (No Ollama)
          finalResponseContent = `[ORBIS Web Analysis]:\n${searchResult}`;
          providerMetadata = { name: "ORBIS Brain (Web)", type: "WEB_SEARCH" };
        }
      }

      // ---------------------------------------------------------
      // STEP 3: INDEPENDENT OLLAMA (No Web, Pure AI)
      // ---------------------------------------------------------
      if (!finalResponseContent) {
        const activeProvider = providerManager.getActiveProvider();
        const providerResponse =
          await activeProvider.generateChat(formattedMessages);

        finalResponseContent = providerResponse.content;
        providerMetadata = providerResponse.provider;
      }

      // ---------------------------------------------------------
      // STEP 4: ORBIS BACKGROUND OBSERVER & ANALYZER (No Await)
      // ---------------------------------------------------------
      // এটি ব্যাকগ্রাউন্ডে রান করবে যাতে ইউজারের রেসপন্স মিলি-সেকেন্ডেও স্লো না হয়
      this._runOrbisObserver(
        lastUserMessage,
        finalResponseContent,
        providerMetadata.name,
      ).catch((err) =>
        console.warn(
          "[ORBIS_OBSERVER] Background analysis failed:",
          err.message,
        ),
      );

      return {
        message: { role: "assistant", content: finalResponseContent },
        provider: providerMetadata,
      };
    } catch (error) {
      console.error(
        "[AI_CHAT_SERVICE] Detailed Request failed:",
        error.message || error,
      );
      throw new Error(`Chat backend request failed: ${error.message || error}`);
    }
  }

  // ---------------------------------------------------------
  // THE OBSERVER: ORBIS-এর নিজস্ব চিন্তাধারা এবং প্যাটার্ন অ্যানালিসিস ইঞ্জিন
  // ---------------------------------------------------------
  async _runOrbisObserver(userMessage, responseContent, providerName) {
    console.log(
      `[ORBIS_OBSERVER] Observing interaction with provider: ${providerName}`,
    );

    // ORBIS ব্যাকগ্রাউন্ডে চেক করছে যে উত্তরটি ঠিকঠাক জেনারেট হলো কি না
    const wordCount = responseContent.split(" ").length;
    let analysisTag = "neutral_pattern";

    if (providerName.includes("Web") && wordCount > 10) {
      analysisTag = "live_data_extracted";
    } else if (
      providerName.includes("Ollama") ||
      providerName.includes("Gemini")
    ) {
      analysisTag = "independent_ai_generation";
    }

    if (prisma) {
      try {
        // ভবিষ্যতে এই জায়গাটিতে আমরা ইউজারের কনটেক্সট এবং মেমোরি ডেটাবেসে পুশ করব
        // আপাতত এটি টার্মিনালে নিজের অ্যানালিসিস লগ করছে
        console.log(
          `[ORBIS_OBSERVER] Analysis Complete: Pattern=[${analysisTag}], Query Length=[${userMessage.length}]`,
        );
      } catch (e) {
        // সাইলেন্ট ফেল-সেফ
      }
    }
  }
}

module.exports = new AIChatService();
