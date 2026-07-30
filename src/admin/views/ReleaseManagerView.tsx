import React from 'react';

const ReleaseManagerView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-white">Release & Version Management</h2>
        <span className="px-3 py-1 bg-yellow-900/50 text-yellow-500 border border-yellow-700 rounded-full text-xs font-semibold uppercase">
          Master Approval Gateway
        </span>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Placeholder: Current Public Version */}
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg">
          <h3 className="text-gray-400 text-sm font-medium uppercase mb-4">Current Public Version</h3>
          <div className="space-y-3 font-mono text-sm text-gray-300">
            <p>Version ID: <span className="text-white">--</span></p>
            <p>Publish Date: <span className="text-white">--</span></p>
            <p>Stable Status: <span className="text-white">--</span></p>
          </div>
        </div>

        {/* Placeholder: Candidate Version */}
        <div className="bg-blue-950/30 border border-blue-900 p-6 rounded-lg">
          <h3 className="text-blue-400 text-sm font-medium uppercase mb-4">Candidate Version (Pending Approval)</h3>
          <div className="space-y-3 font-mono text-sm text-gray-300">
            <p>Candidate ID: <span className="text-white">--</span></p>
            <p>SonarCloud Gate: <span className="text-white">--</span></p>
            <p>Approval Status: <span className="text-white">--</span></p>
          </div>
          <div className="mt-6">
            {/* Added type="button" here to fix SonarCloud Code Smell */}
            <button type="button" disabled className="px-4 py-2 bg-gray-700 text-gray-400 rounded cursor-not-allowed text-sm font-semibold transition-all">
              Approve & Publish (Locked)
            </button>
          </div>
        </div>
      </div>

      {/* Placeholder: Release History */}
      <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg mt-6">
        <h3 className="text-gray-400 text-sm font-medium uppercase mb-4">Publish & Rollback History</h3>
        <p className="text-sm text-gray-500 italic">No release data loaded. Awaiting integration with EventBus.</p>
      </div>
    </div>
  );
};

export default ReleaseManagerView;
