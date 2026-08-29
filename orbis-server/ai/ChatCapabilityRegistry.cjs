const capabilityIntentMatcher = require("./brain/ChatCapabilityIntentMatcher.cjs");
const {
  getFoundationCapabilityStatus,
} = require("./FoundationCapabilityChatPolicy.cjs");
const {
  createConversationPlan,
} = require("./FoundationConversationPolicy.cjs");
const { parseBrainDecision } = require("./brain/BrainDecisionContract.cjs");

const MANIFEST = Object.freeze([
  Object.freeze({
    id: "termux.system.info",
    kind: "foundation-capability",
    network: false,
    requiresApproval: false,
  }),
  Object.freeze({
    id: "termux.file.read",
    kind: "foundation-capability",
    network: false,
    requiresApproval: true,
  }),
  Object.freeze({
    id: "web.search.tavily",
    kind: "network-tool",
    network: true,
    requiresApproval: false,
  }),
  Object.freeze({
    id: "provider.chat",
    kind: "provider",
    network: "provider-dependent",
    requiresApproval: false,
  }),
  Object.freeze({
    id: "foundation.table.search",
    kind: "foundation-data-capability",
    network: false,
    requiresApproval: true,
    status: "AVAILABLE",
    callable: true,
    executionRoute: "admin-capability-api",
  }),
  Object.freeze({
    id: "foundation.pdf.read",
    kind: "foundation-data-capability",
    network: false,
    requiresApproval: true,
    status: "AVAILABLE",
    callable: true,
    executionRoute: "admin-capability-api",
  }),
  Object.freeze({
    id: "foundation.xlsx.read",
    kind: "foundation-data-capability",
    network: false,
    requiresApproval: true,
    status: "AVAILABLE",
    callable: true,
    executionRoute: "admin-capability-api",
  }),
  Object.freeze({
    id: "foundation.xlsx.create",
    kind: "foundation-data-capability",
    network: false,
    requiresApproval: true,
    status: "AVAILABLE",
    callable: true,
    executionRoute: "admin-capability-api",
  }),
]);

const TEMPORAL_WORDS = Object.freeze([
  "latest",
  "update",
  "news",
  "price",
  "current",
  "today",
  "weather",
  "খবর",
  "বর্তমান",
  "আজকের",
  "সর্বশেষ",
  "আবহাওয়া",
  "ওয়েদার",
  "দাম",
]);

function isTemporalRequest(message) {
  if (capabilityIntentMatcher.matchWeatherRequest(message)) return true;
  const escaped = TEMPORAL_WORDS.map((word) =>
    word.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`),
  );
  return new RegExp(
    String.raw`(?:^|\s|[.,!?।])(${escaped.join("|")})(?=\s|[.,!?।]|$)`,
    "i",
  ).test(String(message || "").toLowerCase());
}

class ChatCapabilityRegistry {
  list() {
    return MANIFEST.map((entry) => ({
      ...entry,
      configured:
        entry.id !== "web.search.tavily" || Boolean(process.env.TAVILY_API_KEY),
    }));
  }

  get(id) {
    return this.list().find((entry) => entry.id === id) || null;
  }

  select(message) {
    const approval = capabilityIntentMatcher.matchApprovalDecision(message);
    if (approval) {
      return parseBrainDecision({
        route: "approval",
        capabilityId: null,
        brainDecision: "approval-decision",
        intent: "approval",
        confidence: "high",
        evidenceRequired: false,
        reason: "approval-decision",
      });
    }

    const capability = capabilityIntentMatcher.matchRequest(message);
    if (capability) {
      return parseBrainDecision({
        route: "foundation-capability",
        capabilityId: capability.capabilityId,
        brainDecision: "foundation-capability",
        intent: "foundation-capability",
        confidence: "high",
        evidenceRequired: false,
        reason: "registered-capability",
      });
    }

    if (getFoundationCapabilityStatus(message)) {
      return parseBrainDecision({
        route: "foundation-capability-status",
        capabilityId: null,
        brainDecision: "foundation-capability-status",
        intent: "capability-status",
        confidence: "high",
        evidenceRequired: false,
        reason: "capability-status",
      });
    }

    if (isTemporalRequest(message)) {
      return parseBrainDecision({
        route: "web-search",
        capabilityId: "web.search.tavily",
        brainDecision: "live-web-search",
        intent: "live-information",
        confidence: "high",
        evidenceRequired: true,
        reason: "time-sensitive-request",
      });
    }

    const conversationPlan = createConversationPlan(message);
    if (conversationPlan.mode === "direct") {
      return parseBrainDecision({
        route: "brain-direct-reply",
        capabilityId: null,
        brainDecision: conversationPlan.id,
        intent: "direct-conversation",
        confidence: "high",
        evidenceRequired: false,
        reason: "brain-direct-policy",
        conversationPlan,
      });
    }

    return parseBrainDecision({
      route: "brain-orchestrated-provider",
      capabilityId: "provider.chat",
      brainDecision: conversationPlan.id,
      intent: "general-conversation",
      confidence: "medium",
      evidenceRequired: false,
      reason: "provider-reasoning",
      conversationPlan,
    });
  }
}

module.exports = {
  ChatCapabilityRegistry,
  chatCapabilityRegistry: new ChatCapabilityRegistry(),
  isTemporalRequest,
  TEMPORAL_WORDS,
};
