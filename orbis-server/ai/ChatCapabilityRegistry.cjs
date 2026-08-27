const capabilityIntentMatcher = require("./brain/ChatCapabilityIntentMatcher.cjs");

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
  "এখন",
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
    if (approval) return { route: "approval", capabilityId: null };

    const capability = capabilityIntentMatcher.matchRequest(message);
    if (capability) {
      return {
        route: "foundation-capability",
        capabilityId: capability.capabilityId,
      };
    }

    if (isTemporalRequest(message)) {
      return { route: "web-search", capabilityId: "web.search.tavily" };
    }

    return { route: "provider", capabilityId: "provider.chat" };
  }
}

module.exports = {
  ChatCapabilityRegistry,
  chatCapabilityRegistry: new ChatCapabilityRegistry(),
  isTemporalRequest,
  TEMPORAL_WORDS,
};
