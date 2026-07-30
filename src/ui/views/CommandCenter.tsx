import React from 'react';
import { AppLayout } from '../layout/AppLayout';
import { GlassCard } from '../components/GlassCard';
import { useDashboard } from '../hooks/useDashboard';

export const CommandCenter: React.FC = () => {
  const dashboardData = useDashboard();

  if (!dashboardData) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center text-gray-400">
          Syncing with ORBIS Core...
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--spacing-widget)]">
        
        {/* Widget: System Status */}
        <GlassCard title="System Status" delay={0.1}>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-gray-400">State</span>
              <span className="text-[#22C55E] font-mono">{dashboardData.header.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Event Count</span>
              <span className="font-mono">{dashboardData.header.eventCount}</span>
            </div>
          </div>
        </GlassCard>

        {/* Widget: Registries */}
        <GlassCard title="Active Components" delay={0.2}>
          <div className="text-4xl font-light text-[#F97316]">
            {dashboardData.registries.componentCount}
          </div>
          <div className="text-sm text-gray-400 mt-2">Registered singletons observing core</div>
        </GlassCard>

        {/* Widget: Runtime Snapshot (JSON Ready) */}
        <GlassCard title="Runtime Snapshot" delay={0.3}>
          <div className="bg-black/50 p-3 rounded-lg overflow-hidden max-h-32 text-xs font-mono text-gray-300">
            {dashboardData.grid.runtimeSnapshot.jsonView 
              ? dashboardData.grid.runtimeSnapshot.jsonView.slice(0, 150) + '...' 
              : 'Awaiting Snapshot...'}
          </div>
        </GlassCard>

      </div>
    </AppLayout>
  );
};
