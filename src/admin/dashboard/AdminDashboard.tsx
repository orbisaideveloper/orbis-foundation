import React from 'react';
import { useAdminServices } from '../services/useAdminServices';

export const AdminDashboard: React.FC = () => {
  const { state, actions } = useAdminServices();
  const { user, role, isAuthenticated, systemHealth, runtimeMetrics, activeRelease } = state;

  // Unauthenticated View
  if (!isAuthenticated) {
    return (
      <div className="p-6 bg-gray-950 text-green-500 font-mono min-h-screen">
        <h1 className="text-3xl mb-4 tracking-widest font-bold">ORBIS TERMINAL</h1>
        <div className="border border-red-500/50 bg-red-900/10 p-4 inline-block mb-4">
          <p className="text-red-500">SYSTEM STATUS: UNAUTHENTICATED</p>
          <p className="text-sm text-red-400">Identity verification required to access core modules.</p>
        </div>
        <br />
        <button 
          type="button" 
          onClick={() => actions.login('init-token')}
          className="px-6 py-2 border border-green-500 hover:bg-green-900/30 transition-colors"
        >
          &gt; INITIATE LOGIN SEQUENCE
        </button>
      </div>
    );
  }

  // Authenticated View (Command Center)
  return (
    <div className="p-6 bg-gray-950 text-green-500 font-mono min-h-screen">
      <header className="flex justify-between items-end border-b border-green-500/50 pb-4 mb-6">
        <div>
          <h1 className="text-3xl tracking-widest font-bold text-green-400">ORBIS COMMAND CENTER</h1>
          <p className="text-sm opacity-70">PHASE-03 ARCHITECTURE ACTIVE</p>
        </div>
        <button 
          type="button" 
          onClick={actions.logout}
          className="px-4 py-1 border border-red-500 text-red-500 hover:bg-red-900/30 transition-colors text-sm"
        >
          [ TERMINATE SESSION ]
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Identity Module */}
        <div className="border border-green-800 p-4 bg-gray-900/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
          <h2 className="text-xl mb-3 border-b border-green-800 pb-1 text-green-400"># IDENTITY_MODULE</h2>
          <ul className="space-y-2">
            <li><span className="opacity-50">USER_ID:</span> {user}</li>
            <li><span className="opacity-50">ROLE_ACCESS:</span> {role}</li>
            <li>
              <span className="opacity-50">SYS_RESTART_PERM:</span>{' '}
              {actions.hasPermission('SYSTEM_RESTART') ? (
                <span className="text-green-400">GRANTED</span>
              ) : (
                <span className="text-red-500">DENIED</span>
              )}
            </li>
          </ul>
        </div>

        {/* Telemetry Module */}
        <div className="border border-green-800 p-4 bg-gray-900/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
          <h2 className="text-xl mb-3 border-b border-green-800 pb-1 text-green-400"># TELEMETRY_DATA</h2>
          <ul className="space-y-2">
            <li><span className="opacity-50">HEALTH:</span> {systemHealth}</li>
            <li><span className="opacity-50">ACTIVE_RELEASE:</span> {activeRelease}</li>
            <li>
              <span className="opacity-50">CPU_LOAD:</span> {runtimeMetrics.cpu}% 
              <span className="mx-2 opacity-50">|</span> 
              <span className="opacity-50">MEM_USAGE:</span> {runtimeMetrics.memory}%
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
