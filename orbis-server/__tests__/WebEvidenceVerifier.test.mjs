// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  MAX_EVIDENCE_AGE_MS,
  verifyWebSearchResult,
} = require("../ai/brain/WebEvidenceVerifier.cjs");

const NOW = Date.parse("2026-08-29T12:00:00.000Z");

function weatherCandidate(overrides = {}) {
  return {
    answer:
      "আজ শিলিগুড়িতে তাপমাত্রা 32.5°C এবং আর্দ্রতা 55%। আকাশ আংশিক পরিষ্কার।",
    retrievedAt: new Date(NOW).toISOString(),
    sources: [
      {
        title: "Siliguri weather",
        url: "https://weather.example.test/siliguri",
        publishedAt: "2026-08-29",
        excerpt:
          "Siliguri temperature is 32.5°C with 55% humidity and partly clear skies.",
      },
    ],
    ...overrides,
  };
}

describe("WebEvidenceVerifier", () => {
  it("verifies fresh weather evidence and removes internal excerpts", () => {
    const result = verifyWebSearchResult(
      "আজকের weather বলো শিলিগুড়ি",
      weatherCandidate(),
      { now: NOW, expectedLocation: "শিলিগুড়ি" },
    );

    expect(result).toMatchObject({
      evidence: {
        kind: "web-search",
        sources: [
          {
            title: "Siliguri weather",
            url: "https://weather.example.test/siliguri",
          },
        ],
        verification: {
          status: "verified",
          locationMatched: true,
          numericFactsSupported: true,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("temperature is");
  });

  it("rejects a weather answer for the wrong location", () => {
    expect(
      verifyWebSearchResult(
        "আজকের weather বলো শিলিগুড়ি",
        weatherCandidate({
          answer: "আজ চট্টগ্রামে তাপমাত্রা 32.5°C এবং আর্দ্রতা 55%।",
        }),
        { now: NOW, expectedLocation: "শিলিগুড়ি" },
      ),
    ).toBeNull();
  });

  it("rejects numeric claims that do not appear in source excerpts", () => {
    expect(
      verifyWebSearchResult(
        "শিলিগুড়ির weather বলো",
        weatherCandidate({
          answer: "শিলিগুড়িতে আজ তাপমাত্রা 41°C।",
        }),
        { now: NOW },
      ),
    ).toBeNull();
  });

  it("rejects stale evidence and non-http source links", () => {
    expect(
      verifyWebSearchResult(
        "latest news",
        weatherCandidate({
          retrievedAt: new Date(NOW - MAX_EVIDENCE_AGE_MS - 1).toISOString(),
        }),
        { now: NOW },
      ),
    ).toBeNull();
    expect(
      verifyWebSearchResult(
        "latest news",
        weatherCandidate({
          sources: [
            {
              title: "Unsafe",
              url: "javascript:alert(1)",
              excerpt: "Unsafe",
            },
          ],
        }),
        { now: NOW },
      ),
    ).toBeNull();
  });
});
