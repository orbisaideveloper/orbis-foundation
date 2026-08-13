const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");
const { PrismaPg } = require("@prisma/adapter-pg");
const providerManager = require("../AIProviderManager.cjs");

const connectionString = process.env.DATABASE_URL;
let prisma;

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

class MemoryEngine {
  // ১. মেমোরি খোঁজার কাজ (ভবিষ্যতে এখানে Vector Search বসবে)
  async retrieveMemory(lowerCaseMessage) {
    if (!prisma) return { brainKnowledge: null, memoryContext: "" };

    try {
      const memories = await prisma.foundationBrainKnowledge.findMany({
        where: {
          isActive: true,
          OR: [
            { content: { contains: lowerCaseMessage } },
            { tags: { contains: "auto_learned" } },
          ],
        },
        take: 3,
      });

      if (memories && memories.length > 0) {
        const memoryContext = memories.map((m) => m.content).join(" | ");
        const exactMatch = memories.find((m) => m.content === lowerCaseMessage);
        return { brainKnowledge: exactMatch || null, memoryContext };
      }
    } catch (dbError) {
      console.warn("[MEMORY_ENGINE] Read skipped:", dbError.message);
    }
    return { brainKnowledge: null, memoryContext: "" };
  }

  // ২. নতুন কিছু শেখার কাজ (Background Processor)
  async learnFromUser(userMessage) {
    if (!prisma || userMessage.length <= 10) return;

    console.log(`[MEMORY_ENGINE] Analyzing input: "${userMessage}"`);
    try {
      const activeProvider = providerManager.getActiveProvider();
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

      if (
        learnedFact !== "NONE" &&
        !learnedFact.includes("NONE") &&
        learnedFact.length > 5
      ) {
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
            `[MEMORY_ENGINE] SUCCESS! New memory saved: ${learnedFact}`,
          );
        }
      }
    } catch (e) {
      console.warn("[MEMORY_ENGINE] Write failed:", e.message);
    }
  }
}

module.exports = new MemoryEngine();
