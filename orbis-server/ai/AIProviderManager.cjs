const OllamaProvider = require("./providers/OllamaProvider.cjs");
const HuggingFaceProvider = require("./providers/HuggingFaceProvider.cjs");
const { modelRouter } = require("./models/ModelRouter.cjs");
const { modelRegistry } = require("./models/ModelRegistry.cjs");

class AIProviderManager {
  constructor() {
    this.providers = new Map();
    this.activeProviderName = null;
    this.lastRouting = null;
    this.initializeDefaultProviders();
  }

  initializeDefaultProviders() {
    const ollama = new OllamaProvider();
    this.registerProvider(ollama);

    const huggingFace = new HuggingFaceProvider();
    this.registerProvider(huggingFace);

    this.setActiveProvider("Ollama");
  }

  registerProvider(provider) {
    this.providers.set(provider.name, provider);
  }

  setActiveProvider(name) {
    if (this.providers.has(name)) {
      this.activeProviderName = name;
    } else {
      throw new Error(`Provider ${name} not found.`);
    }
  }

  getActiveProvider() {
    if (!this.activeProviderName) {
      throw new Error("No active AI provider configured.");
    }

    return this.providers.get(this.activeProviderName);
  }

  buildCandidates(messages, options, active) {
    const selection = modelRouter.select(messages, {
      task: options.task,
      requirements: options.requirements,
      availableProviders: Array.from(this.providers.keys()),
    });

    const seenProviders = new Set();
    const candidates = [];

    for (const model of selection.candidates) {
      const provider = this.providers.get(model.provider);

      if (!provider || seenProviders.has(provider)) continue;

      seenProviders.add(provider);
      candidates.push({
        provider,
        model,
        source: "model-registry",
      });

      if (candidates.length >= 2) break;
    }

    const providerFallbacks = [
      active,
      ...Array.from(this.providers.values()).filter(
        (provider) => provider !== active,
      ),
    ];

    for (const provider of providerFallbacks) {
      if (!provider || seenProviders.has(provider)) continue;

      seenProviders.add(provider);
      candidates.push({
        provider,
        model: null,
        source: "provider-fallback",
      });

      if (candidates.length >= 2) break;
    }

    return { selection, candidates };
  }

  buildRequestOptions(candidate, options) {
    const requestOptions = {
      timeoutMs: options.timeoutMs || 30_000,
    };

    if (candidate.model?.modelId) {
      requestOptions.model = candidate.model.modelId;
    }

    return requestOptions;
  }

  rememberRouting(snapshot) {
    this.lastRouting = {
      status: snapshot.status || "unknown",
      at: new Date().toISOString(),
      task: snapshot.task || null,
      reason: snapshot.reason || null,
      registryModelId: snapshot.registryModelId || null,
      codename: snapshot.codename || null,
      modelId: snapshot.modelId || null,
      provider: snapshot.provider || null,
      source: snapshot.source || null,
      errorCode: snapshot.errorCode || null,
      attempts: Array.isArray(snapshot.attempts)
        ? snapshot.attempts.map((attempt) => ({ ...attempt }))
        : [],
    };
  }

  completeSuccessfulRouting({
    selection,
    candidate,
    response,
    attempts,
    attemptBase,
    startedAt,
  }) {
    const routedModelId =
      response.provider?.model ||
      candidate.model?.modelId ||
      candidate.provider?.model ||
      null;

    const routedProvider =
      response.provider?.name ||
      candidate.provider?.name ||
      null;

    attempts.push({
      ...attemptBase,
      providerType:
        response.provider?.type ||
        attemptBase.providerType,
      model: routedModelId,
      status: "success",
      durationMs: Math.max(0, Date.now() - startedAt),
      errorCode: null,
    });

    this.rememberRouting({
      status: "success",
      task: selection.task,
      reason: selection.reason,
      registryModelId: candidate.model?.id || null,
      codename: candidate.model?.codename || null,
      modelId: routedModelId,
      provider: routedProvider,
      source: candidate.source,
      errorCode: null,
      attempts,
    });

    return {
      ...response,
      provider: {
        ...response.provider,
        routing: {
          task: selection.task,
          reason: selection.reason,
          registryModelId: candidate.model?.id || null,
          codename: candidate.model?.codename || null,
          modelId: routedModelId,
          source: candidate.source,
          attempts: attempts.map(
            (attempt) => ({ ...attempt }),
          ),
        },
      },
    };
  }

  async generateChat(messages, options = {}) {
    const active = this.getActiveProvider();

    const { selection, candidates } = this.buildCandidates(
      messages,
      options,
      active,
    );

    const attempts = [];
    let lastCode = "PROVIDER_UNAVAILABLE";

    for (const candidate of candidates) {
      const startedAt = Date.now();
      const attemptBase = {
        provider: candidate.provider?.name || null,
        providerType: candidate.provider?.type || null,
        model:
          candidate.model?.modelId ||
          candidate.provider?.model ||
          null,
        registryModelId: candidate.model?.id || null,
        codename: candidate.model?.codename || null,
        source: candidate.source,
      };

      try {
        const requestOptions = this.buildRequestOptions(
          candidate,
          options,
        );

        const response = await candidate.provider.generateChat(
          messages,
          requestOptions,
        );

        return this.completeSuccessfulRouting({
          selection,
          candidate,
          response,
          attempts,
          attemptBase,
          startedAt,
        });
      } catch (error) {
        lastCode = error?.code || "PROVIDER_UNAVAILABLE";

        attempts.push({
          ...attemptBase,
          status: "failed",
          durationMs: Math.max(0, Date.now() - startedAt),
          errorCode: lastCode,
        });
      }
    }

    this.rememberRouting({
      status: "failed",
      task: selection.task,
      reason: selection.reason,
      registryModelId: null,
      codename: null,
      modelId: null,
      provider: null,
      source: null,
      errorCode: lastCode,
      attempts,
    });

    const normalized = new Error(lastCode);
    normalized.code = lastCode;
    normalized.routingAttempts = attempts.map(
      (attempt) => ({ ...attempt }),
    );
    throw normalized;
  }

  getStatus() {
    let active = null;

    try {
      active = this.getActiveProvider();
    } catch {
      // Truthful empty status when no provider is configured.
    }

    return {
      activeProvider: active?.getMetadata() || null,
      allProviders: Array.from(this.providers.values()).map((provider) =>
        provider.getMetadata(),
      ),
      modelRouting: {
        mode: "automatic",
        registeredModels: modelRegistry.list(),
        lastRouting: this.lastRouting
          ? {
              ...this.lastRouting,
              attempts: this.lastRouting.attempts.map(
                (attempt) => ({ ...attempt }),
              ),
            }
          : null,
      },
    };
  }
}

module.exports = new AIProviderManager();
