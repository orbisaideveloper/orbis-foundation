import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';

const AdminLayout: React.FC = () => {
  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-50 text-slate-800 overflow-hidden font-sans relative" role="application" aria-label="Protected Admin Control Center">
      {/* Light Glassmorphism Background Glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-green-200/50 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-blue-200/40 rounded-full blur-[100px]"></div>
      </div>

      {/* Sidebar / Mobile Nav */}
      <AdminSidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="w-full h-16 bg-white/70 backdrop-blur-lg border-b border-white flex items-center px-4 md:px-8 justify-between shrink-0 z-10 shadow-sm">
          <h1 className="text-lg md:text-xl font-extrabold tracking-wide text-slate-800">
            ORBIS Admin Command Center
          </h1>
          <div className="flex items-center space-x-3 bg-white px-4 py-1.5 rounded-full border border-slate-100 shadow-sm">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="text-xs font-bold text-green-600 uppercase tracking-wider">System Live</span>
          </div>
        </header>

        <section className="flex-1 p-4 md:p-8 overflow-y-auto">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-500"></div>
            </div>
          }>
            <Outlet />
          </Suspense>
        </section>
      </main>
    </div>
  );
};

export default AdminLayout;
