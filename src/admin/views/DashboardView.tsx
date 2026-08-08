import React from "react";
import { AdminDashboard } from "../dashboard/AdminDashboard";

const DashboardView: React.FC = () => {
  return (
    <div className="space-y-6 fade-in">
      <header className="flex justify-between items-end border-b border-green-500/50 pb-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-green-400 tracking-widest">
            ORBIS COMMAND CENTER
          </h2>
          <p className="text-sm opacity-70 text-green-500 font-mono">
            PHASE-03 ARCHITECTURE ACTIVE
          </p>
        </div>
      </header>

      {/* Delegating Dashboard UI rendering to AdminDashboard */}
      <AdminDashboard />
    </div>
  );
};

export default DashboardView;
