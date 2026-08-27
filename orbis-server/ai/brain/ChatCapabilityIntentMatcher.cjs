/**
 * TASK-013 — Chat Capability Intent Matcher
 *
 * Deterministic, hardcoded phrase -> capabilityId matching. This module
 * NEVER interprets free-form AI-generated text as a capability request.
 * It only recognizes a fixed list of user-authored phrases (English and
 * Bengali) mapped 1:1 to capability ids that are already registered and
 * verified as SAFE in the existing TASK-009 execution registry
 * (see src/core/execution/runtimes/TermuxRuntimeService.ts).
 *
 * If a message does not match any known phrase, match() returns null and
 * the caller (AIChatService) MUST fall through to normal conversation.
 * Uncertainty is never resolved by guessing here — it is resolved by
 * returning null.
 */

// Only capabilities with a corresponding approval-flow decision in
// AIChatService (formatBrainResultAsChatReply) are mapped here.
// termux.system.info (SAFE) and termux.file.read (SENSITIVE, TASK-018
// Section 3.A) both have that: AIChatService's generic REQUIRE_APPROVAL
// handling already covers termux.file.read, since it is SENSITIVE and is
// always routed to REQUIRE_APPROVAL by the existing, unmodified
// ExecutionPolicyEngine / SecureExecutionAuthorizationGate chain. No new
// approval architecture was added.
const CAPABILITY_PHRASES = [
  {
    capabilityId: "termux.system.info",
    phrases: [
      // English
      "system information",
      "system info",
      "termux system information",
      "termux system info",
      "show system information",
      "show system info",
      "show me system information",
      "show me system info",
      "get system information",
      "get system info",
      "what is my system information",
      "what is my system info",
      // Bengali
      "সিস্টেম তথ্য",
      "সিস্টেম ইনফো",
      "টার্মাক্স সিস্টেম তথ্য",
      "টার্মাক্স সিস্টেম ইনফরমেশন",
      "সিস্টেম তথ্য দেখাও",
      "সিস্টেম ইনফরমেশন দেখাও",
      "আমার সিস্টেম তথ্য দেখাও",
      "আমার টার্মাক্স সিস্টেম ইনফরমেশন দেখাও",
      // Hindi / Hinglish / Banglish voice variants
      "सिस्टम की जानकारी",
      "सिस्टम जानकारी दिखाओ",
      "मेरा सिस्टम इन्फो दिखाओ",
      "टर्मक्स सिस्टम इन्फो",
      "system ki jankari",
      "system ka info dikhao",
      "mera system info dikhao",
      "system tottho dekhao",
      "amar system info dekhao",
    ],
  },
  {
    // TASK-018 (Section 3.A): deterministic phrase -> capabilityId only.
    // Which specific allow-listed file gets read is decided entirely by
    // orbis-server/bridge.cjs's hardcoded FILE_READ_ALLOW_LIST, never by
    // free-form chat text — this matcher never extracts a path from the
    // user's message.
    capabilityId: "termux.file.read",
    phrases: [
      // English
      "read file",
      "read a file",
      "read the file",
      "read local file",
      "read a local file",
      "show file contents",
      "show the file contents",
      "open file",
      "open the file",
      // Bengali
      "ফাইল পড়",
      "ফাইল পড়ো",
      "ফাইল দেখাও",
      "ফাইলের বিষয়বস্তু দেখাও",
      "লোকাল ফাইল পড়",
      "আমার ফাইল পড়ো",
      // Hindi / Hinglish / Banglish voice variants
      "फ़ाइल पढ़ो",
      "फाइल पढ़ो",
      "फाइल खोलो",
      "फाइल का कंटेंट दिखाओ",
      "file padho",
      "file kholo",
      "file ta poro",
      "file dekhao",
    ],
    // TASK-019: deterministic English/Bengali name variants for each
    // allow-listed file, checked against the normalized message inside
    // matchRequest() below. Kept here (not inline) so the full list of
    // recognized variants stays in one place, next to the phrase list
    // it complements.
    fileVariants: {
      "package.json": [
        "package.json",
        "package json",
        "প্যাকেজ জেসন",
        "প্যাকেজ.জেসন",
        "पैकेज जेसन",
        "package jeson",
      ],
      "README.md": ["readme.md", "readme", "রিডমি", "रीडमी", "ridmi"],
    },
  },
];

// Bengali (Bangla) Unicode block: U+0980–U+09FF.
const BENGALI_RANGE = /[\u0980-\u09FF]/;

const WEATHER_TOKEN =
  /^(?:weather|আবহাওয়া|আবহাওয়া|ওয়েদার|ওয়েদার)(?:টা|টি)?$/iu;
