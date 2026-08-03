import React from 'react';

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle }) => (
  <div className="bg-gray-900/50 border border-green-800 p-4 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
    <h3 className="text-gray-400 text-sm font-medium uppercase border-b border-green-800/50 pb-1 mb-3 text-green-400">
      # {title}
    </h3>
    <div className="text-xl text-white font-mono">{value}</div>
    {subtitle && <div className="mt-2 text-sm opacity-70">{subtitle}</div>}
  </div>
);
