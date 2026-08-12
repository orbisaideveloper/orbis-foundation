const { PrismaClient } = require("@prisma/client");
const providerManager = require("./AIProviderManager.cjs");
const prisma = new PrismaClient();

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
      formattedMessages[formattedMessages.length - 1].content.toLowerCase();

    try {
      // ১. ORBIS Brain (Memory & Knowledge Check)
      const brainKnowledge = await prisma.foundationBrainKnowledge.findFirst({
        where: {
          isActive: true,
          OR: [
            { content: { contains: lastUserMessage } },
            { tags: { contains: lastUserMessage } },
          ],
        },
      });

      // ২. যদি ব্রেইন উত্তর জানে
      if (brainKnowledge) {
        return {
          message: { role: "assistant", content: brainKnowledge.content },
          provider: { name: "ORBIS Brain", type: "INTERNAL_MEMORY" },
        };
      }

      // ৩. যদি না জানে, তবে প্রোভাইডারের কাছে পাঠানো (Ollama/Gemini)
      const provider = providerManager.getActiveProvider();
      const providerResponse = await provider.generateChat(formattedMessages);

      return {
        message: { role: "assistant", content: providerResponse.content },
        provider: providerResponse.provider, // অ্যাডমিন ড্যাশবোর্ডে এটি দেখা যাবে
      };
    } catch (error) {
      console.error("[AI_CHAT_SERVICE] Request failed:", error.message);
      throw new Error("Chat backend request failed.");
    }
  }
}

module.exports = new AIChatService();
