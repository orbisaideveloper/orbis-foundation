class TavilySearch {
  async search(query) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ [TAVILY] API Key missing. Skipping web search.");
      return null;
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: query,
          search_depth: "basic",
          include_answer: true, // Tavily নিজে থেকেই একটি AI সামারি পাঠাবে
          max_results: 3,
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();

      // যদি Tavily সরাসরি উত্তর তৈরি করে দেয়
      if (data.answer) return data.answer;

      // নাহলে সেরা ৩টি রেজাল্ট থেকে টেক্সট তুলে আনা
      if (data.results && data.results.length > 0) {
        return data.results.map((r) => r.content).join("\n\n");
      }

      return null;
    } catch (error) {
      console.error("[TAVILY] Request failed:", error.message);
      return null;
    }
  }
}

module.exports = new TavilySearch();
