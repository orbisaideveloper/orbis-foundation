import React, { useState } from 'react';

// TypeScript-এর জন্য Props-এর টাইপ বলে দেওয়া হলো
interface CommandBarProps {
  onCommandSubmit: (command: string) => void;
}

export default function CommandBar({ onCommandSubmit }: CommandBarProps) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);

  const startVoiceCommand = () => {
    // window object-কে 'any' টাইপ হিসেবে ধরে নেওয়া হলো যাতে TS এরর না দেয়
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Browser doesn't support voice input.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'bn-BD';
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
    if (input.trim() !== '') onCommandSubmit(input);
  };

  return (
    <div className="w-full mt-6 bg-white border border-gray-200 rounded-2xl p-3 flex items-center gap-3 shadow-sm">
      <button
        onClick={startVoiceCommand}
        className={`p-3 rounded-xl transition ${isListening ? 'bg-red-500 animate-pulse text-white' : 'bg-gray-100 hover:bg-gray-200 text-teal-600'}`}
      >🎤</button>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
        placeholder="ORBIS-কে নির্দেশ দিন..."
        className="flex-1 bg-transparent border-none outline-none text-gray-700 px-3 text-sm"
      />
      <button
        onClick={handleTextSubmit}
        className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition"
      >রান</button>
    </div>
  );
}
