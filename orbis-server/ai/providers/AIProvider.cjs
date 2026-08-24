class AIProvider {
  constructor(name, type, model) {
    this.name = name;
    this.type = type; // 'local' | 'cloud' | 'internal'
    this.model = model;
    this.health = { state: "UNKNOWN", checkedAt: null };
  }

  async generateChat(messages) {
    void messages;

    throw new Error(
      "Method 'generateChat()' must be implemented by the provider.",
    );
  }

  getMetadata() {
    return {
      name: this.name,
      type: this.type,
      model: this.model,
      health: { ...this.health },
    };
  }

  markHealthy() {
    this.health = { state: "AVAILABLE", checkedAt: Date.now() };
  }

  markUnavailable() {
    this.health = { state: "UNAVAILABLE", checkedAt: Date.now() };
  }
}

module.exports = AIProvider;
