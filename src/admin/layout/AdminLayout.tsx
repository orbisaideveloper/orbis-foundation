import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';

const AdminLayout: React.FC = () => {
  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100 overflow-hidden font-sans" role="application" aria-label="Protected Admin Control Center">
      {/* Sidebar for Navigation */}
      <AdminSidebar />
      
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full relative overflow-y-auto">
        <header className="w-full h-16 border-b border-gray-700 bg-gray-800 flex items-center px-6 justify-between shrink-0">
          <h1 className="text-xl font-semibold tracking-wide text-gray-200">ORBIS Admin Command Center</h1>
          <div className="flex items-center space-x-4">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="text-sm text-gray-400">System Secure</span>
          </div>
        </header>

        <section className="flex-1 p-6">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" aria-label="Loading Admin Module..."></div>
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
