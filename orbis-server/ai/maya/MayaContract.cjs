const { z } = require("zod");

const MAYA_CONTRACT_VERSION = "maya.v1";
const MAYA_CAPABILITIES = Object.freeze([
  "dream.analysis",
  "astro.interpretation",
  "general.chat",
]);
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
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
const planetIds = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"];
const angle = z.number().finite().min(0).lt(360);
const planet = z.object({
  id: z.enum(planetIds), longitude: angle, sign: z.number().int().min(0).max(11),
  degree: z.number().finite().min(0).lt(30), house: z.number().int().min(1).max(12),
  retrograde: z.boolean(),
}).strict();
const chartFacts = z.object({
  utc: z.string().datetime(), ascendant: angle, ayanamsa: angle,
  engine: z.literal("Astronomy Engine 2.1.19"),
  method: z.literal("Lahiri J2000 anchor; IERS UTC/TT (1972+); whole-sign; true-frame mean nodes"),
  timePolicy: nonEmptyText(2000), planets: z.array(planet).length(9),
}).strict().refine((chart) => {
  if (new Set(chart.planets.map((item) => item.id)).size !== 9) return false;
  const ascSign = Math.floor(chart.ascendant / 30);
  if (!chart.planets.every((item) => item.sign === Math.floor(item.longitude / 30) &&
      Math.abs(item.degree - item.longitude % 30) < 1e-7 &&
      item.house === (item.sign - ascSign + 12) % 12 + 1)) return false;
  const rahu = chart.planets.find((item) => item.id === "Rahu");
  const ketu = chart.planets.find((item) => item.id === "Ketu");
  return rahu.retrograde && ketu.retrograde &&
    Math.abs((rahu.longitude + 180) % 360 - ketu.longitude) < 1e-7;
});
const attachment = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("image"),name:nonEmptyText(120),content:z.string().max(650000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/u)}).strict(),
  z.object({kind:z.literal("text"),name:nonEmptyText(120),content:nonEmptyText(12000)}).strict(),
]);
const attachments = z.array(attachment).min(1).max(3).optional();
const requestSchema = z.discriminatedUnion("capability", [
  z.object({ ...requestBase, capability: z.literal("astro.interpretation"),
    input: z.object({ messages: chatMessages, chart: chartFacts }).strict(),
  }).strict(),
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
    input: z.object({ messages: chatMessages, attachments }).strict(),
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
  if (!withinByteLimit(body, body?.capability === "general.chat" && body?.input?.attachments?.length ? MAX_REQUEST_BYTES : 32 * 1024)) {
    return { valid: false, code: "MAYA_REQUEST_TOO_LARGE" };
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
    "astro.interpretation": chatResultSchema,
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
