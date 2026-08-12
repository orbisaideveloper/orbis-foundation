const { Pool } = require("pg");
const providerManager = require("./AIProviderManager.cjs");
const tavilySearch = require("./tools/TavilySearch.cjs");

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

const SEARCH_KEYWORDS = [
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

function validateMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) {
    throw new Error("Invalid chat format.");
  }

  const validMessages = rawMessages
    .filter(
      (message) =>
        (message?.role === "user" || message?.role === "assistant") &&
        typeof message?.content === "string",
    )
    .slice(-20);

  if (validMessages.length === 0) {
    throw new Error("No valid messages found.");
  }

  return validMessages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function fetchBrainKnowledge(message) {
  try {
    const result = await pool.query('SELECT * FROM "FoundationBrainKnowledge"');

    const lowerCaseMessage = message.toLowerCase();

    return result.rows.find(
      (knowledge) =>
        knowledge.isActive === true &&
        ((knowledge.content &&
          knowledge.content.toLowerCase().includes(lowerCaseMessage)) ||
          (knowledge.tags &&
            knowledge.tags.toLowerCase().includes(lowerCaseMessage))),
    );
  } catch (error) {
    console.log("SQL skipped:", error.message);
    return null;
  }
}

function requiresWebSearch(message) {
  const lowerCaseMessage = message.toLowerCase();
  return SEARCH_KEYWORDS.some((keyword) => lowerCaseMessage.includes(keyword));
}

async function getWebContext(message) {
  if (!requiresWebSearch(message)) {
    return { context: "", used: false };
  }

  try {
    const searchResult = await tavilySearch.search(message);

    if (!searchResult) {
      return { context: "", used: false };
    }

    return {
      context: `\n\n[Real-time Web Context: ${searchResult}]\n\n(Use the above web context to answer the user's question accurately.)`,
      used: true,
    };
  } catch (error) {
    console.log("Tavily skip:", error.message);
    return { context: "", used: false };
  }
}

function buildProviderMessages(messages, webContext) {
  if (!webContext) {
    return [...messages];
  }

  const providerMessages = [...messages];
  const lastIndex = providerMessages.length - 1;

  providerMessages[lastIndex] = {
    ...providerMessages[lastIndex],
    content: providerMessages[lastIndex].content + webContext,
  };

  return providerMessages;
}

function normalizeProviderResponse(providerResponse, usedWebSearch) {
  const provider = providerResponse?.provider
    ? { ...providerResponse.provider }
    : { name: "System Provider", type: "EXTERNAL" };

  if (usedWebSearch) {
    provider.type = "WEB_SEARCH_AUGMENTED";
    provider.name = `${provider.name} + Tavily`;
  }

  return {
    message: {
      role: "assistant",
      content: providerResponse?.content || "",
    },
    provider,
  };
}

async function generateExternalResponse(messages) {
  const webResult = await getWebContext(messages[messages.length - 1].content);

  const messagesForAI = buildProviderMessages(messages, webResult.context);

  const provider = providerManager.getActiveProvider();

  if (!provider) {
    throw new Error("No AI Provider configured.");
  }

  const providerResponse = await provider.generateChat(messagesForAI);

  return normalizeProviderResponse(providerResponse, webResult.used);
}

class AIChatService {
  async processChatRequest(rawMessages) {
    const messages = validateMessages(rawMessages);
    const lastUserMessage = messages[messages.length - 1].content;
    let currentStep = "Initializing request";

    try {
      currentStep = "Fetching ORBIS Brain memory";
      const brainKnowledge = await fetchBrainKnowledge(lastUserMessage);

      if (brainKnowledge) {
        return {
          message: {
            role: "assistant",
            content: brainKnowledge.content,
          },
          provider: {
            name: "ORBIS Brain",
            type: "INTERNAL_MEMORY",
          },
        };
      }

      currentStep = "Preparing External AI Provider";
      currentStep = "Connecting to AI Provider";

      return await generateExternalResponse(messages);
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
