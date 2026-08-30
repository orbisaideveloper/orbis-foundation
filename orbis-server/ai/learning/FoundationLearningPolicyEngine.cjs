const TIME_SENSITIVE_EVIDENCE_POLICY = Object.freeze({
  code: "time-sensitive-evidence",
  label: "Evidence verification",
});

const EMPTY_LEARNING_POLICY = Object.freeze({
  applied: Object.freeze([]),
  requireVerifiedEvidence: false,
});

function emptyLearningPolicy() {
  return {
    applied: [],
    requireVerifiedEvidence: false,
  };
}

function isLiveInformationDecision(decision) {
  return (
    decision?.route === "web-search" &&
    decision?.intent === "live-information" &&
    decision?.evidenceRequired === true
  );
}

function isTimeSensitiveEvidenceRule(record) {
  if (
    !record ||
    record.isActive !== true ||
    record.category !== "OPERATING_RULE" ||
    !Array.isArray(record.tags)
  ) {
    return false;
  }
  const tags = new Set(record.tags);
  return (
    tags.has("verification") &&
    (tags.has("time-sensitive") || tags.has("evidence"))
  );
}

function hasVerifiedEvidence(evidence) {
  return (
    Array.isArray(evidence?.sources) &&
    evidence.sources.length > 0 &&
    evidence?.verification?.status === "verified"
  );
}

class FoundationLearningPolicyEngine {
  constructor({ repository } = {}) {
    this.repository = repository || null;
  }

  async evaluate(decision) {
    if (!isLiveInformationDecision(decision)) return emptyLearningPolicy();

    try {
      if (typeof this.repository?.list !== "function") {
        return emptyLearningPolicy();
      }
      const records = await this.repository.list();
      if (
        !Array.isArray(records) ||
        !records.some(isTimeSensitiveEvidenceRule)
      ) {
        return emptyLearningPolicy();
      }
      return {
        applied: [{ ...TIME_SENSITIVE_EVIDENCE_POLICY }],
        requireVerifiedEvidence: true,
      };
    } catch {
      // A learning read must never make chat unavailable. The baseline live
      // information route continues to require verified evidence by itself.
      return emptyLearningPolicy();
    }
  }
}

module.exports = {
  EMPTY_LEARNING_POLICY,
  FoundationLearningPolicyEngine,
  TIME_SENSITIVE_EVIDENCE_POLICY,
  hasVerifiedEvidence,
  isLiveInformationDecision,
  isTimeSensitiveEvidenceRule,
};
