class AIProvider {
  constructor(name, type, model) {
    this.name = name;
    this.type = type; // 'local' | 'cloud' | 'internal'
    this.model = model;
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
    };
  }
}

module.exports = AIProvider;
