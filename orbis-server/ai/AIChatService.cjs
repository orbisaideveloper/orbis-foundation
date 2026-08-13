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

    // ১. ORBIS Brain (Local Database Check) - ISOLATED & FAIL-SAFE
    let brainKnowledge = null;
    if (prisma) {
      try {
        brainKnowledge = await prisma.foundationBrainKnowledge.findFirst({
          where: {
            isActive: true,
            OR: [
              { content: { contains: lastUserMessage.toLowerCase() } },
              { tags: { contains: lastUserMessage.toLowerCase() } },
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

    // Main Chat Orchestration with Autonomous Agentic Router & Exact Error Reporting
    try {
      const activeProvider = providerManager.getActiveProvider();

      // ২. Autonomous Agentic Router (এআই নিজে ডিসিশন নেবে ইন্টারনেট লাগবে কি না)
      let searchContext = "";
      try {
        const routerMessages = [
          {
            role: "system",
            content:
              "You are an AI decision router. Analyze the user's latest query. Does it require real-time current news, live prices, or live web search to answer accurately? Answer ONLY with 'YES' or 'NO'.",
          },
          {
            role: "user",
            content: lastUserMessage,
          },
        ];

        const routerResponse =
          await activeProvider.generateChat(routerMessages);
        const decision = routerResponse.content
          ? routerResponse.content.trim().toUpperCase()
          : "NO";

        if (decision.includes("YES")) {
          const searchResult = await tavilySearch.search(lastUserMessage);
          if (searchResult) {
            searchContext = `\n\n[Real-time Web Context Retrieved via Tavily]:\n${searchResult}\n\n`;
          }
        }
      } catch (routerError) {
        console.warn(
          "[AGENTIC_ROUTER] Router evaluation skipped:",
          routerError.message,
        );
      }

      // ৩. Final Prompt Construction with Dynamic Web Context
      const finalMessages = [...formattedMessages];
      if (searchContext) {
        finalMessages[finalMessages.length - 1].content += searchContext;
      }

      const providerResponse = await activeProvider.generateChat(finalMessages);

      return {
        message: { role: "assistant", content: providerResponse.content },
        provider: providerResponse.provider,
      };
    } catch (error) {
      // ⚠️ এক্সাক্ট এরর মেসেজটি লগ এবং ফ্রন্টএন্ড রেসপন্সে পাঠানোর ব্যবস্থা
      console.error(
        "[AI_CHAT_SERVICE] Detailed Request failed:",
        error.message || error,
      );
      throw new Error(`Chat backend request failed: ${error.message || error}`);
    }
  }
}

module.exports = new AIChatService();
