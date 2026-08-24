const OllamaProvider = require("./providers/OllamaProvider.cjs");

class AIProviderManager {
  constructor() {
    this.providers = new Map();
    this.activeProviderName = null;
    this.initializeDefaultProviders();
  }

  initializeDefaultProviders() {
    const ollama = new OllamaProvider();
    this.registerProvider(ollama);
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

  async generateChat(messages, options = {}) {
    const active = this.getActiveProvider();
    const candidates = [
      active,
      ...Array.from(this.providers.values()).filter(
        (provider) => provider !== active,
      ),
    ].slice(0, 2);

    let lastCode = "PROVIDER_UNAVAILABLE";
    for (const provider of candidates) {
      try {
        return await provider.generateChat(messages, {
          timeoutMs: options.timeoutMs || 30_000,
        });
      } catch (error) {
        lastCode = error?.code || "PROVIDER_UNAVAILABLE";
      }
    }

    const normalized = new Error(lastCode);
    normalized.code = lastCode;
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
    };
  }
}

module.exports = new AIProviderManager();
