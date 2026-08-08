import React, { useState } from "react";

interface CommandBarProps {
  readonly onCommandSubmit: (command: string) => void;
}

export default function CommandBar({ onCommandSubmit }: CommandBarProps) {
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);

  const startVoiceCommand = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Browser doesn't support voice input.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "bn-BD";
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      onCommandSubmit(transcript);
    };
    recognition.start();
  };

  const handleTextSubmit = () => {
    if (input.trim() !== "") onCommandSubmit(input);
  };

  return (
    <div className="w-full mt-2 bg-white border border-gray-200 rounded-[16px] p-2 flex items-center gap-2 shadow-sm">
      <button
        type="button"
        onClick={startVoiceCommand}
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
  );
}
