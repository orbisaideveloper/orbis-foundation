const TASKS = Object.freeze({
  GENERAL_CHAT: "general-chat",
  CODING: "coding",
  REASONING: "reasoning",
  VISION: "vision",
  EMBEDDING: "embedding",
});

const HUGGING_FACE_PROVIDER = "Hugging Face";
const PROVIDER_MANAGED_COST_CLASS = "provider-managed";
const PROVIDER_ROUTED_AVAILABILITY = "provider-routed";

const MODELS = Object.freeze([
  Object.freeze({
    id: "hf-qwen3-4b-general",
    codename: "Orbit",
    displayName: "ORBIS Orbit",
    provider: HUGGING_FACE_PROVIDER,
    modelId: "Qwen/Qwen3-4B:featherless-ai",
    tasks: Object.freeze([TASKS.GENERAL_CHAT]),
    capabilities: Object.freeze(["chat", "multilingual"]),
    contextWindow: null,
    toolSupport: false,
    structuredOutput: false,
    costClass: PROVIDER_MANAGED_COST_CLASS,
    availability: PROVIDER_ROUTED_AVAILABILITY,
    priority: 100,
    enabled: true,
  }),
  Object.freeze({
    id: "hf-qwen25-coder-7b",
    codename: "Forge",
    displayName: "ORBIS Forge",
    provider: HUGGING_FACE_PROVIDER,
    modelId: "Qwen/Qwen2.5-Coder-7B-Instruct:fastest",
    tasks: Object.freeze([TASKS.CODING]),
    capabilities: Object.freeze(["chat", "coding", "multilingual"]),
    contextWindow: null,
    toolSupport: false,
    structuredOutput: false,
    costClass: PROVIDER_MANAGED_COST_CLASS,
    availability: PROVIDER_ROUTED_AVAILABILITY,
    priority: 120,
    enabled: true,
  }),
  Object.freeze({
    id: "hf-qwen3-8b-reasoning",
    codename: "Sage",
    displayName: "ORBIS Sage",
    provider: HUGGING_FACE_PROVIDER,
    modelId: "Qwen/Qwen3-8B:fastest",
    tasks: Object.freeze([TASKS.REASONING, TASKS.GENERAL_CHAT]),
    capabilities: Object.freeze(["chat", "reasoning", "multilingual"]),
    contextWindow: null,
    toolSupport: false,
    structuredOutput: false,
    costClass: PROVIDER_MANAGED_COST_CLASS,
    availability: PROVIDER_ROUTED_AVAILABILITY,
    priority: 90,
    enabled: true,
  }),
  Object.freeze({
    id: "hf-qwen25-vl-7b",
    codename: "Lens",
    displayName: "ORBIS Lens",
    provider: HUGGING_FACE_PROVIDER,
    modelId: "Qwen/Qwen2.5-VL-7B-Instruct:fastest",
    tasks: Object.freeze([TASKS.VISION]),
    capabilities: Object.freeze(["chat", "vision", "multilingual"]),
    contextWindow: null,
    toolSupport: false,
    structuredOutput: false,
    costClass: PROVIDER_MANAGED_COST_CLASS,
    availability: PROVIDER_ROUTED_AVAILABILITY,
    priority: 100,
    enabled: false,
    disabledReason: "MULTIMODAL_MESSAGE_INPUT_NOT_ENABLED",
  }),
  Object.freeze({
    id: "hf-embedding-placeholder",
    codename: "Vector",
    displayName: "ORBIS Vector",
    provider: HUGGING_FACE_PROVIDER,
    modelId: null,
    tasks: Object.freeze([TASKS.EMBEDDING]),
    capabilities: Object.freeze(["embedding"]),
    contextWindow: null,
    toolSupport: false,
    structuredOutput: false,
    costClass: PROVIDER_MANAGED_COST_CLASS,
    availability: "not-configured",
    priority: 0,
    enabled: false,
    disabledReason: "EMBEDDING_PROVIDER_METHOD_NOT_ENABLED",
  }),
]);

function cloneModel(model) {
  return {
    ...model,
    tasks: [...model.tasks],
    capabilities: [...model.capabilities],
  };
}

class ModelRegistry {
  list() {
    return MODELS.map(cloneModel);
  }

  get(id) {
    const model = MODELS.find((candidate) => candidate.id === id);
    return model ? cloneModel(model) : null;
  }

  candidatesFor({
    task = TASKS.GENERAL_CHAT,
    requiredCapabilities = [],
    providerNames = [],
    requireToolSupport = false,
    requireStructuredOutput = false,
  } = {}) {
    const providers = new Set(providerNames);

    return MODELS.filter((model) => {
      if (!model.enabled || !model.modelId) return false;
      if (!model.tasks.includes(task)) return false;
      if (providers.size > 0 && !providers.has(model.provider)) return false;

      if (
        requiredCapabilities.some(
          (capability) => !model.capabilities.includes(capability),
        )
      ) {
        return false;
      }

      return (
        (!requireToolSupport || model.toolSupport) &&
        (!requireStructuredOutput || model.structuredOutput)
      );
    })
      .sort(
        (left, right) =>
          right.priority - left.priority || left.id.localeCompare(right.id),
      )
      .map(cloneModel);
  }
}

module.exports = {
  TASKS,
  ModelRegistry,
  modelRegistry: new ModelRegistry(),
};
