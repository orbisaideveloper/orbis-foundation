const { z } = require("zod");
const capabilityIntentMatcher = require("./ChatCapabilityIntentMatcher.cjs");

const MAX_EVIDENCE_AGE_MS = 2 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 10_000;

const HttpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  }, "Only HTTP(S) evidence URLs are allowed");

const CandidateSourceSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    url: HttpUrlSchema,
    publishedAt: z.string().trim().min(1).max(80).optional(),
    excerpt: z.string().trim().max(3_000).optional(),
  })
  .strict();

const SearchCandidateSchema = z
  .object({
    answer: z.string().trim().min(1).max(12_000),
    retrievedAt: z.string().datetime({ offset: true }),
    sources: z.array(CandidateSourceSchema).min(1).max(3),
  })
  .strict();

function normalizeComparable(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLocation(value) {
  return normalizeComparable(value).replace(/(?:এর|র|তে|য়|য়)$/u, "");
}

function asciiDigits(value) {
  const bengaliDigits = "০১২৩৪৫৬৭৮৯";
  return String(value || "").replace(/[০-৯]/g, (digit) =>
    String(bengaliDigits.indexOf(digit)),
  );
}

function numericFacts(value) {
  return Array.from(
    new Set(
      asciiDigits(value).match(/\d+(?:[.,]\d+)?(?:\s*%|\s*°?c)?/gi) || [],
    ),
  ).map((fact) => fact.replace(/\s+/g, "").toLowerCase());
}

function sourceSupportsNumbers(answer, sources) {
  const facts = numericFacts(answer);
  if (facts.length === 0) return null;
  const excerpts = asciiDigits(
    sources.map((source) => source.excerpt || "").join(" "),
  )
    .replace(/\s+/g, "")
    .toLowerCase();
  return excerpts.length > 0 && facts.every((fact) => excerpts.includes(fact));
}

function publicSource(source) {
  const value = { title: source.title, url: source.url };
  if (source.publishedAt) value.publishedAt = source.publishedAt;
  return value;
}

function verifyWebSearchResult(
  query,
  candidate,
  { now = Date.now(), expectedLocation = null } = {},
) {
  const parsed = SearchCandidateSchema.safeParse(candidate);
  if (!parsed.success) return null;

  const retrievedAtMs = Date.parse(parsed.data.retrievedAt);
  const evidenceAgeMs = now - retrievedAtMs;
  if (
    evidenceAgeMs < -MAX_CLOCK_SKEW_MS ||
    evidenceAgeMs > MAX_EVIDENCE_AGE_MS
  ) {
    return null;
  }

  const weatherRequest = capabilityIntentMatcher.matchWeatherRequest(
    String(query || ""),
  );
  let locationMatched = null;
  if (weatherRequest) {
    const location = expectedLocation || weatherRequest.location;
    if (!location) return null;
    locationMatched = normalizeComparable(parsed.data.answer).includes(
      normalizeLocation(location),
    );
    if (!locationMatched) return null;
  }

  const numericFactsSupported = sourceSupportsNumbers(
    parsed.data.answer,
    parsed.data.sources,
  );
  if (numericFactsSupported === false) return null;

  return {
    answer: parsed.data.answer,
    evidence: {
      kind: "web-search",
      retrievedAt: parsed.data.retrievedAt,
      sources: parsed.data.sources.map(publicSource),
      verification: {
        status: "verified",
        locationMatched,
        numericFactsSupported,
      },
    },
  };
}

module.exports = {
  MAX_EVIDENCE_AGE_MS,
  SearchCandidateSchema,
  verifyWebSearchResult,
  numericFacts,
};
