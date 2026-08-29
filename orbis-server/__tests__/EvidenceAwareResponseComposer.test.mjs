// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  composeEvidenceAwareWebAnswer,
  normalizeSpacing,
} = require("../ai/brain/EvidenceAwareResponseComposer.cjs");

describe("EvidenceAwareResponseComposer", () => {
  it("normalizes the reported awkward Bengali weather wording", () => {
    const result = composeEvidenceAwareWebAnswer(
      "আজ আংশিক বিশুদ্ধ আকাশ। উচ্চ উল্টারায়োন তীব্র।",
      "bn",
    );

    expect(result).toBe(
      "[ORBIS Web Analysis]:\nআজ আকাশ আংশিক পরিষ্কার। UV রশ্মির তীব্রতা বেশি।",
    );
  });

  it("keeps English facts unchanged while bounding whitespace", () => {
    expect(
      composeEvidenceAwareWebAnswer(
        "  Temperature is 32.5°C.\n\n\nHumidity is 55%.  ",
        "en",
      ),
    ).toBe("[ORBIS Web Analysis]:\nTemperature is 32.5°C.\n\nHumidity is 55%.");
    expect(normalizeSpacing("one   two")).toBe("one two");
  });
});
