import React, { useState } from 'react';

const AdminDashboard: React.FC = () => {
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Bento Box Layout Configuration
  const cards = [
    { 
      id: 'engine', title: 'Engine Status', value: 'ONLINE', sub: 'Peak Performance', 
      colSpan: 'col-span-2 md:col-span-2', rowSpan: 'row-span-2', 
      color: 'bg-gradient-to-br from-green-50 to-green-100 border-green-200', textColor: 'text-green-800', 
      icon: '🟢', details: 'Engine is running flawlessly. Core temperature is normal, processing 2400 tasks per second. No active warnings or bottlenecks.' 
    },
    { 
      id: 'ram', title: 'RAM Usage', value: '42%', sub: 'Healthy', 
      colSpan: 'col-span-1', rowSpan: 'row-span-1', 
      color: 'bg-white/80 border-slate-200', textColor: 'text-slate-800', 
      icon: '⚡', details: 'Memory allocation is highly optimized. Total 32GB, currently using 13.4GB. Cache is holding stable at 94% hit rate.' 
    },
    { 
      id: 'brain', title: 'Brain Sync', value: '99.9%', sub: 'Neural Net', 
      colSpan: 'col-span-1', rowSpan: 'row-span-1', 
      color: 'bg-blue-50/80 border-blue-100', textColor: 'text-blue-800', 
      icon: '🧠', details: 'AI models are perfectly synchronized. Deep learning nodes are actively learning from latest query datasets.' 
    },
    { 
      id: 'cockpit', title: 'Architecture', value: 'PHASE 04', sub: 'Modular Active', 
      colSpan: 'col-span-2', rowSpan: 'row-span-1', 
      color: 'bg-white/80 border-slate-200', textColor: 'text-slate-800', 
      icon: '🏛️', details: 'Phase 04 Modular Architecture has been successfully deployed. System overview is ready for Phase 05 upgrades.' 
    }
  ];

  return (
    <div className="w-full h-full relative">
      
      {/* Bento Grid Layout */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 auto-rows-[140px]">
        {cards.map(card => (
          <div 
            key={card.id} 
            onClick={() => setActiveModal(card.id)}
            className={`rounded-3xl p-6 border backdrop-blur-xl shadow-sm hover:shadow-lg cursor-pointer transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between ${card.colSpan} ${card.rowSpan} ${card.color}`}
          >
            <div className="flex justify-between items-start">
              <h3 className={`text-xs md:text-sm font-extrabold uppercase tracking-widest ${card.textColor}`}>{card.title}</h3>
              <span className="text-xl md:text-2xl drop-shadow-sm">{card.icon}</span>
            </div>
            <div>
              <p className={`text-3xl md:text-4xl font-black ${card.textColor} leading-tight`}>{card.value}</p>
              <p className={`text-xs md:text-sm font-bold opacity-70 mt-1 ${card.textColor}`}>{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Glassmorphism Popup Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-md transition-opacity" onClick={() => setActiveModal(null)}>
          <div 
            className="bg-white/90 backdrop-blur-2xl border border-white p-8 rounded-3xl shadow-2xl max-w-md w-full transform transition-all scale-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-slate-800 tracking-wide uppercase">
                {cards.find(c => c.id === activeModal)?.title}
              </h2>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors rounded-full w-8 h-8 flex items-center justify-center font-bold">
                ✕
              </button>
            </div>
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 mb-8 shadow-inner">
              <p className="text-slate-600 leading-relaxed font-medium">
                {cards.find(c => c.id === activeModal)?.details}
              </p>
            </div>
            <button onClick={() => setActiveModal(null)} className="w-full py-3.5 bg-slate-800 text-white rounded-xl font-bold uppercase tracking-wider hover:bg-slate-700 hover:shadow-lg transition-all active:scale-95">
              Close Detail
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
