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

    // ১. ORBIS Brain (Local Database Check) - ISOLATED & FAIL-SAFE
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

    // Main Chat Orchestration
    try {
      // ২. ORBIS Brain Web Search (Tavily)
      const searchKeywords = [
        "latest",
        "update",
        "news",
        "price",
        "recent",
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
      const needsSearch = searchKeywords.some((kw) =>
        lowerCaseMessage.includes(kw),
      );

      if (needsSearch) {
        const searchResult = await tavilySearch.search(lastUserMessage);
        if (searchResult) {
          return {
            message: { role: "assistant", content: searchResult },
            provider: { name: "ORBIS Brain (Web)", type: "WEB_SEARCH" },
          };
        }
      }

      // ৩. External Independent AI (Ollama/Gemini)
      const provider = providerManager.getActiveProvider();
      const providerResponse = await provider.generateChat(formattedMessages);

      return {
        message: { role: "assistant", content: providerResponse.content },
        provider: providerResponse.provider,
      };
    } catch (error) {
      console.error("[AI_CHAT_SERVICE] Request failed:", error.message);
      throw new Error("Chat backend request failed.");
    }
  }
}

module.exports = new AIChatService();
