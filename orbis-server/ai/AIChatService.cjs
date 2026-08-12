const providerManager = require("./AIProviderManager.cjs");

class AIChatService {
  async processChatRequest(rawMessages) {
    if (!Array.isArray(rawMessages)) {
      throw new Error("Invalid chat format: messages must be an array.");
    }

    const validMessages = rawMessages
      .filter(
        (m) =>
          (m?.role === "user" || m?.role === "assistant") &&
          typeof m?.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-20);

    if (validMessages.length === 0) {
      throw new Error("No valid chat message supplied.");
    }

    const formattedMessages = validMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const provider = providerManager.getActiveProvider();
      const providerResponse = await provider.generateChat(formattedMessages);

      return {
        message: {
          role: "assistant",
          content: providerResponse.content,
        },
        provider: providerResponse.provider,
      };
    } catch (error) {
      console.error("[AI_CHAT_SERVICE] Request failed:", error.message);
      throw new Error(error.message || "Chat backend request failed.");
    }
  }
}

module.exports = new AIChatService();
