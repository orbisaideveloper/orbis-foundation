import React from 'react';
import { Activity } from 'lucide-react';

export const AppHeader: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[var(--glass-opacity-border)] bg-[var(--glass-opacity-bg)] px-8 py-4 backdrop-blur-[var(--glass-blur)]">
      <div className="flex items-center gap-3">
        <Activity className="text-[#F97316] animate-pulse" size={24} />
        <h1 className="text-xl font-bold tracking-widest uppercase">
          ORBIS <span className="font-light text-gray-400">Foundation</span>
        </h1>
      </div>
      <div className="text-xs text-gray-400 flex gap-4">
        <span>AI-Native Engineering Command Center</span>
        <span className="text-[#22C55E] flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
          <span>CORE ONLINE</span>
        </span>
      </div>
    </header>
  );
};
