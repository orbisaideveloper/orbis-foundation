const OllamaProvider = require("./providers/OllamaProvider.cjs");
const HuggingFaceProvider = require("./providers/HuggingFaceProvider.cjs");
const { modelRouter } = require("./models/ModelRouter.cjs");
const { modelRegistry } = require("./models/ModelRegistry.cjs");

const HF_PROVIDER_NAME =
  "Hugging Face";

function isTransientProviderFailureCode(
  errorCode,
) {
  const code =
    String(errorCode || "");

  return (
    code === "PROVIDER_TIMEOUT" ||
    /^PROVIDER_UNAVAILABLE_(?:408|425|429|5\d\d)$/u.test(
      code,
    )
  );
}

function transientRetryDelayMs(
  errorCode,
) {
  if (
    errorCode ===
    "PROVIDER_UNAVAILABLE_429"
  ) {
    return 1_500;
  }

  if (
    /^PROVIDER_UNAVAILABLE_5\d\d$/u.test(
      String(errorCode || ""),
    )
  ) {
    return 600;
  }

  return 300;
}

function waitForRetry(delayMs) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, delayMs),
  );
}

function preferredRoutingFailureCode(
  attempts,
  fallbackCode,
) {
  const codes = attempts
    .map(
      (attempt) =>
        String(
          attempt?.errorCode || "",
        ),
    )
    .filter(Boolean);

  const authentication =
    codes.find(
      (code) =>
        code ===
        "PROVIDER_AUTH_FAILED",
    );

  if (authentication) {
    return authentication;
  }

  const httpStatus =
    codes.find(
      (code) =>
        /^PROVIDER_UNAVAILABLE_\d{3}$/u.test(
          code,
        ),
    );

  if (httpStatus) {
    return httpStatus;
  }

  if (
    codes.includes(
      "PROVIDER_TIMEOUT",
    )
  ) {
    return "PROVIDER_TIMEOUT";
  }

  if (
    codes.includes(
      "PROVIDER_RESPONSE_REJECTED",
    )
  ) {
    return "PROVIDER_RESPONSE_REJECTED";
  }

  return (
    String(fallbackCode || "") ||
    "PROVIDER_UNAVAILABLE"
  );
}

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

    const candidates = [];
    const seenRegistryCandidates = new Set();
    const representedProviders = new Set();

    for (const model of selection.candidates) {
      const provider = this.providers.get(model.provider);
      const registryKey =
        `${model.provider}:${model.modelId}`;

      if (
        !provider ||
        seenRegistryCandidates.has(registryKey)
      ) {
        continue;
      }

      seenRegistryCandidates.add(registryKey);
      representedProviders.add(provider);

      candidates.push({
        provider,
        model,
        source: "model-registry",
      });

      // Keep the primary + one registry fallback bounded.
      if (candidates.length >= 2) break;
    }

    const providerFallbacks = [
      active,
      ...Array.from(this.providers.values()).filter(
        (provider) => provider !== active,
      ),
    ];

    for (const provider of providerFallbacks) {
      if (
        !provider ||
        representedProviders.has(provider)
      ) {
        continue;
      }

      representedProviders.add(provider);

      candidates.push({
        provider,
        model: null,
        source: "provider-fallback",
      });

      // Primary registry model + registry fallback + provider fallback.
      if (candidates.length >= 3) break;
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

  validateProviderResponse(
    response,
    validateResponse,
  ) {
    if (typeof validateResponse !== "function") {
      return;
    }

    let accepted = false;

    try {
      accepted =
        validateResponse(response) === true;
    } catch {
      accepted = false;
    }

    if (accepted) {
      return;
    }

    const error =
      new Error("PROVIDER_RESPONSE_REJECTED");
    error.code = error.message;
    throw error;
  }

  throwRoutingFailure(
    selection,
    attempts,
    errorCode,
  ) {
    this.rememberRouting({
      status: "failed",
      task: selection.task,
      reason: selection.reason,
      registryModelId: null,
      codename: null,
      modelId: null,
      provider: null,
      source: null,
      errorCode,
      attempts,
    });

    const normalized =
      new Error(errorCode);

    normalized.code =
      errorCode;

    normalized.routingAttempts =
      attempts.map(
        (attempt) => ({
          ...attempt,
        }),
      );

    throw normalized;
  }

  async generateChat(messages, options = {}) {
    const active =
      this.getActiveProvider();

    const {
      selection,
      candidates,
    } = this.buildCandidates(
      messages,
      options,
      active,
    );

    const attempts = [];
    let lastCode =
      "PROVIDER_UNAVAILABLE";

    for (
      let candidateIndex = 0;
      candidateIndex < candidates.length;
      candidateIndex += 1
    ) {
      const candidate =
        candidates[candidateIndex];

      const requestOptions =
        this.buildRequestOptions(
          candidate,
          options,
        );

      const attemptBase = {
        provider:
          candidate.provider?.name ||
          null,
        providerType:
          candidate.provider?.type ||
          null,
        model:
          candidate.model?.modelId ||
          candidate.provider?.model ||
          null,
        registryModelId:
          candidate.model?.id ||
          null,
        codename:
          candidate.model?.codename ||
          null,
        source: candidate.source,
      };

      const mayRetryFirstHfCandidate =
        candidateIndex === 0 &&
        candidate.provider?.name ===
          HF_PROVIDER_NAME;

      const maximumAttempts =
        mayRetryFirstHfCandidate
          ? 2
          : 1;

      for (
        let attemptIndex = 0;
        attemptIndex < maximumAttempts;
        attemptIndex += 1
      ) {
        const startedAt =
          Date.now();

        try {
          const response =
            await candidate.provider
              .generateChat(
                messages,
                requestOptions,
              );

          this.validateProviderResponse(
            response,
            options.validateResponse,
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
          lastCode =
            error?.code ||
            "PROVIDER_UNAVAILABLE";

          attempts.push({
            ...attemptBase,
            status: "failed",
            durationMs:
              Math.max(
                0,
                Date.now() -
                  startedAt,
              ),
            errorCode:
              lastCode,
          });

          if (
            lastCode ===
            "PROVIDER_AUTH_FAILED"
          ) {
            this.throwRoutingFailure(
              selection,
              attempts,
              lastCode,
            );
          }

          const retryAllowed =
            attemptIndex === 0 &&
            mayRetryFirstHfCandidate &&
            isTransientProviderFailureCode(
              lastCode,
            );

          if (!retryAllowed) {
            break;
          }

          await waitForRetry(
            transientRetryDelayMs(
              lastCode,
            ),
          );
        }
      }
    }

    this.throwRoutingFailure(
      selection,
      attempts,
      preferredRoutingFailureCode(
        attempts,
        lastCode,
      ),
    );
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
