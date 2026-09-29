const { z } = require("zod");
const {
  TASKS,
} = require("../models/ModelRegistry.cjs");

const MAX_CONTEXT_MESSAGES = 8;
const MAX_CONTEXT_CHARS = 4_000;

const INTERACTIONS = Object.freeze([
  "conversation",
  "capability-question",
  "task-request",
  "analysis-request",
]);

const RESPONSE_LANGUAGES = Object.freeze([
  "bn",
  "en",
  "same",
]);

const ROUTABLE_TASKS = Object.freeze([
  TASKS.GENERAL_CHAT,
  TASKS.CODING,
  TASKS.REASONING,
]);

const SemanticIntentSchema = z
  .object({
    task: z.enum(ROUTABLE_TASKS),
    interaction: z.enum(INTERACTIONS),
    responseLanguage: z.enum(RESPONSE_LANGUAGES),
    confidence: z.enum(["high", "medium", "low"]),
    clarificationRequired: z.boolean(),
  })
  .strict();

const CONDUCTOR_SYSTEM_PROMPT = [
  "You are ORBIS Conductor, a routing classifier.",
  "Return ONLY one JSON object and no markdown.",
  "Classify meaning, not isolated keywords.",
  "You may choose only general-chat, coding, or reasoning.",
  "Never request or select tools, files, shell commands,",
  "capabilities, approvals, web search, or repository actions.",
  "A question about whether ORBIS can code or perform a skill",
  "is a capability-question and general-chat, not a coding task.",
  "Use coding only when the user is actually asking to write,",
  "fix, debug, review, test, or modify code.",
  "Use reasoning when the user asks for analysis, comparison,",
  "planning, auditing, diagnosis, root cause, or trade-offs.",
  "A Bengali request such as বিশ্লেষণ করে বলো, কত এবং কেন",
  "is reasoning plus analysis-request, not ordinary conversation.",
  "Use general-chat for ordinary conversation, explanations,",
  "capability questions, and requests that do not require the",
  "coding or reasoning specialist.",
  "responseLanguage must be bn when the user asks for Bengali",
  "or is clearly communicating in Bengali/Banglish; en when",
  "English is requested; otherwise same.",
  "Set clarificationRequired true only when the requested task",
  "cannot be determined safely from the conversation.",
  'Schema: {"task":"general-chat|coding|reasoning",',
  '"interaction":"conversation|capability-question|task-request|analysis-request",',
  '"responseLanguage":"bn|en|same",',
  '"confidence":"high|medium|low",',
  '"clarificationRequired":true|false}.',
].join(" ");

function normalizeFallbackTask(task) {
  return ROUTABLE_TASKS.includes(task)
    ? task
    : TASKS.GENERAL_CHAT;
}

function fallbackIntent(task) {
  return {
    task: normalizeFallbackTask(task),
    interaction: "conversation",
    responseLanguage: "same",
    confidence: "low",
    clarificationRequired: false,
    source: "deterministic-fallback",
  };
}

function stabilizeSemanticIntent(
  intent,
  fallbackTask,
) {
  if (
    fallbackTask === TASKS.REASONING &&
    intent.task === TASKS.GENERAL_CHAT &&
    intent.interaction === "conversation"
  ) {
    return {
      ...intent,
      task: TASKS.REASONING,
      interaction: "analysis-request",
    };
  }

  return intent;
}

function boundedConversation(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(
      (message) =>
        (message?.role === "user" ||
          message?.role === "assistant") &&
        typeof message?.content === "string",
    )
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content
        .trim()
        .slice(0, MAX_CONTEXT_CHARS),
    }))
    .filter((message) => message.content.length > 0);
}

function stripJsonFence(content) {
  const text = String(content || "").trim();

  if (
    text.startsWith("```json") &&
    text.endsWith("```")
  ) {
    return text.slice(7, -3).trim();
  }

  if (
    text.startsWith("```") &&
    text.endsWith("```")
  ) {
    return text.slice(3, -3).trim();
  }

  return text;
}

function parseSemanticIntent(content) {
  const raw = stripJsonFence(content);
  if (!raw) return null;

  try {
    return SemanticIntentSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

class SemanticIntentConductor {
  constructor({ generate } = {}) {
    this.generate = generate;
  }

  async interpret(
    messages,
    {
      fallbackTask = TASKS.GENERAL_CHAT,
      timeoutMs = 8_000,
    } = {},
  ) {
    const fallback = fallbackIntent(fallbackTask);
    const conversation = boundedConversation(messages);

    if (
      conversation.length === 0 ||
      typeof this.generate !== "function"
    ) {
      return fallback;
    }

    try {
      const response = await this.generate(
        [
          {
            role: "system",
            content: CONDUCTOR_SYSTEM_PROMPT,
          },
          ...conversation,
        ],
        { timeoutMs },
      );

      const parsed = parseSemanticIntent(
        response?.content,
      );

      if (!parsed) return fallback;

      const stabilized =
        stabilizeSemanticIntent(
          parsed,
          fallbackTask,
        );

      return {
        ...stabilized,
        source: "semantic-model",
      };
    } catch {
      return fallback;
    }
  }
}

module.exports = {
  CONDUCTOR_SYSTEM_PROMPT,
  INTERACTIONS,
  MAX_CONTEXT_CHARS,
  MAX_CONTEXT_MESSAGES,
  RESPONSE_LANGUAGES,
  ROUTABLE_TASKS,
  SemanticIntentConductor,
  SemanticIntentSchema,
  boundedConversation,
  fallbackIntent,
  parseSemanticIntent,
  stabilizeSemanticIntent,
  stripJsonFence,
};
