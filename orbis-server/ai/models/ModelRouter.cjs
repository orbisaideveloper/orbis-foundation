const { TASKS, modelRegistry } = require("./ModelRegistry.cjs");
const {
  stripNegatedTaskActions,
} = require("../brain/RepositoryExecutionMode.cjs");

const CODING_PATTERN =
  /(?:\b(?:code|coding|patch|bug|debug|function|class|repo|repository|git|javascript|typescript|python|sql|api|test|refactor|stack trace|compile|build error)\b|কোড|বাগ|ডিবাগ|রিপো|রিপোজিটরি|ফাংশন|টেস্ট|রিফ্যাক্টর|এরর|ফিক্স)/iu;

const ENGLISH_CAPABILITY_CUE_PATTERN =
  /\b(?:(?:can|could)\s+you|are\s+you\s+(?:able|capable)|do\s+you\s+know)\b/iu;

const BANGLISH_CAPABILITY_CUE_PATTERN =
  /\b(?:tumi|apni|tomra|apnara)\b.{0,80}\b(?:paro|paren|parba|parben|jano|janen)\b/iu;

const BENGALI_CAPABILITY_CUE_PATTERN =
  /(?:তুমি|আপনি|তোমরা|আপনারা).{0,80}(?:পারো|পারেন|পারবে|পারবেন|জানো|জানেন|সক্ষম)/iu;

const CONCRETE_TASK_REFERENCE_PATTERN =
  /(?:\b(?:this|that|these|those|my|our|attached|following|ei|eta|amar|amader)\b|এই|এটা|এটি|ওটা|আমার|আমাদের|সংযুক্ত|নিচের)/iu;

const TASK_ACTION_PATTERN =
  /(?:\b(?:fix|debug|patch|write|create|modify|review|test|run|verify|change|update|implement|refactor)\b|ফিক্স|ডিবাগ|প্যাচ|লিখ|তৈরি|বদল|রিভিউ|টেস্ট|চালাও|ভেরিফাই|যাচাই|আপডেট|ইমপ্লিমেন্ট|রিফ্যাক্টর|সংশোধন|ঠিক\s+কর(?:ো|ে\s+দাও|ে\s+দিন))/iu;

function isConcreteCodingTask(text) {
  const value =
    stripNegatedTaskActions(
      String(text || "").trim(),
    );

  return (
    CODING_PATTERN.test(value) &&
    TASK_ACTION_PATTERN.test(value)
  );
}

function isCapabilityQuestion(text) {
  const value =
    String(text || "").trim();

  const hasCapabilityCue =
    ENGLISH_CAPABILITY_CUE_PATTERN.test(
      value,
    ) ||
    BANGLISH_CAPABILITY_CUE_PATTERN.test(
      value,
    ) ||
    BENGALI_CAPABILITY_CUE_PATTERN.test(
      value,
    );

  if (!hasCapabilityCue) {
    return false;
  }

  const actionText =
    stripNegatedTaskActions(
      value,
    );

  const hasConcreteTask =
    CONCRETE_TASK_REFERENCE_PATTERN.test(
      actionText,
    ) &&
    TASK_ACTION_PATTERN.test(
      actionText,
    );

  return !hasConcreteTask;
}

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

  if (isCapabilityQuestion(text)) {
    return TASKS.GENERAL_CHAT;
  }

  if (isConcreteCodingTask(text)) return TASKS.CODING;
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
