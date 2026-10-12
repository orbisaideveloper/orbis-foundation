class AIProvider {
  constructor(name, type, model) {
    this.name = name;
    this.type = type; // 'local' | 'cloud' | 'internal'
    this.model = model;
    this.health = { state: "UNKNOWN", checkedAt: null };
  }

  async generateChat() {
    throw new Error(
      "Method 'generateChat()' must be implemented by the provider.",
    );
  }

  getChatRequestOptions(options) {
    const request = {};
    if (options.responseFormat === "json_object") {
      request.response_format = { type: "json_object" };
    }
    if (Number.isInteger(options.maxTokens)
        && options.maxTokens >= 256 && options.maxTokens <= 4096) {
      request.max_tokens = options.maxTokens;
    }
    return request;
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
