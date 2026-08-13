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
      // STEP 1: ORBIS MEMORY RETRIEVAL (পড়া বা মনে করা)
      // ---------------------------------------------------------
      let brainKnowledge = null;
      let memoryContext = "";

      if (prisma) {
        try {
          // ডেটাবেস থেকে ইউজারের আগের কথা বা মেমোরি খুঁজছে
          const memories = await prisma.foundationBrainKnowledge.findMany({
            where: {
              isActive: true,
              OR: [
                { content: { contains: lowerCaseMessage } },
                { tags: { contains: "auto_learned" } },
              ],
            },
            take: 3, // সবচেয়ে প্রাসঙ্গিক ৩টি মেমোরি নেবে
          });

          if (memories && memories.length > 0) {
            memoryContext = memories.map((m) => m.content).join(" | ");
            // যদি হুবহু উত্তর মিলে যায়, তবে সরাসরি অরবিস ব্রেইন থেকে উত্তর যাবে
            const exactMatch = memories.find(
              (m) => m.content === lowerCaseMessage,
            );
            if (exactMatch) {
              brainKnowledge = exactMatch;
            }
          }
        } catch (dbError) {
          console.warn(
            "[AI_BRAIN_MEMORY] Optional read skipped:",
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
      // STEP 2: STRICT HEURISTIC ROUTING (বাগ ফিক্স: "এখনো" vs "এখন")
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

      // Strict Word Boundary Regex - শুধুমাত্র স্বাধীন শব্দ হলে কাজ করবে
      const regexPattern = new RegExp(
        `(?:^|\\s|[.,!?])(${temporalWords.join("|")})(?=\\s|[.,!?]|$)`,
        "i",
      );
      const needsWebSearch = regexPattern.test(lowerCaseMessage);

      let finalResponseContent = "";
      let providerMetadata = {};

      if (needsWebSearch) {
        const searchResult = await tavilySearch.search(lastUserMessage);
        if (searchResult) {
          finalResponseContent = `[ORBIS Web Analysis]:\n${searchResult}`;
          providerMetadata = { name: "ORBIS Brain (Web)", type: "WEB_SEARCH" };
        }
      }

      // ---------------------------------------------------------
      // STEP 3: INDEPENDENT AI (মেমোরি সহ)
      // ---------------------------------------------------------
      if (!finalResponseContent) {
        const activeProvider = providerManager.getActiveProvider();

        // যদি ব্রেইনের কাছে ইউজারের কোনো মেমোরি থাকে, তবে এআই-কে সেটা মনে করিয়ে দেওয়া হবে
        const aiMessages = [...formattedMessages];
        if (memoryContext) {
          aiMessages[aiMessages.length - 1].content +=
            `\n\n[System Note: Recall these past memories about the user if relevant: ${memoryContext}]`;
        }

        const providerResponse = await activeProvider.generateChat(aiMessages);
        finalResponseContent = providerResponse.content;
        providerMetadata = providerResponse.provider;
      }

      // ---------------------------------------------------------
      // STEP 4: ORBIS BACKGROUND LEARNING ENGINE (ডেটাবেসে সেভ করা)
      // ---------------------------------------------------------
      this._runOrbisLearningEngine(lastUserMessage).catch((err) =>
        console.warn("[ORBIS_LEARNING] Background save failed:", err.message),
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
  // THE COGNITIVE LEARNING ENGINE (ডেটাবেসে অটোমেটিক রাইট করবে)
  // ---------------------------------------------------------
  async _runOrbisLearningEngine(userMessage) {
    // ছোট শব্দ বা সাধারণ "হ্যালো" সেভ করবে না, শুধুমাত্র বড় তথ্য সেভ করবে
    if (prisma && userMessage.length > 10) {
      console.log(
        `[ORBIS_LEARNING] Analyzing user input for memory storage...`,
      );

      try {
        const activeProvider = providerManager.getActiveProvider();

        // এআই-কে দিয়ে ইউজারের কথা থেকে ফ্যাক্ট (Fact) বের করে নিচ্ছে
        const extractionPrompt = [
          {
            role: "system",
            content:
              "You are a memory extractor. If the user's message contains personal facts, names, locations, or clear preferences, extract them into a short, factual sentence. If not, reply ONLY with the word 'NONE'.",
          },
          { role: "user", content: userMessage },
        ];

        const extraction = await activeProvider.generateChat(extractionPrompt);
        const learnedFact = extraction.content
          ? extraction.content.trim()
          : "NONE";

        // যদি কোনো তথ্য পায় এবং সেটা NONE না হয়, তবে ডেটাবেসে সেভ করবে
        if (
          learnedFact !== "NONE" &&
          !learnedFact.includes("NONE") &&
          learnedFact.length > 5
        ) {
          // ডুপ্লিকেট সেভ এড়ানোর জন্য আগে চেক করছে
          const existing = await prisma.foundationBrainKnowledge.findFirst({
            where: { content: learnedFact },
          });

          if (!existing) {
            await prisma.foundationBrainKnowledge.create({
              data: {
                content: learnedFact,
                tags: "auto_learned, user_memory",
                isActive: true,
              },
            });
            console.log(
              `[ORBIS_LEARNING] SUCCESS! New memory saved to Database: ${learnedFact}`,
            );
          }
        }
      } catch (e) {
        console.warn("[ORBIS_LEARNING] Database write failed:", e.message);
      }
    }
  }
}

module.exports = new AIChatService();
