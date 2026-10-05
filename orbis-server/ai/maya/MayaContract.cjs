const { z } = require("zod");

const MAYA_CONTRACT_VERSION = "maya.v1";
const MAYA_CAPABILITIES = Object.freeze([
  "dream.analysis",
  "astro.interpretation",
  "general.chat",
]);
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_RESPONSE_BYTES = 48 * 1024;
const nonEmptyText = (limit) => z.string().trim().min(1).max(limit);
const language = z.enum(["bn", "en", "hi"]);
const optionalText = nonEmptyText(500).optional();
const requestBase = {
  version: z.literal(MAYA_CONTRACT_VERSION),
  language,
};
const message = z.object({
  role: z.enum(["user", "assistant"]),
  content: nonEmptyText(4000),
}).strict();
const chatMessages = z.array(message).min(1).max(12).refine(
  (messages) => messages.every((item, index) =>
    item.role === (index % 2 === 0 ? "user" : "assistant"),
  ) && messages.at(-1).role === "user",
);
const requestSchema = z.discriminatedUnion("capability", [
  z.object({
    ...requestBase,
    capability: z.literal("dream.analysis"),
    input: z.object({
      dream: nonEmptyText(8000),
      title: optionalText,
      context: optionalText,
      emotion: optionalText,
    }).strict(),
  }).strict(),
  z.object({
    ...requestBase,
    capability: z.literal("general.chat"),
    input: z.object({ messages: chatMessages }).strict(),
  }).strict(),
]);

const textList = z.array(nonEmptyText(500)).min(1).max(12);
const dreamResultSchema = z.object({
  symbols: textList,
  themes: textList,
  emotions: textList,
  interpretation: nonEmptyText(6000),
  reflectionQuestions: z.array(nonEmptyText(500)).min(1).max(5),
}).strict();
const chatResultSchema = z.object({
  reply: nonEmptyText(8000),
}).strict();

function withinByteLimit(value, limit) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= limit;
  } catch {
    return false;
  }
}

function validateMayaRequest(body) {
  if (!withinByteLimit(body, MAX_REQUEST_BYTES)) {
    return { valid: false, code: "MAYA_REQUEST_TOO_LARGE" };
  }
  if (body?.capability === "astro.interpretation") {
    return { valid: false, code: "MAYA_ASTRO_NOT_READY" };
  }
  const parsed = requestSchema.safeParse(body);
  return parsed.success
    ? { valid: true, data: parsed.data }
    : { valid: false, code: "MAYA_INPUT_INVALID" };
}

function validateMayaResult(capability, value) {
  if (!withinByteLimit(value, MAX_RESPONSE_BYTES)) {
    return { valid: false, code: "MAYA_RESULT_INVALID" };
  }
  const schemas = {
    "dream.analysis": dreamResultSchema,
    "general.chat": chatResultSchema,
  };
  const schema = Object.hasOwn(schemas, capability) && schemas[capability];
  if (!schema) return { valid: false, code: "MAYA_RESULT_INVALID" };
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { valid: true, data: parsed.data }
    : { valid: false, code: "MAYA_RESULT_INVALID" };
}

module.exports = {
  MAYA_CONTRACT_VERSION,
  MAYA_CAPABILITIES,
  validateMayaRequest,
  validateMayaResult,
};