const LOCATION_CONNECTORS = new Set([
  "at",
  "for",
  "in",
  "of",
  "এর",
  "তে",
  "য়",
  "য়",
]);
const NON_LOCATION_WORDS = new Set([
  "a",
  "an",
  "current",
  "give",
  "how",
  "is",
  "latest",
  "me",
  "now",
  "please",
  "report",
  "tell",
  "the",
  "today",
  "today's",
  "update",
  "what",
  "will",
  "you",
  "আজ",
  "আজকে",
  "আজকের",
  "আমাকে",
  "আমি",
  "আছে",
  "আপনি",
  "একটু",
  "এখন",
  "কেমন",
  "কর",
  "করো",
  "কি",
  "কী",
  "চাই",
  "টা",
  "টি",
  "দাও",
  "বলবে",
  "বলো",
  "বলুন",
  "রিপোর্ট",
  "হবে",
  "জানাও",
  "জানতে",
]);

function normalize(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:।()[\]{}]/g, " ")
    .replace(/\s+/g, " ");
}

function weatherTokens(text) {
  return normalize(String(text || "").normalize("NFKC"))
    .replace(/[.!?,;:।()[\]{}]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isLocationToken(token) {
  if (!token || WEATHER_TOKEN.test(token)) return false;
  if (NON_LOCATION_WORDS.has(token) || LOCATION_CONNECTORS.has(token)) {
    return false;
  }
  return /^[\p{L}\p{M}][\p{L}\p{M}.'’-]*$/u.test(token);
}

function validatedLocation(tokens) {
  const value = tokens.join(" ").trim();
  if (!value || value.length > 80 || tokens.length > 6) return null;
  return tokens.every(isLocationToken) ? value : null;
}

function nearestLocationBefore(tokens, weatherIndex) {
  const end = weatherIndex;
  if (end === 0 || !isLocationToken(tokens[end - 1])) return null;

  let start = end - 1;
  while (start > 0 && isLocationToken(tokens[start - 1])) start -= 1;
  return validatedLocation(tokens.slice(start, end));
}

function nearestLocationAfter(tokens, weatherIndex) {
  let start = weatherIndex + 1;
  if (["report", "update", "রিপোর্ট"].includes(tokens[start])) {
    start += 1;
    if (!LOCATION_CONNECTORS.has(tokens[start])) return null;
  }
  if (LOCATION_CONNECTORS.has(tokens[start])) start += 1;
  if (start >= tokens.length || !isLocationToken(tokens[start])) return null;

  let end = start + 1;
  while (end < tokens.length && isLocationToken(tokens[end])) end += 1;
  return validatedLocation(tokens.slice(start, end));
}

/**
 * Deterministic weather slot parsing. A weather word establishes the intent;
 * only a bounded, letter-only span adjacent to that word can fill location.
 * Generic request words never become a location and no city is inferred.
 */
function matchWeatherRequest(message) {
  const tokens = weatherTokens(message);
  const weatherIndex = tokens.findIndex((token) => WEATHER_TOKEN.test(token));
  if (weatherIndex < 0) return null;

  return {
    location:
      nearestLocationBefore(tokens, weatherIndex) ||
      nearestLocationAfter(tokens, weatherIndex),
  };
}

/** Validate a short clarification reply without geocoding or guessing. */
function matchWeatherLocationReply(message) {
  const tokens = weatherTokens(message);
  if (
    tokens.length === 0 ||
    tokens.some((token) => WEATHER_TOKEN.test(token))
  ) {
    return null;
  }

  let start = 0;
  let end = tokens.length;
  while (
    start < end &&
    (NON_LOCATION_WORDS.has(tokens[start]) ||
      LOCATION_CONNECTORS.has(tokens[start]))
  ) {
    start += 1;
  }
  while (
    end > start &&
    (NON_LOCATION_WORDS.has(tokens[end - 1]) ||
      LOCATION_CONNECTORS.has(tokens[end - 1]))
  ) {
    end -= 1;
  }
  return validatedLocation(tokens.slice(start, end));
}

/**
 * Returns the matched capabilityId for a deterministic, hardcoded phrase,
 * or null if no known phrase is present. Matching is substring-based
 * against the normalized message so short natural variations ("...দেখাও"
 * suffixes, leading "আমার"/"please show me...") still match, while still
 * never touching AI-generated text.
 */
function match(message) {
  const normalized = normalize(message);
  if (!normalized) return null;

  for (const entry of CAPABILITY_PHRASES) {
    for (const phrase of entry.phrases) {
      if (normalized.includes(normalize(phrase))) {
        return entry.capabilityId;
      }
    }
  }

  return null;
}

function matchRequest(message) {
  const normalized = normalize(message);
  const capabilityId = match(normalized);
  if (!capabilityId) return null;

  if (capabilityId === "termux.file.read") {
    // TASK-019 fix (root cause of the PATH_REQUIRED-after-approval bug):
    // a phrase match alone only proves the user wants SOME file read —
    // it does NOT prove which allow-listed file. Only when a specific
    // file name/variant is present in the message do we resolve
    // input.path here. Every recognized variant is a fixed, hardcoded
    // string (see CAPABILITY_PHRASES[].fileVariants above) — never
    // free-form text, so this can never select an arbitrary path.
    //
    // When no file can be determined, needsInput MUST be true so
    // AIChatService asks the user to pick one instead of submitting an
    // approval request with input:{} (which used to reach the Brain,
    // get approved, and only THEN fail with PATH_REQUIRED at
    // bridge.cjs — after the user had already approved nothing
    // specific).
    const fileEntry = CAPABILITY_PHRASES.find(
      (e) => e.capabilityId === "termux.file.read",
    );
    const variants = fileEntry?.fileVariants || {};

    for (const [path, aliases] of Object.entries(variants)) {
      if (aliases.some((alias) => normalized.includes(normalize(alias)))) {
        return {
          capabilityId,
          input: { path },
          needsInput: false,
        };
      }
    }

    return {
      capabilityId,
      input: {},
      needsInput: true,
    };
  }

  return {
    capabilityId,
    input: {},
    needsInput: false,
  };
}

const APPROVAL_PREFIXES = Object.freeze([
  "approve",
  "approved",
  "confirm",
  "confirmed",
  "yes",
  "reject",
  "rejected",
  "deny",
  "denied",
  "no",
  "cancel",
  "cancelled",
  "approval",
  "token",
  "অনুমোদন",
  "টোকেন",
  "হ্যাঁ",
  "ঠিক আছে",
  "না",
  "বাতিল",
  "প্রত্যাখ্যান",
]);

function isApprovalTokenCharacter(character) {
  const code = character.charCodeAt(0);
  return (
    character === "_" ||
    character === "-" ||
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function skipWhitespace(text, index) {
  let nextIndex = index;
  while (nextIndex < text.length && text[nextIndex].trim() === "") {
    nextIndex += 1;
  }
  return nextIndex;
}

function readApprovalToken(text, prefixEnd) {
  let tokenStart = skipWhitespace(text, prefixEnd);
  if (text[tokenStart] === ":" || text[tokenStart] === "#") {
    tokenStart = skipWhitespace(text, tokenStart + 1);
  }

  let tokenEnd = tokenStart;
  while (
    tokenEnd < text.length &&
    isApprovalTokenCharacter(text[tokenEnd])
  ) {
    tokenEnd += 1;
  }
  const token = text.slice(tokenStart, tokenEnd);
  return token.length >= 20 ? token : null;
}

function approvalTokenFromMessage(message) {
  const text = String(message || "");
  const normalizedText = text.toLowerCase();
  let searchStart = 0;
  while (searchStart < normalizedText.length) {
    const prefixIndexes = APPROVAL_PREFIXES.map((prefix) => ({
      prefix,
      index: normalizedText.indexOf(prefix, searchStart),
    })).filter(({ index }) => index !== -1);
    if (prefixIndexes.length === 0) return null;

    const nextPrefixIndex = Math.min(
      ...prefixIndexes.map(({ index }) => index),
    );
    const matchingPrefixes = prefixIndexes
      .filter(({ index }) => index === nextPrefixIndex)
      .map(({ prefix }) => prefix)
      .sort((left, right) => right.length - left.length);
    for (const prefix of matchingPrefixes) {
      const token = readApprovalToken(text, nextPrefixIndex + prefix.length);
      if (token) return token;
    }
    searchStart = nextPrefixIndex + 1;
  }
  return null;
}

function matchApprovalDecision(message) {
  const text = String(message || "");
  const token = approvalTokenFromMessage(text);
  if (!token) return null;

  const approve =
    /\b(approve|approved|yes|confirm|confirmed)\b/i.test(text) ||
    /(?:হ্যাঁ|অনুমোদন|ঠিক আছে|অনুমতি দাও)/i.test(text);

  const reject =
    /\b(reject|rejected|deny|denied|no|cancel|cancelled)\b/i.test(text) ||
    /(?:না|বাতিল|প্রত্যাখ্যান)/i.test(text);

  if (approve === reject) return null;
  return { token, decision: approve ? "APPROVE" : "REJECT" };
}

/**
 * Lightweight language detection used only to pick which language to
 * reply in — never used for capability selection.
 */
function detectLanguage(message) {
  return BENGALI_RANGE.test(String(message || "")) ? "bn" : "en";
}

module.exports = {
  match,
  matchRequest,
  matchApprovalDecision,
  matchWeatherRequest,
  matchWeatherLocationReply,
  detectLanguage,
};
