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
  console.error("[PRISMA_INIT_ERROR] Failed to initialize Prisma:", initError.message);
}

class MemoryEngine {
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
      console.error("[MEMORY_ENGINE_READ_ERROR] Read skipped:", dbError.message, dbError.stack);
    }
    return { brainKnowledge: null, memoryContext: "" };
  }

  async learnFromUser(userMessage) {
    if (!prisma || userMessage.length <= 10) return;

    console.log(`[MEMORY_ENGINE_TRACE] Analyzing input for memory extraction: "${userMessage}"`);

    try {
      const activeProvider = providerManager.getActiveProvider();
      if (!activeProvider) {
        throw new Error("No active AI provider configured for extraction.");
      }

      const extractionPrompt = [
        {
          role: "system",
          content: "You are a memory extractor. If the user's message contains personal facts, names, locations, or clear preferences, extract them into a short, factual sentence. If not, reply ONLY with the word 'NONE'.",
        },
        { role: "user", content: userMessage },
      ];

      const extraction = await activeProvider.generateChat(extractionPrompt);
      const learnedFact = extraction.content ? extraction.content.trim() : "NONE";

      if (learnedFact !== "NONE" && !learnedFact.includes("NONE") && learnedFact.length > 5) {
        console.log(`[MEMORY_ENGINE_TRACE] Extracted Fact: "${learnedFact}". Checking database...`);

        const existing = await prisma.foundationBrainKnowledge.findFirst({
          where: { content: learnedFact },
        });

        if (!existing) {
          // ⚠️ BUG FIX: 'category' ফিল্ডটি অ্যাড করা হয়েছে
          await prisma.foundationBrainKnowledge.create({
            data: {
              category: "USER_MEMORY", 
              content: learnedFact,
              tags: "auto_learned, user_memory",
              isActive: true,
            },
          });
          console.log(`[MEMORY_ENGINE_SUCCESS] New memory successfully saved to database: ${learnedFact}`);
        } else {
          console.log(`[MEMORY_ENGINE_TRACE] Memory already exists. Skipping.`);
        }
      }
    } catch (e) {
      // ⚠️ DEEP LOGGING FIX: এরর হলে বিস্তারিত রিপোর্ট দেখাবে
      console.error("\n==========================================");
      console.error("[MEMORY_ENGINE_FATAL] Fact Save Failed!");
      console.error("Reason:", e.message);
      console.error("Stack:", e.stack);
      console.error("==========================================\n");
    }
  }
}

module.exports = new MemoryEngine();
