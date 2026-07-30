import React from 'react';
import { useAdminServices } from '../services/useAdminServices';

export const AdminDashboard: React.FC = () => {
  // Consuming stable data and actions from the service layer bridging all contexts
  const { state, actions } = useAdminServices();
  const { user, systemHealth, runtimeMetrics, activeRelease } = state;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold mb-8 border-b pb-4">ORBIS Command Center</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Auth Section */}
        <section className="border rounded-lg p-6 shadow-sm bg-white">
          <h3 className="text-xl font-semibold mb-4">Operator Info</h3>
          <div className="space-y-2 mb-4">
            <p><strong>Name:</strong> {user?.name || 'Unknown'}</p>
            <p><strong>Role:</strong> {user?.role || 'GUEST'}</p>
          </div>
          <button 
            type="button"
            onClick={actions.logout}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
          >
            Logout
          </button>
        </section>

        {/* Runtime/Health Section */}
        <section className="border rounded-lg p-6 shadow-sm bg-white">
          <h3 className="text-xl font-semibold mb-4">System Health</h3>
          <div className="space-y-2">
            <p><strong>Engine Status:</strong> {systemHealth.engine}</p>
            <p><strong>Brain Status:</strong> {systemHealth.brain}</p>
            <p><strong>CPU Usage:</strong> {runtimeMetrics.cpuUsage}%</p>
            <p><strong>Memory Usage:</strong> {runtimeMetrics.memoryUsage}%</p>
          </div>
        </section>

        {/* Release Pipeline Section */}
        <section className="border rounded-lg p-6 shadow-sm bg-white">
          <h3 className="text-xl font-semibold mb-4">Release Pipeline</h3>
          <div className="space-y-2 mb-6">
            <p><strong>Status:</strong> {activeRelease?.status || 'NO ACTIVE RELEASE'}</p>
            <p><strong>Version:</strong> {activeRelease?.versionNumber || 'N/A'}</p>
          </div>
          
          <div className="flex flex-col gap-2">
            {!activeRelease && (
              <button 
                type="button"
                onClick={() => actions.initiateReleaseDraft('v2.0.0', ['Core optimization'])}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
              >
                Initiate Draft
              </button>
            )}
            {activeRelease?.status === 'DRAFT' && (
              <button 
                type="button"
                onClick={() => actions.approveRelease(activeRelease.id)}
                className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 transition-colors"
              >
                Approve Release
              </button>
            )}
            {activeRelease?.status === 'APPROVED' && (
              <button 
                type="button"
                onClick={() => actions.publishRelease(activeRelease.id)}
                className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
              >
                Publish Release
              </button>
            )}
            {activeRelease?.status === 'PUBLISHED' && (
              <button 
                type="button"
                onClick={() => actions.rollbackRelease(activeRelease.id)}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors"
              >
                Rollback
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
