const capabilityIntentMatcher = require("./brain/ChatCapabilityIntentMatcher.cjs");

const TEST_WORDS = /(?:\btest\b|টেস্ট|পরীক্ষা)/i;
const QUESTION_WORDS = /(?:\bquestions?\b|কোশ্চেন|প্রশ্ন)/i;
const QUESTION_REQUEST_WORDS =
  /(?:\bgive\b|\bsuggest\b|\boffer\b|দাও|দিন|দিতে|দেব|আছে|পারবে|পারব|বলুন|বলো)/i;

function isTestQuestionRequest(message) {
  const text = String(message || "").trim();
  return (
    TEST_WORDS.test(text) &&
    QUESTION_WORDS.test(text) &&
    QUESTION_REQUEST_WORDS.test(text)
  );
}

function getDirectTestQuestion(language) {
  if (language === "bn") {
    return [
      "হ্যাঁ। এই প্রশ্নটি দিয়ে আমাকে test করতে পারেন:",
      "\u201cএকটি ছোট দোকানের বিক্রি বেড়েছে, কিন্তু লাভ কমেছে। সম্ভাব্য তিনটি কারণ কী, এবং কোন তথ্য দেখে সেগুলো যাচাই করবেন?\u201d",
      "চাইলে এখন শুধু এই প্রশ্নটির উত্তর দেব।",
    ].join("\n\n");
  }

  return [
    "Yes. You can test me with this question:",
    "\u201cA small shop's sales have increased, but its profit has decreased. What are three possible reasons, and which information would you check to verify them?\u201d",
    "If you like, I can answer only that question next.",
  ].join("\n\n");
}

function createConversationPlan(message) {
  const language = capabilityIntentMatcher.detectLanguage(message);
  if (isTestQuestionRequest(message)) {
    return {
      id: "test-question-offer",
      mode: "direct",
      language,
      content: getDirectTestQuestion(language),
    };
  }

  return {
    id: "general-conversation",
    mode: "provider-assisted",
    language,
  };
}

function buildProviderPlanningInstruction(plan) {
  const language = plan?.language === "bn" ? "Bengali" : "the user's language";
  return [
    "ORBIS Brain has already classified this as a general-conversation request.",
    `Reply primarily in ${language}.`,
    "Answer the user's actual latest request only.",
    "Do not substitute a different question, task, or goal.",
    "If the user asks for a question, example, plan, or option, provide that requested item without also solving it unless they ask for the solution.",
    "Start with the shortest complete helpful answer; add detail only when the user asks for it.",
    "If an essential detail is missing, ask one short, focused follow-up question instead of guessing.",
  ].join(" ");
}

module.exports = {
  buildProviderPlanningInstruction,
  createConversationPlan,
  isTestQuestionRequest,
};
