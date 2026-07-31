import React from 'react';
import { AdminCoreProvider } from './admin/providers/AdminCoreProvider';
import { AdminDashboard } from './admin/dashboard/AdminDashboard';

const App: React.FC = () => {
  return (
    <AdminCoreProvider>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        <header className="bg-slate-900 text-white p-4 shadow-md flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-wider">ORBIS TERMINAL</h1>
          <span className="text-xs bg-green-500 text-green-900 px-2 py-1 rounded font-bold">SYSTEM ONLINE</span>
        </header>
        <main className="p-4">
          <AdminDashboard />
        </main>
      </div>
    </AdminCoreProvider>
  );
};

export default App;
