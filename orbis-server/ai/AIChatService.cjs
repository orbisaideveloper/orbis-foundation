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

    if (validMessages.length === 0) throw new Error("No valid messages found.");

    const formattedMessages = validMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const lastUserMessage =
      formattedMessages[formattedMessages.length - 1].content;
    const lowerCaseMessage = lastUserMessage.toLowerCase();

    let currentStep = "Initializing request";

    try {
      // ১. ORBIS Brain - DIRECT SQL (Prisma-কে পুরোপুরি বাইপাস করা হলো!)
      currentStep = "Executing Direct SQL Query (Bypassing Prisma completely)";

      let allKnowledge = [];
      try {
        const dbResult = await pool.query(
          'SELECT * FROM "FoundationBrainKnowledge"',
        );
        allKnowledge = dbResult.rows;
      } catch (sqlError) {
        throw new Error(`SQL DB Error: ${sqlError.message}`);
      }

      currentStep = "Scanning memory for matches";
      const brainKnowledge = allKnowledge.find(
        (k) =>
          k.isActive === true &&
          ((k.content && k.content.toLowerCase().includes(lowerCaseMessage)) ||
            (k.tags && k.tags.toLowerCase().includes(lowerCaseMessage))),
      );

      if (brainKnowledge) {
        return {
          message: { role: "assistant", content: brainKnowledge.content },
          provider: { name: "ORBIS Brain", type: "INTERNAL_MEMORY" },
        };
      }

      // ২. Web Search Orchestration (Tavily)
      currentStep = "Analyzing keywords for Web Search (Tavily)";
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
        currentStep = "Fetching live data from Tavily API";
        const searchResult = await tavilySearch.search(lastUserMessage);
        if (searchResult) {
          webContext = `\n\n[Real-time Web Context: ${searchResult}]\n\n(Use the above web context to answer the user's question accurately.)`;
          usedWebSearch = true;
        }
      }

      // ৩. External AI Provider
      currentStep = "Preparing messages for External AI Provider";
      const messagesForAI = [...formattedMessages];
      if (usedWebSearch) {
        messagesForAI[messagesForAI.length - 1].content += webContext;
      }

      currentStep = "Connecting to Default AI Provider";
      const provider = providerManager.getDefaultProvider();
      if (!provider)
        throw new Error("No Default AI Provider configured in the system.");

      currentStep = "Generating response from AI Provider";
      const providerResponse = await provider.generateChat(messagesForAI);

      currentStep = "Formatting Final Response";
      if (usedWebSearch && providerResponse && providerResponse.provider) {
        providerResponse.provider.type = "WEB_SEARCH_AUGMENTED";
        providerResponse.provider.name = `${providerResponse.provider.name} + Tavily`;
      }

      return {
        message: { role: "assistant", content: providerResponse.content },
        provider:
          providerResponse && providerResponse.provider
            ? providerResponse.provider
            : { name: "System Provider", type: "EXTERNAL" },
      };
    } catch (error) {
      console.error(
        `[AI_CHAT_SERVICE] Failed at step: ${currentStep}. Error:`,
        error.stack || error.message,
      );
      throw new Error(
        `[Admin Diagnostic] Failed during: '${currentStep}'. Exact Reason: ${error.message}`,
      );
    }
  }
}

module.exports = new AIChatService();
