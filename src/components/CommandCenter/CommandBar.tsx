import React, { useState } from "react";
import {
  getSpeechRecognitionConstructor,
  readVoiceResult,
  VOICE_LANGUAGES,
  VoiceLanguage,
  voiceErrorMessage,
} from "../../features/voice/browserSpeech";

interface CommandBarProps {
  readonly onCommandSubmit: (command: string) => void;
}

export default function CommandBar({ onCommandSubmit }: CommandBarProps) {
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>("bn-IN");
  const [voiceStatus, setVoiceStatus] = useState("");

  const startVoiceCommand = () => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      alert("Browser doesn't support voice input.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = voiceLanguage;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus("শুনছি…");
    };
    recognition.onend = () => {
      setIsListening(false);
      setVoiceStatus((current) =>
        current === "শুনছি…" ? "কথা শোনা যায়নি। আবার চেষ্টা করুন।" : current,
      );
    };

    recognition.onresult = (event: any) => {
      const result = readVoiceResult(event);
      setInput(result.transcript);
      setVoiceStatus(
        result.transcript
          ? "কমান্ডটি দেখে Run চাপুন।"
          : "কথা শোনা যায়নি। আবার চেষ্টা করুন।",
      );
    };
    recognition.onerror = (event: any) => {
      setIsListening(false);
      setVoiceStatus(voiceErrorMessage(event?.error));
    };
    recognition.start();
  };

  const handleTextSubmit = () => {
    if (input.trim() !== "") onCommandSubmit(input);
  };

  return (
    <div className="mt-2 w-full rounded-[16px] border border-gray-200 bg-white p-2 shadow-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={startVoiceCommand}
          aria-label={isListening ? "Stop voice input" : "Start voice input"}
          aria-pressed={isListening}
          className={`p-2.5 rounded-xl transition shrink-0 ${isListening ? "bg-red-500 animate-pulse text-white" : "bg-gray-100 hover:bg-gray-200 text-teal-600"}`}
        >
          🎤
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
          placeholder="ORBIS-কে নির্দেশ দিন..."
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-gray-700 px-1 text-[13px]"
        />
        <button
          type="button"
          onClick={handleTextSubmit}
          className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-xl font-bold text-[13px] transition shrink-0"
        >
          রান
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 px-1">
        <select
          aria-label="Voice language"
          value={voiceLanguage}
          disabled={isListening}
          onChange={(event) =>
            setVoiceLanguage(event.target.value as VoiceLanguage)
          }
          className="max-w-[48%] bg-transparent text-[11px] text-gray-500 outline-none"
        >
          {VOICE_LANGUAGES.map((language) => (
            <option key={language.value} value={language.value}>
              {language.label}
            </option>
          ))}
        </select>
        {voiceStatus ? (
          <output
            className="truncate text-right text-[11px] text-gray-500"
          >
            {voiceStatus}
          </output>
        ) : null}
      </div>
    </div>
  );
}
