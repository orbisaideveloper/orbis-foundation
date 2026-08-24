function createProviderLearningCandidateGenerator(providerManager) {
  return async function generateLearningCandidate(sourceText) {
    const response = await providerManager.generateChat(
      [
        {
          role: "system",
          content:
            "Convert the supplied text into one concise, reusable, non-personal Foundation knowledge statement. " +
            "Do not quote or preserve wording from the source. Exclude people, accounts, contact details, precise locations, secrets, files, and conversational context. " +
            "Return only strict JSON with keys content, category, tags. category must be one of FOUNDATION_GUIDANCE, PRODUCT_KNOWLEDGE, OPERATING_RULE, GENERAL_KNOWLEDGE. " +
            'tags must contain 1-5 lowercase ASCII slug strings. If safe generalization is uncertain, return {"content":"","category":"GENERAL_KNOWLEDGE","tags":[]}. No markdown.',
        },
        { role: "user", content: sourceText },
      ],
      { timeoutMs: 20_000 },
    );
    if (typeof response?.content !== "string") {
      const error = new Error("LEARNING_CANDIDATE_UNAVAILABLE");
      error.code = error.message;
      throw error;
    }
    const text = response.content.trim();
    if (!text.startsWith("{") || !text.endsWith("}")) {
      const error = new Error("LEARNING_CANDIDATE_REJECTED");
      error.code = error.message;
      throw error;
    }
    return JSON.parse(text);
  };
}

module.exports = { createProviderLearningCandidateGenerator };
