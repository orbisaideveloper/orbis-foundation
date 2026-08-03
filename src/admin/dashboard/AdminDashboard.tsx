import React from 'react';
import { useAdminServices } from '../services/useAdminServices';
import { StatCard } from './components/StatCard';

export const AdminDashboard: React.FC = () => {
  const { state, actions } = useAdminServices();
  const { user, role, isAuthenticated, systemHealth, runtimeMetrics, activeRelease } = state;

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-6">
        <div className="border border-red-500/50 bg-red-900/10 p-6 text-center max-w-md w-full">
          <h2 className="text-2xl mb-2 font-bold text-red-500 tracking-widest">SYSTEM LOCKED</h2>
          <p className="text-sm text-red-400 mb-6">Identity verification required to access core modules.</p>
          <button
            type="button"
            onClick={() => actions.login('init-token')}
            className="w-full px-6 py-3 border border-green-500 text-green-500 hover:bg-green-900/30 transition-colors tracking-wider"
          >
            &gt; INITIATE LOGIN SEQUENCE
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="IDENTITY_MODULE" 
          value={user || 'UNKNOWN'} 
          subtitle={`ROLE: ${role} | RESTART: ${actions.hasPermission('SYSTEM_RESTART') ? 'GRANTED' : 'DENIED'}`} 
        />
        <StatCard 
          title="SYSTEM_HEALTH" 
          value={systemHealth} 
          subtitle="Core operational status" 
        />
        <StatCard 
          title="ACTIVE_RELEASE" 
          value={activeRelease} 
          subtitle="Current deployment version" 
        />
        <StatCard 
          title="RUNTIME_METRICS" 
          value={`${runtimeMetrics.cpu}% CPU`} 
          subtitle={`MEM: ${runtimeMetrics.memory}%`} 
        />
      </div>
    </div>
  );
};
