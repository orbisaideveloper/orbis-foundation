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

  async generateChat(messages, options = {}) {
    const headers = { "Content-Type": "application/json" };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const timeoutMs = Math.max(
      1_000,
      Math.min(Number(options.timeoutMs) || 30_000, 60_000),
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          stream: false,
        }),
        signal: controller.signal,
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

      this.markHealthy();

      return {
        content,
        provider: this.getMetadata(),
      };
    } catch (error) {
      this.markUnavailable();
      console.error(`[${this.name}_PROVIDER] Request failed`);
      const normalized = new Error(
        error?.name === "AbortError"
          ? "PROVIDER_TIMEOUT"
          : "PROVIDER_UNAVAILABLE",
      );
      normalized.code = normalized.message;
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = OllamaProvider;
