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
        
        <GlassCard title="System Status" delay={0.1} rawData={dashboardData.header}>
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

        <GlassCard title="Active Components" delay={0.2} rawData={dashboardData.registries}>
          <div className="text-4xl font-light text-[#F97316]">
            {dashboardData.registries.componentCount}
          </div>
          <div className="text-sm text-gray-400 mt-2">Registered singletons observing core</div>
        </GlassCard>

        <GlassCard title="Runtime Snapshot" delay={0.3} rawData={dashboardData.grid.runtimeSnapshot}>
          <div className="text-sm text-gray-400">
            Expand card to view raw runtime configurations.
          </div>
        </GlassCard>

      </div>
    </AppLayout>
  );
};
