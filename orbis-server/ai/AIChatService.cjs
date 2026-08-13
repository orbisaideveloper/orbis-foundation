const providerManager = require("./AIProviderManager.cjs");
const tavilySearch = require("./tools/TavilySearch.cjs");
const memoryEngine = require("./brain/MemoryEngine.cjs");

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
