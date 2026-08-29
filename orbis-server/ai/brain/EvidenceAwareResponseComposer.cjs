const BENGALI_NORMALIZATIONS = Object.freeze([
  [/আংশিক\s+বিশুদ্ধ\s+আকাশ/giu, "আকাশ আংশিক পরিষ্কার"],
  [
    /উচ্চ\s+উল্টারায়োন(?:\s+রশ্মির)?(?:\s+তীব্রতা|\s+তীব্র)?/giu,
    "UV রশ্মির তীব্রতা বেশি",
  ],
  [/উল্টারায়োন/giu, "UV"],
]);

function normalizeSpacing(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function composeEvidenceAwareWebAnswer(answer, lang) {
  let content = normalizeSpacing(answer);
  if (lang === "bn") {
    for (const [pattern, replacement] of BENGALI_NORMALIZATIONS) {
      content = content.replace(pattern, replacement);
    }
  }
  return `[ORBIS Web Analysis]:\n${content}`;
}

module.exports = {
  composeEvidenceAwareWebAnswer,
  normalizeSpacing,
};
