const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const providerManager = require("./AIProviderManager.cjs");
const tavilySearch = require("./tools/TavilySearch.cjs");

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg({ pool });
const prisma = new PrismaClient({ adapter });

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
      // ১. ORBIS Brain (Local Database Check)
      const brainKnowledge = await prisma.foundationBrainKnowledge.findFirst({
        where: {
          isActive: true,
          OR: [
            { content: { contains: lowerCaseMessage } },
            { tags: { contains: lowerCaseMessage } },
          ],
        },
      });

      if (brainKnowledge) {
        return {
          message: { role: "assistant", content: brainKnowledge.content },
          provider: { name: "ORBIS Brain", type: "INTERNAL_MEMORY" },
        };
      }

      // ২. Web Search Orchestration (Tavily)
      let webContext = "";
      let usedWebSearch = false;

      const searchKeywords = [
        "what",
        "who",
        "latest",
        "update",
        "news",
        "price",
        "খবর",
        "কে",
        "কী",
        "কি",
        "বর্তমান",
        "আজকের",
        "এখন",
      ];
      const needsSearch = searchKeywords.some((kw) =>
        lowerCaseMessage.includes(kw),
      );

      if (needsSearch) {
        const searchResult = await tavilySearch.search(lastUserMessage);
        if (searchResult) {
          webContext = `\n\n[Real-time Web Context: ${searchResult}]\n\n(Use the above web context to answer the user's question accurately. Reply in the user's language.)`;
          usedWebSearch = true;
        }
      }

      // ৩. External AI Provider (Ollama/Gemini)
      const messagesForAI = [...formattedMessages];
      if (usedWebSearch) {
        messagesForAI[messagesForAI.length - 1].content += webContext;
      }

      // ⚠️ ভুলটি এখানে ছিল! getActiveProvider() এর বদলে getDefaultProvider() হবে
      const provider = providerManager.getDefaultProvider();
      const providerResponse = await provider.generateChat(messagesForAI);

      if (usedWebSearch) {
        providerResponse.provider.type = "WEB_SEARCH_AUGMENTED";
        providerResponse.provider.name = `${providerResponse.provider.name} + Tavily`;
      }

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
