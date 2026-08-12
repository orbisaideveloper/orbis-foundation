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
}

module.exports = new AIProviderManager();
