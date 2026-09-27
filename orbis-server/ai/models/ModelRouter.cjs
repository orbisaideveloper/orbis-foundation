const { TASKS, modelRegistry } = require("./ModelRegistry.cjs");

const CODING_PATTERN =
  /(?:\b(?:code|coding|patch|bug|debug|function|class|repo|repository|git|javascript|typescript|python|sql|api|test|refactor|stack trace|compile|build error)\b|কোড|বাগ|ডিবাগ|রিপো|রিপোজিটরি|ফাংশন|টেস্ট|রিফ্যাক্টর|এরর|ফিক্স)/iu;

const REASONING_PATTERN =
  /(?:\b(?:analy[sz]e|reason|compare|architecture|design|plan|audit|trade-?off|root cause|why)\b|বিশ্লেষণ|তুলনা|আর্কিটেকচার|ডিজাইন|পরিকল্পনা|অডিট|কারণ|কেন)/iu;

function normalizeExplicitTask(task) {
  return Object.values(TASKS).includes(task) ? task : null;
}

function lastUserText(messages) {
  if (!Array.isArray(messages)) return "";

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }

  return "";
}

function classifyTask(messages, explicitTask, requirements = {}) {
  if (requirements.embedding === true) return TASKS.EMBEDDING;
  if (requirements.vision === true) return TASKS.VISION;

  const explicit = normalizeExplicitTask(explicitTask);
  if (explicit) return explicit;

  const text = lastUserText(messages);

  if (CODING_PATTERN.test(text)) return TASKS.CODING;
  if (REASONING_PATTERN.test(text)) return TASKS.REASONING;

  return TASKS.GENERAL_CHAT;
}

class ModelRouter {
  constructor(registry = modelRegistry) {
    this.registry = registry;
  }

  select(messages, options = {}) {
    const requirements = options.requirements || {};

    const task = classifyTask(
      messages,
      options.task,
      requirements,
    );

    const candidates = this.registry.candidatesFor({
      task,
      requiredCapabilities: Array.isArray(requirements.capabilities)
        ? requirements.capabilities
        : [],
      providerNames: Array.isArray(options.availableProviders)
        ? options.availableProviders
        : [],
      requireToolSupport: requirements.toolSupport === true,
      requireStructuredOutput: requirements.structuredOutput === true,
    });

    return {
      task,
      candidates,
      reason: candidates.length > 0
        ? "registry-match"
        : "no-compatible-model",
    };
  }
}

module.exports = {
  CODING_PATTERN,
  REASONING_PATTERN,
  ModelRouter,
  classifyTask,
  lastUserText,
  modelRouter: new ModelRouter(),
};
