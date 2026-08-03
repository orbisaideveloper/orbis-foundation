import React from 'react';
import { SystemOverview } from './sections/SystemOverview';
import { EngineStatus } from './sections/EngineStatus';
import { BrainStatus } from './sections/BrainStatus';
import { AIProviders } from './sections/AIProviders';
import { Runtime } from './sections/Runtime';
import { Release } from './sections/Release';
import { InstalledModules } from './sections/InstalledModules';
import { QuickActions } from './sections/QuickActions';

export const AdminDashboard = () => {
  return (
    <div className="p-4 md:p-6 min-h-screen bg-black">
      {/* Cockpit Header */}
      <header className="mb-8 border-b border-[#22c55e]/30 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-widest uppercase">
              ORBIS <span className="text-[#22c55e]">Cockpit</span>
            </h1>
            <p className="text-xs font-mono text-[#FF9933] mt-1">
              Phase 04 // Modular Architecture Active
            </p>
          </div>
          <div className="hidden sm:block">
            <span className="px-3 py-1 bg-gray-900 text-gray-300 text-xs font-mono border border-gray-700 rounded-sm">
              Status: SECURE
            </span>
          </div>
        </div>
      </header>

      {/* Modular Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <SystemOverview />
        <EngineStatus />
        <BrainStatus />
        <AIProviders />
        <Runtime />
        <Release />
        <InstalledModules />
        <QuickActions />
      </div>
    </div>
  );
};
