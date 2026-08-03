import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { path: '/admin/engine', label: 'Engine Monitor', icon: '⚙️' },
  { path: '/admin/brain', label: 'Brain Monitor', icon: '🧠' },
  { path: '/admin/health', label: 'System Health', icon: '💚' },
  { path: '/admin/release', label: 'Release Manager', icon: '🚀' },
];

const AdminSidebar: React.FC = () => {
  return (
    <aside className="w-full md:w-72 shrink-0 flex flex-col bg-black/40 md:bg-white/5 backdrop-blur-xl border-b md:border-b-0 md:border-r border-white/10 z-20 shadow-lg md:h-full" aria-label="Admin Navigation">
      {/* Desktop Header */}
      <div className="hidden md:block p-6 border-b border-white/10">
        <h2 className="text-3xl font-black text-white tracking-widest uppercase flex flex-col">
          <span>ORBIS</span> 
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-orange-400 text-sm tracking-[0.4em] mt-1">FOUNDATION</span>
        </h2>
      </div>
      
      {/* Navigation Cards */}
      <nav className="p-4 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-3 md:gap-4 flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex-shrink-0 md:flex-shrink flex items-center gap-3 px-5 py-3.5 md:py-4 rounded-2xl border backdrop-blur-md transition-all duration-300 ${
                isActive
                  ? 'bg-gradient-to-r from-green-500/20 to-orange-500/20 border-green-500/50 text-white shadow-[0_0_20px_rgba(34,197,94,0.15)] scale-105 md:scale-100 md:translate-x-2'
                  : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-100 hover:border-orange-500/30'
              }`
            }
          >
            <span className="text-xl md:text-2xl drop-shadow-md">{item.icon}</span>
            <span className="text-sm md:text-base font-bold tracking-wide whitespace-nowrap">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      
      {/* Desktop Footer */}
      <div className="hidden md:block p-5 border-t border-white/10 text-xs font-mono text-gray-400 text-center bg-black/20 mt-auto">
        <span className="text-orange-500 animate-pulse mr-2">●</span> 
        REAL-TIME SECURE SYNC
      </div>
    </aside>
  );
};

export default AdminSidebar;
