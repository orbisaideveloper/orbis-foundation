const EXECUTION_MODES = Object.freeze({
  ANSWER_ONLY: "answer-only",
  REPOSITORY_READ: "repository-read",
  REPOSITORY_CHANGE: "repository-change",
});

const VALID_EXECUTION_MODES =
  new Set(Object.values(EXECUTION_MODES));

const ENGLISH_NEGATED_TASK_ACTION_PATTERN =
  /\b(?:do\s+not|don't|dont|never)\s+(?:(?:read|search|inspect|review)\s+or\s+)?(?:read|search|list|inspect|audit|review|write|create|modify|change|update|patch|fix|edit|delete|replace|run|verify|test|implement|refactor)\b/giu;

const ENGLISH_WITHOUT_TASK_ACTION_PATTERN =
  /\bwithout\s+(?:reading|searching|listing|inspecting|auditing|reviewing|writing|creating|modifying|changing|updating|patching|fixing|editing|deleting|replacing|running|verifying|testing|implementing|refactoring)\b/giu;

const BENGALI_NEGATED_TASK_ACTION_PATTERN =
  /(?:বদলাবে|বদলাবেন|পরিবর্তন\s+করবে|পরিবর্তন\s+করবেন|লিখবে|লিখবেন|প্যাচ\s+করবে|প্যাচ\s+করবেন|ফিক্স\s+করবে|ফিক্স\s+করবেন|এডিট\s+করবে|এডিট\s+করবেন|ডিলিট\s+করবে|ডিলিট\s+করবেন|আপডেট\s+করবে|আপডেট\s+করবেন|পড়বে|পড়বে|পড়বেন|পড়বেন|রিভিউ\s+করবে|রিভিউ\s+করবেন|টেস্ট\s+করবে|টেস্ট\s+করবেন|চালাবে|চালাবেন|ভেরিফাই\s+করবে|ভেরিফাই\s+করবেন|যাচাই\s+করবে|যাচাই\s+করবেন)\s+না/giu;

const ENGLISH_REPOSITORY_MUTATION_DENIAL_PATTERN =
  /\b(?:do\s+not|don't|dont|never)\s+(?:(?:read|inspect|review)\s+or\s+)?(?:write|create|modify|change|update|patch|fix|edit|delete|replace)\b[^.!?\n]{0,64}\b(?:repo|repository|files?|codebase|source)\b/iu;

const BENGALI_REPOSITORY_MUTATION_DENIAL_PATTERN =
  /(?:\b(?:repo|repository|codebase|files?)\b|রিপো|রিপোজিটরি|কোডবেস|ফাইল).{0,48}(?:বদলাবে|বদলাবেন|পরিবর্তন\s+করবে|পরিবর্তন\s+করবেন|লিখবে|লিখবেন|প্যাচ\s+করবে|প্যাচ\s+করবেন|ফিক্স\s+করবে|ফিক্স\s+করবেন|এডিট\s+করবে|এডিট\s+করবেন|ডিলিট\s+করবে|ডিলিট\s+করবেন|আপডেট\s+করবে|আপডেট\s+করবেন)\s+না/iu;

const REPOSITORY_TARGET_PATTERN =
  /(?:\b(?:repo|repository|codebase|worktree|source\s+tree|git|branch|head)\b|রিপো|রিপোজিটরি|কোডবেস|ওয়ার্কট্রি|ওয়ার্কট্রি|গিট)/iu;

const FILE_PATH_PATTERN =
  /(?:^|[\s"'`])(?:\.{0,2}\/)?(?:[\w@.-]+\/)+[\w@.-]+\.(?:[cm]?[jt]sx?|json|md|sql|prisma|ya?ml|cjs|mjs)\b/iu;

const REPOSITORY_CHANGE_ACTION_PATTERN =
  /(?:\b(?:fix|patch|modify|edit|change|update|implement|refactor|replace|delete|write|create)\b|ফিক্স|প্যাচ|বদল|পরিবর্তন|এডিট|আপডেট|ইমপ্লিমেন্ট|রিফ্যাক্টর|ডিলিট|লিখ|তৈরি|সংশোধন)/iu;

const REPOSITORY_VERIFY_ACTION_PATTERN =
  /(?:\b(?:verify|test|run\s+tests?)\b|ভেরিফাই|যাচাই|টেস্ট|টেস্ট\s+চালাও)/iu;

const REPOSITORY_READ_ACTION_PATTERN =
  /(?:\b(?:inspect|audit|review|read|search|find|list|show|check|debug|diagnose|analy[sz]e|look\s+at)\b|দেখ|পড়|পড়|খুঁজ|অডিট|রিভিউ|চেক|ডিবাগ|বিশ্লেষণ)/iu;

function stripNegatedTaskActions(text) {
  return String(text || "")
    .replace(
      ENGLISH_NEGATED_TASK_ACTION_PATTERN,
      " ",
    )
    .replace(
      ENGLISH_WITHOUT_TASK_ACTION_PATTERN,
      " ",
    )
    .replace(
      BENGALI_NEGATED_TASK_ACTION_PATTERN,
      " ",
    );
}

function hasRepositoryMutationDenial(text) {
  const value =
    String(text || "");

  return (
    ENGLISH_REPOSITORY_MUTATION_DENIAL_PATTERN.test(
      value,
    ) ||
    BENGALI_REPOSITORY_MUTATION_DENIAL_PATTERN.test(
      value,
    )
  );
}

function hasRepositoryTarget(text) {
  const value =
    String(text || "");

  return (
    REPOSITORY_TARGET_PATTERN.test(value) ||
    FILE_PATH_PATTERN.test(value)
  );
}

function normalizeExplicitExecutionMode(mode) {
  return VALID_EXECUTION_MODES.has(mode)
    ? mode
    : null;
}

function resolveRepositoryExecutionMode(
  text,
  explicitMode,
) {
  const explicit =
    normalizeExplicitExecutionMode(
      explicitMode,
    );

  if (explicit) {
    return explicit;
  }

  const original =
    String(text || "").trim();

  const sanitized =
    stripNegatedTaskActions(
      original,
    );

  if (!hasRepositoryTarget(original)) {
    return EXECUTION_MODES.ANSWER_ONLY;
  }

  if (
    REPOSITORY_VERIFY_ACTION_PATTERN.test(
      sanitized,
    )
  ) {
    return EXECUTION_MODES.REPOSITORY_CHANGE;
  }

  if (
    !hasRepositoryMutationDenial(original) &&
    REPOSITORY_CHANGE_ACTION_PATTERN.test(
      sanitized,
    )
  ) {
    return EXECUTION_MODES.REPOSITORY_CHANGE;
  }

  if (
    REPOSITORY_READ_ACTION_PATTERN.test(
      sanitized,
    )
  ) {
    return EXECUTION_MODES.REPOSITORY_READ;
  }

  return EXECUTION_MODES.ANSWER_ONLY;
}

module.exports = {
  EXECUTION_MODES,
  hasRepositoryMutationDenial,
  hasRepositoryTarget,
  resolveRepositoryExecutionMode,
  stripNegatedTaskActions,
};
