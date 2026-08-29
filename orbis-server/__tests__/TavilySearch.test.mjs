// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tavilySearch = require("../ai/tools/TavilySearch.cjs");
const originalApiKey = process.env.TAVILY_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalApiKey === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = originalApiKey;
});

describe("TavilySearch", () => {
  it("does not make a network request when no API key is configured", async () => {
    delete process.env.TAVILY_API_KEY;
    const fetchMock = vi.spyOn(global, "fetch");

    await expect(tavilySearch.search("weather in Kolkata")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a bounded Bengali instruction and returns Tavily's answer with source evidence", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        answer: "আজ বৃষ্টি হতে পারে",
        results: [
          {
            title: "Weather authority",
            url: "https://weather.example.test/siliguri",
            published_date: "2026-08-29",
          },
        ],
      }),
    });

    await expect(tavilySearch.search("Kolkata weather", "bn")).resolves.toMatchObject({
      answer: "আজ বৃষ্টি হতে পারে",
      sources: [
        {
          title: "Weather authority",
          url: "https://weather.example.test/siliguri",
          publishedAt: "2026-08-29",
        },
      ],
      retrievedAt: expect.any(String),
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request).toMatchObject({
      api_key: "test-key",
      query: "Kolkata weather (দয়া করে বাংলায় উত্তর দিন)",
      search_depth: "basic",
      include_answer: true,
      max_results: 3,
    });
  });

  it("returns bounded result content with validated links and safely handles failures", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    const fetchMock = vi.spyOn(global, "fetch");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [
          {
            title: "First source",
            url: "https://news.example.test/one",
            content: "First",
          },
          {
            title: "Second source",
            url: "https://news.example.test/two",
            content: "Second",
          },
        ],
      }),
    });
    fetchMock.mockResolvedValueOnce({ ok: false });
    fetchMock.mockRejectedValueOnce(new Error("network failure"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(tavilySearch.search("latest news", "en")).resolves.toMatchObject({
      answer: "First\n\nSecond",
      sources: [
        { title: "First source", url: "https://news.example.test/one" },
        { title: "Second source", url: "https://news.example.test/two" },
      ],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).toBe(
      "latest news (please answer in English)",
    );
    await expect(tavilySearch.search("unavailable")).resolves.toBeNull();
    await expect(tavilySearch.search("failure")).resolves.toBeNull();
  });

  it("does not call a linkless Tavily response verified web research", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ answer: "Unverifiable answer" }),
    });

    await expect(tavilySearch.search("latest update")).resolves.toBeNull();
  });
});
