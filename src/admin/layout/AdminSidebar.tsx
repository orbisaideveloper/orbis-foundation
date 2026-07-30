import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/admin/dashboard', label: 'Dashboard' },
  { path: '/admin/engine', label: 'Engine Monitor' },
  { path: '/admin/brain', label: 'Brain Monitor' },
  { path: '/admin/health', label: 'System Health' },
  { path: '/admin/release', label: 'Release Manager' },
];

const AdminSidebar: React.FC = () => {
  return (
    <aside className="w-64 h-full bg-gray-950 border-r border-gray-800 flex flex-col shrink-0" aria-label="Admin Navigation">
      <div className="p-6 border-b border-gray-800">
        <h2 className="text-2xl font-bold text-white tracking-widest uppercase">ORBIS <span className="text-blue-500">ADM</span></h2>
      </div>
      <nav className="flex-1 py-4 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `px-6 py-3 text-sm font-medium transition-colors duration-200 ${
                isActive 
                  ? 'bg-blue-900/30 text-blue-400 border-r-4 border-blue-500' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-800 text-xs text-gray-600 text-center">
        Zero Mock Data Policy Enforced
      </div>
    </aside>
  );
};

export default AdminSidebar;
