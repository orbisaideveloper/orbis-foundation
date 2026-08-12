const AIProvider = require("./AIProvider.cjs");

class OllamaProvider extends AIProvider {
  constructor() {
    const isLocal = !process.env.OLLAMA_API_KEY;
    const baseUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
    const model = process.env.OLLAMA_MODEL || "tinyllama:latest";

    super("Ollama", isLocal ? "local" : "cloud", model);

    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = process.env.OLLAMA_API_KEY || null;
  }

  async generateChat(messages) {
    const headers = { "Content-Type": "application/json" };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `AI provider authentication failed. (${response.status})`,
          );
        }
        throw new Error(`AI backend unavailable (${response.status}).`);
      }

      const data = await response.json();
      const content = data?.message?.content?.trim() || "";

      if (!content) {
        throw new Error("AI backend returned an empty response.");
      }

      return {
        content,
        provider: this.getMetadata(),
      };
    } catch (error) {
      console.error(`[${this.name}_PROVIDER] Error:`, error.message);
      throw new Error(error.message || "Provider connection failed.");
    }
  }
}

module.exports = OllamaProvider;
