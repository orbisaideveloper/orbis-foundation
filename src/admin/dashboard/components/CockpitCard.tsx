import React from 'react';

export const CockpitCard = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="bg-[#0f172a] border border-[#22c55e]/20 rounded-lg p-5 hover:border-[#22c55e]/50 hover:shadow-[0_0_15px_rgba(34,197,94,0.1)] transition-all duration-300 flex flex-col h-full">
    <h3 className="text-[#FF9933] text-sm font-bold uppercase tracking-wider mb-4 border-b border-[#22c55e]/20 pb-2">
      {title}
    </h3>
    <div className="text-white flex-grow">
      {children}
    </div>
  </div>
);
