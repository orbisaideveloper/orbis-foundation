import React from "react";

const SystemHealthView: React.FC = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-white">
        System Health & Diagnostics
      </h2>
      <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg">
        <p className="text-sm text-gray-500">
          Security Monitoring and Log stream will be connected here.
        </p>
      </div>
    </div>
  );
};

export default SystemHealthView;
