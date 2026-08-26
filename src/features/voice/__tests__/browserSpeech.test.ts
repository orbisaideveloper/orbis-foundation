import { describe, expect, it } from "vitest";
import {
  normalizeVoiceTranscript,
  readVoiceResult,
  voiceErrorMessage,
} from "../browserSpeech";

describe("browserSpeech", () => {
  it("normalizes mixed Bangla, Hindi, and English whitespace without translating", () => {
    expect(normalizeVoiceTranscript("  ঘনশ্যামকে   ১২০ liter  देना है  ")).toBe(
      "ঘনশ্যামকে ১২০ liter देना है",
    );
  });

  it("combines final and interim segments and preserves alternatives", () => {
    const result = readVoiceResult({
      results: Object.assign(
        [
          Object.assign(
            [
              { transcript: "ঘনশ্যামকে ", confidence: 0.92 },
              { transcript: "ঘন শ্যামকে", confidence: 0.7 },
            ],
            { isFinal: true },
          ),
          Object.assign([{ transcript: "১২০ liter দাও", confidence: 0.88 }], {
            isFinal: false,
          }),
        ],
        { length: 2 },
      ),
    });

    expect(result.transcript).toBe("ঘনশ্যামকে ১২০ liter দাও");
    expect(result.confidence).toBeCloseTo(0.9);
    expect(result.alternatives).toContain("ঘন শ্যামকে");
  });

  it("provides actionable microphone errors", () => {
    expect(voiceErrorMessage("not-allowed")).toContain("permission");
    expect(voiceErrorMessage("no-speech")).toContain("শোনা যায়নি");
  });
});
