import React from "react";
import { NavLink } from "react-router-dom";

const navItems = [
  { path: "/admin/dashboard", label: "Dashboard", icon: "📊" },
  { path: "/admin/engine", label: "Engine Monitor", icon: "⚙️" },
  { path: "/admin/brain", label: "Brain Monitor", icon: "🧠" },
  { path: "/admin/health", label: "System Health", icon: "💚" },
  { path: "/admin/release", label: "Release Manager", icon: "🚀" },
];

const AdminSidebar: React.FC = () => {
  return (
    <aside
      className="w-full md:w-72 shrink-0 flex flex-col bg-white/60 backdrop-blur-xl border-b md:border-b-0 md:border-r border-white shadow-lg md:h-full"
      aria-label="Admin Navigation"
    >
      {/* Desktop Header */}
      <div className="hidden md:block p-8 border-b border-white">
        <h2 className="text-3xl font-black text-slate-800 tracking-widest uppercase flex flex-col">
          <span>ORBIS</span>
          <span className="text-green-600 text-sm font-bold tracking-[0.4em] mt-1">
            FOUNDATION
          </span>
        </h2>
      </div>

      {/* Navigation Cards */}
      <nav className="p-4 overflow-x-auto md:overflow-y-auto flex md:flex-col gap-3 flex-1 scrollbar-hide">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex-shrink-0 md:flex-shrink flex items-center gap-4 px-5 py-3.5 md:py-4 rounded-2xl border transition-all duration-300 ${
                isActive
                  ? "bg-white border-green-100 text-green-700 shadow-md scale-105 md:scale-100 md:translate-x-2"
                  : "bg-transparent border-transparent text-slate-500 hover:bg-white/50 hover:text-slate-800"
              }`
            }
          >
            <span className="text-xl drop-shadow-sm">{item.icon}</span>
            <span className="text-sm font-bold tracking-wide whitespace-nowrap">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Desktop Footer with SonarCloud Issue Fixed */}
      <div className="hidden md:block p-6 border-t border-white text-xs font-bold text-slate-500 text-center bg-slate-50/50 mt-auto">
        <span className="text-green-500 animate-pulse">●</span> Zero Mock Data
        Policy Enforced
      </div>
    </aside>
  );
};

export default AdminSidebar;
