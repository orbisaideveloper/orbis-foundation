const AIProvider = require("./AIProvider.cjs");

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

class GroqProvider extends AIProvider {
  constructor() {
    super("Groq", "cloud", process.env.GROQ_MODEL || "qwen/qwen3.8-27b");
    this.token = process.env.GROQ_API_KEY || null;
    this.enabled = process.env.GROQ_ENABLED === "true";
  }

  async generateChat(messages, options = {}) {
    if (!this.enabled) throw failure("PROVIDER_DISABLED");
    if (!this.token) throw failure("PROVIDER_AUTH_FAILED");

    const model = options.model || this.model;
    const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || 25000, 60000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "User-Agent": "OrbisFoundation/1.0",
          },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            temperature: 0.2,
            ...this.getChatRequestOptions(options),
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw failure(response.status === 401 || response.status === 403
          ? "PROVIDER_AUTH_FAILED"
          : `PROVIDER_UNAVAILABLE_${response.status}`);
      }

      const data = await response.json();
      const choice = data?.choices?.[0];
      const content = choice?.message?.content;
      if (choice?.finish_reason !== "stop"
          || typeof content !== "string" || !content.trim()
          || Buffer.byteLength(content, "utf8") > 48 * 1024) {
        throw failure("PROVIDER_RESPONSE_REJECTED");
      }
      this.markHealthy();
      return {
        content: content.trim(),
        provider: { ...this.getMetadata(), model },
      };
    } catch (error) {
      this.markUnavailable();
      const code = error?.name === "AbortError" ? "PROVIDER_TIMEOUT"
        : /^PROVIDER_[A-Z0-9_]+$/.test(error?.code || "")
          ? error.code : "PROVIDER_UNAVAILABLE";
      throw failure(code);
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = GroqProvider;
