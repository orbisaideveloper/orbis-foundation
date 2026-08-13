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
      console.error("[MEMORY_ENGINE_READ_ERROR] Read skipped:", dbError.message);
    }
    return { brainKnowledge: null, memoryContext: "" };
  }

  async learnFromUser(userMessage) {
    if (!pool || !userMessage || userMessage.length <= 10) return;

    console.log(`[MEMORY_ENGINE_COGNITIVE] Analyzing input: "${userMessage}"`);

    try {
      const activeProvider = providerManager.getActiveProvider();
      if (!activeProvider) throw new Error("No active AI provider configured.");

      // 🧠 ADVANCED COGNITIVE JSON PROMPT
      const extractionPrompt = [
        {
          role: "system",
          content: `You are the Core Cognitive Memory Module of ORBIS Brain. Analyze the user's message and extract permanent, personal facts (like name, age, location, preferences, relations).
          
CRITICAL RULES:
1. You MUST output ONLY a valid JSON object. No conversational text, no markdown block outside the JSON.
2. The extracted fact MUST be in the EXACT same language as the user's input (If Bengali, output Bengali).
3. The fact MUST be written in the third person (e.g., "ইউজারের নাম...", "The user likes...").
4. Auto-generate 2-3 logical tags for the data.

JSON SCHEMA:
{
  "has_memory": boolean (true if a personal fact exists, false if it's just a general question),
  "fact": "extracted statement here or null",
  "tags": ["tag1", "tag2"]
}`
        },
        { role: "user", content: userMessage },
      ];

      const response = await activeProvider.generateChat(extractionPrompt);
      let rawContent = response.content ? response.content.trim() : "";
      
      // 🛡️ JSON Parsing Safeguard (AI অনেক সময় ```json ... ``` দিয়ে দেয়)
      if (rawContent.startsWith("```json")) {
        rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
      }

      let memoryData;
      try {
        memoryData = JSON.parse(rawContent);
      } catch (parseError) {
        console.warn("[MEMORY_ENGINE_JSON_ERROR] Failed to parse AI output. Raw:", rawContent);
        return; // JSON না হলে স্কিপ করবে, ক্র্যাশ করবে না
      }

      // 🚀 THE INTELLIGENCE: Decision Making
      if (memoryData.has_memory === true && memoryData.fact) {
        const learnedFact = memoryData.fact.trim();
        const generatedTags = memoryData.tags && Array.isArray(memoryData.tags) 
            ? ["auto_learned", "user_memory", ...memoryData.tags].join(", ") 
            : "auto_learned, user_memory";

        console.log(`[MEMORY_ENGINE_COGNITIVE] Extracted Fact: "${learnedFact}" | Tags: [${generatedTags}]`);

        // Check Duplicates using SQL
        const checkQuery = `SELECT id FROM "FoundationBrainKnowledge" WHERE "content" = $1 LIMIT 1`;
        const existingResult = await pool.query(checkQuery, [learnedFact]);

        if (existingResult.rows.length === 0) {
          const id = crypto.randomUUID(); 
          const insertQuery = `
            INSERT INTO "FoundationBrainKnowledge" (id, category, content, tags, "isActive", "updatedAt")
            VALUES ($1, $2, $3, $4, $5, NOW())
          `;
          const insertValues = [id, "USER_MEMORY", learnedFact, generatedTags, true];
          
          await pool.query(insertQuery, insertValues);
          console.log(`[MEMORY_ENGINE_SUCCESS] Saved to Cognitive DB!`);
        } else {
          console.log(`[MEMORY_ENGINE_TRACE] Fact already exists in Memory.`);
        }
      } else {
         console.log(`[MEMORY_ENGINE_TRACE] No long-term memory detected in input.`);
      }
    } catch (e) {
      console.error("[MEMORY_ENGINE_FATAL] Fact Save Failed! Reason:", e.message);
    }
  }
}

module.exports = new MemoryEngine();
