export const VOICE_LANGUAGES = [
  { value: "bn-IN", label: "বাংলা + English" },
  { value: "hi-IN", label: "हिन्दी + English" },
  { value: "en-IN", label: "English (India)" },
] as const;

export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]["value"];

export interface VoiceResult {
  transcript: string;
  confidence: number | null;
  alternatives: string[];
}

interface SpeechAlternativeLike {
  transcript?: string;
  confidence?: number;
}

interface SpeechResultLike {
  isFinal?: boolean;
  length?: number;
  [index: number]: SpeechAlternativeLike;
}

interface SpeechEventLike {
  resultIndex?: number;
  results: {
    length: number;
    [index: number]: SpeechResultLike;
  };
}

export function normalizeVoiceTranscript(value: string): string {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function readVoiceResult(event: SpeechEventLike): VoiceResult {
  const finalParts: string[] = [];
  const interimParts: string[] = [];
  const alternatives = new Set<string>();
  const confidences: number[] = [];

  for (const result of Array.from(event.results)) {
    appendSpeechResult(
      result,
      finalParts,
      interimParts,
      alternatives,
      confidences,
    );
  }

  const transcript = normalizeVoiceTranscript(
    [...finalParts, ...interimParts].join(" "),
  );
  const confidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : null;

  return { transcript, confidence, alternatives: [...alternatives] };
}

function appendSpeechResult(
  result: SpeechResultLike,
  finalParts: string[],
  interimParts: string[],
  alternatives: Set<string>,
  confidences: number[],
): void {
  const best = result?.[0];
  const transcript = normalizeVoiceTranscript(best?.transcript || "");
  if (transcript) {
    (result?.isFinal ? finalParts : interimParts).push(transcript);
  }
  if (Number.isFinite(best?.confidence) && Number(best?.confidence) > 0) {
    confidences.push(Number(best?.confidence));
  }
  const alternativeCount = Math.min(result?.length || 0, 3);
  for (let altIndex = 0; altIndex < alternativeCount; altIndex += 1) {
    const alternative = normalizeVoiceTranscript(
      result?.[altIndex]?.transcript || "",
    );
    if (alternative) alternatives.add(alternative);
  }
}

export function voiceErrorMessage(code?: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Microphone permission দেওয়া হয়নি। Browser settings থেকে অনুমতি দিন।";
  }
  if (code === "no-speech") {
    return "কোনো কথা শোনা যায়নি। আবার চেষ্টা করুন।";
  }
  if (code === "audio-capture") {
    return "Microphone পাওয়া যায়নি। Device microphone পরীক্ষা করুন।";
  }
  if (code === "network") {
    return "Voice recognition service-এ সংযোগ হচ্ছে না। আবার চেষ্টা করুন।";
  }
  return "Voice input সম্পূর্ণ হয়নি। আবার চেষ্টা করুন।";
}

export function getSpeechRecognitionConstructor(): any {
  const speechWindow = window as any;
  return (
    speechWindow.SpeechRecognition ||
    speechWindow.webkitSpeechRecognition ||
    null
  );
}
