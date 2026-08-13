const { Pool } = require("pg");
const crypto = require("crypto");
const providerManager = require("../AIProviderManager.cjs");

const connectionString = process.env.DATABASE_URL;
let pool;
if (connectionString) {
  pool = new Pool({ connectionString });
}

class MemoryEngine {
  async retrieveMemory(lowerCaseMessage) {
    if (!pool) return { brainKnowledge: null, memoryContext: "" };

    try {
      // Prisma-র findMany (contains) এর বদলে SQL ILIKE ব্যবহার করা হলো
      const query = `
        SELECT * FROM "FoundationBrainKnowledge"
        WHERE "isActive" = true
        AND ("content" ILIKE $1 OR "tags" ILIKE $2)
        LIMIT 3
      `;
      const values = [`%${lowerCaseMessage}%`, `%auto_learned%`];
      const dbResult = await pool.query(query, values);
      const memories = dbResult.rows;

      if (memories && memories.length > 0) {
        const memoryContext = memories.map((m) => m.content).join(" | ");
        const exactMatch = memories.find((m) => m.content && m.content.toLowerCase() === lowerCaseMessage.toLowerCase());
        return { brainKnowledge: exactMatch || null, memoryContext };
      }
    } catch (dbError) {
      console.error("[MEMORY_ENGINE_READ_ERROR] Read skipped:", dbError.message, dbError.stack);
    }
    return { brainKnowledge: null, memoryContext: "" };
  }

  async learnFromUser(userMessage) {
    if (!pool || !userMessage || userMessage.length <= 10) return;

    console.log(`[MEMORY_ENGINE_TRACE] Analyzing input for memory extraction: "${userMessage}"`);

    try {
      const activeProvider = providerManager.getActiveProvider();
      if (!activeProvider) {
        throw new Error("No active AI provider configured for extraction.");
      }

      // আগের প্রম্পট একদম অক্ষত রাখা হয়েছে
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

        // Prisma findFirst এর বদলে Direct SQL 
        const checkQuery = `SELECT id FROM "FoundationBrainKnowledge" WHERE "content" = $1 LIMIT 1`;
        const existingResult = await pool.query(checkQuery, [learnedFact]);

        if (existingResult.rows.length === 0) {
          // Prisma নিজে id বানাতো, এখন আমরা বানাচ্ছি
          const id = crypto.randomUUID(); 
          const insertQuery = `
            INSERT INTO "FoundationBrainKnowledge" (id, category, content, tags, "isActive", "updatedAt")
            VALUES ($1, $2, $3, $4, $5, NOW())
          `;
          const insertValues = [id, "USER_MEMORY", learnedFact, "auto_learned, user_memory", true];
          
          await pool.query(insertQuery, insertValues);
          console.log(`[MEMORY_ENGINE_SUCCESS] New memory successfully saved to database: ${learnedFact}`);
        } else {
          console.log(`[MEMORY_ENGINE_TRACE] Memory already exists. Skipping.`);
        }
      }
    } catch (e) {
      // আগের ডিপ লগিং ঠিক রাখা হয়েছে
      console.error("\n==========================================");
      console.error("[MEMORY_ENGINE_FATAL] Fact Save Failed!");
      console.error("Reason:", e.message);
      console.error("Stack:", e.stack);
      console.error("==========================================\n");
    }
  }
}

module.exports = new MemoryEngine();
