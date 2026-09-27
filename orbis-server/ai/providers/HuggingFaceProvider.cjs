const AIProvider = require("./AIProvider.cjs");

const DEFAULT_ENDPOINT =
  "https://router.huggingface.co/v1/chat/completions";
const DEFAULT_MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct:fastest";

class HuggingFaceProvider extends AIProvider {
  constructor() {
    const token = process.env.HF_TOKEN || null;
    const model = process.env.HF_MODEL || DEFAULT_MODEL;
    const endpoint =
      process.env.HF_CHAT_COMPLETIONS_URL || DEFAULT_ENDPOINT;

    super("Hugging Face", "cloud", model);

    this.token = token;
    this.endpoint = endpoint;
  }

  async generateChat(messages, options = {}) {
    if (!this.token) {
      const error = new Error("PROVIDER_UNAVAILABLE");
      error.code = error.message;
      this.markUnavailable();
      throw error;
    }

    const timeoutMs = Math.max(
      1_000,
      Math.min(Number(options.timeoutMs) || 30_000, 60_000),
    );

    const requestModel = options.model || this.model;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: requestModel,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          const error = new Error("PROVIDER_AUTH_FAILED");
          error.code = error.message;
          throw error;
        }

        throw new Error(`PROVIDER_UNAVAILABLE_${response.status}`);
      }

      const data = await response.json();
      const content =
        data?.choices?.[0]?.message?.content?.trim() || "";

      if (!content) {
        throw new Error("PROVIDER_EMPTY_RESPONSE");
      }

      this.markHealthy();

      return {
        content,
        provider: {
          ...this.getMetadata(),
          model: requestModel,
        },
      };
    } catch (error) {
      this.markUnavailable();
      console.error(`[${this.name}_PROVIDER] Request failed`);

      const normalized = new Error(
        error?.name === "AbortError"
          ? "PROVIDER_TIMEOUT"
          : error?.code === "PROVIDER_AUTH_FAILED"
            ? "PROVIDER_AUTH_FAILED"
            : "PROVIDER_UNAVAILABLE",
      );

      normalized.code = normalized.message;
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }
}

module.exports = HuggingFaceProvider;
