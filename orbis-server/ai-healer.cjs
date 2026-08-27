const readline = require("node:readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const MODEL_NAME = "qwen2.5"; // আপনি চাইলে এখানে 'twin-llama' দিতে পারেন
const MAX_AI_SUGGESTION_LENGTH = 4_000;

async function askAI(promptText) {
  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: promptText,
        stream: false,
      }),
    });
    const data = await response.json();
    return data.response;
  } catch {
    console.error("[AI Healer] Unable to request an AI suggestion.");
    return null;
  }
}

function formatAiSuggestionForTerminal(value) {
  if (typeof value !== "string") return null;
  const safeText = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "")
    .trim();
  return safeText ? safeText.slice(0, MAX_AI_SUGGESTION_LENGTH) : null;
}

function displayAiSuggestion(suggestion) {
  process.stdout.write(`\n💡 [AI Suggestion]:\n\x1b[36m${suggestion}\x1b[0m\n\n`);
}

async function runHealer() {
  const errorType = process.argv[2] || "Unknown Error";
  console.log(`\n🤖 [AI Healer] জেগে উঠেছে! স্ক্যান করছে: ${errorType}...`);

  // এআই-এর কাছে প্রম্পট পাঠানো
  const prompt = `You are an expert Senior System Architect. A pre-commit hook failed with this issue type: ${errorType}. 
    Analyze briefly what usually causes this in a React/Node.js project and give a 2-sentence precise solution.`;

  const aiSuggestion = formatAiSuggestionForTerminal(await askAI(prompt));

  if (!aiSuggestion) {
    console.log(
      "❌ [AI Healer] Ollama মডেল এখন ঘুমাচ্ছে (Not Running) অথবা কানেকশন ফেইল করেছে। দয়া করে ম্যানুয়ালি ফিক্স করুন।",
    );
    process.exit(1);
  }

  displayAiSuggestion(aiSuggestion);

  rl.question(
    "❓ আপনি কি এআই-এর এই সাজেশন অনুযায়ী কোড মডিফাই করতে চান? (Y/N): ",
    (answer) => {
      if (answer.toLowerCase() === "y") {
        console.log(
          "🚀 [AI Healer] অটো-ইমপ্লিমেন্টেশন প্রসেস শুরু হচ্ছে... (Future Update: Direct File Write)",
        );
        // এখানেই এআই সরাসরি ফাইল রাইট করবে (ভবিষ্যতের আপডেটে এটি যোগ করা হবে)
        process.exit(0);
      } else {
        console.log("🚫 [AI Healer] অটো-ফিক্স বাতিল করা হলো। কোড সেভ আছে।");
        process.exit(1);
      }
      rl.close();
    },
  );
}

runHealer();
