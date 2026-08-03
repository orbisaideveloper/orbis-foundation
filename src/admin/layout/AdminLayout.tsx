import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';

const AdminLayout: React.FC = () => {
  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#0a0f0d] text-gray-100 overflow-hidden font-sans relative" role="application">
      {/* Glassmorphism Background Glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-15%] left-[-10%] w-96 h-96 bg-green-500/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-15%] right-[-10%] w-96 h-96 bg-orange-500/20 rounded-full blur-[120px]"></div>
      </div>

      {/* Sidebar / Mobile Nav */}
      <AdminSidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="w-full h-16 bg-white/5 backdrop-blur-md border-b border-white/10 flex items-center px-4 md:px-6 justify-between shrink-0 z-10 shadow-sm">
          <h1 className="text-lg md:text-xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-orange-400">
            ORBIS COMMAND CENTER
          </h1>
          <div className="flex items-center space-x-3 bg-black/20 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <span className="text-xs font-medium text-green-400 uppercase tracking-wider">System Live</span>
          </div>
        </header>

        <section className="flex-1 p-4 md:p-6 overflow-y-auto">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-500"></div>
            </div>
          }>
            {/* Glass Container for Real Data & Logs */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-4 md:p-6 shadow-2xl min-h-full">
               <Outlet />
            </div>
          </Suspense>
        </section>
      </main>
    </div>
  );
};

export default AdminLayout;
