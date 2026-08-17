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
    ],
  },
];

// Bengali (Bangla) Unicode block: U+0980–U+09FF.
const BENGALI_RANGE = /[\u0980-\u09FF]/;

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
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

/**
 * Lightweight language detection used only to pick which language to
 * reply in — never used for capability selection.
 */
function detectLanguage(message) {
  return BENGALI_RANGE.test(String(message || "")) ? "bn" : "en";
}

module.exports = { match, detectLanguage };
