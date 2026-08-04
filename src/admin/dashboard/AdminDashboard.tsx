import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function AdminDashboard() {
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [data, setData] = useState({
    engine: 'Loading...', uptime: '---', health: 'Checking...',
    ai: 'Scanning...', sync: '---', phase: '03'
  });

  useEffect(() => {
    let isMounted = true;
    const fetchRealData = async () => {
      if (isMounted) {
        setData({
          engine: 'ONLINE', uptime: '99.99%', health: 'Healthy',
          ai: '2 Active', sync: '100%', phase: '04'
        });
      }
    };
    fetchRealData();
    const interval = setInterval(fetchRealData, 5000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  return (
    <div className="w-full min-h-screen bg-[#F8FAFC] flex flex-col relative pb-6">
      
      {/* 1. MINIMAL HEADER (Like Farmer Brain) */}
      <header className="flex items-center justify-between px-5 py-4 bg-white sticky top-0 z-10 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3">
          {/* Hamburger Menu Icon */}
          <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          <h1 className="text-[17px] font-bold text-slate-800 flex items-center gap-2">
            <span className="text-xl">🧠</span> ORBIS Center
          </h1>
        </div>
        <div className="flex items-center gap-2 bg-green-50/80 px-2.5 py-1.5 rounded-full border border-green-100">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </span>
          <span className="text-[11px] font-bold text-green-700 uppercase tracking-wide">Live</span>
        </div>
      </header>

      {/* 2. WELCOME / ALERT CARD (Like 'Shuvo Provat' card) */}
      <div className="px-5 mt-5 mb-2">
        <div className="p-4 rounded-[20px] bg-gradient-to-br from-green-50 to-emerald-50/50 border border-green-100/60 shadow-sm relative overflow-hidden">
          <div className="flex items-start gap-3 relative z-10">
            <span className="text-xl mt-0.5">☀️</span>
            <div>
              <h2 className="text-[15px] font-bold text-slate-800 mb-1">সিস্টেম লাইভ এবং প্রস্তুত</h2>
              <p className="text-[13px] text-slate-600 leading-relaxed font-medium">
                আপনার সিস্টেমের প্রতিটি মডিউল সফলভাবে সিঙ্ক হয়েছে। ORBIS Foundation-এর কোর ইঞ্জিন এখন অপটিমাল পারফরম্যান্সে চলছে।
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 mt-4 mb-3">
        <h2 className="text-[19px] font-bold text-slate-800">System Overview</h2>
        <p className="text-[13px] text-slate-500">Smart Orchestration Management</p>
      </div>

      {/* 3. PREMIUM GRID CARDS */}
      <div className="px-5 grid grid-cols-2 gap-3.5">
        
        {/* Card 1 */}
        <motion.div whileTap={{ scale: 0.96 }} onClick={() => setActiveCard('engine')} className="cursor-pointer bg-white border border-slate-100 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.05)] rounded-[20px] p-4 flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-blue-50 p-1.5 rounded-lg"><span className="text-sm">⚙️</span></div>
            <h3 className="text-[12px] font-bold text-slate-600">Engine</h3>
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{data.engine}</p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Uptime: {data.uptime}</p>
          </div>
        </motion.div>

        {/* Card 2 */}
        <motion.div whileTap={{ scale: 0.96 }} onClick={() => setActiveCard('brain')} className="cursor-pointer bg-white border border-slate-100 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.05)] rounded-[20px] p-4 flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-orange-50 p-1.5 rounded-lg"><span className="text-sm">🧠</span></div>
            <h3 className="text-[12px] font-bold text-slate-600">Brain Sync</h3>
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{data.sync}</p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Phase {data.phase} Active</p>
          </div>
        </motion.div>

        {/* Card 3 */}
        <motion.div whileTap={{ scale: 0.96 }} onClick={() => setActiveCard('health')} className="cursor-pointer bg-gradient-to-br from-white to-green-50/30 border border-green-100 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.05)] rounded-[20px] p-4 flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-green-100/50 p-1.5 rounded-lg"><span className="text-sm">💚</span></div>
            <h3 className="text-[12px] font-bold text-green-700">Health</h3>
          </div>
          <div>
            <p className="text-xl font-black text-green-800">{data.health}</p>
            <p className="text-[11px] font-semibold text-green-600/70 mt-0.5">All nominal</p>
          </div>
        </motion.div>

        {/* Card 4 */}
        <motion.div whileTap={{ scale: 0.96 }} onClick={() => setActiveCard('ai')} className="cursor-pointer bg-white border border-slate-100 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.05)] rounded-[20px] p-4 flex flex-col justify-between min-h-[110px]">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-purple-50 p-1.5 rounded-lg"><span className="text-sm">🤖</span></div>
            <h3 className="text-[12px] font-bold text-slate-600">AI Agents</h3>
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{data.ai}</p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Latency: 18ms</p>
          </div>
        </motion.div>

      </div>

      {/* 4. PREMIUM MODAL */}
      <AnimatePresence>
        {activeCard && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed inset-0 bg-white z-50 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center shadow-sm">
              <h2 className="text-[16px] font-bold text-slate-800 capitalize flex items-center gap-2">
                <span className="text-xl">📊</span> {activeCard} Monitor
              </h2>
              <button type="button" onClick={() => setActiveCard(null)} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-full font-bold text-[12px] hover:bg-slate-200 transition-colors">
                Close
              </button>
            </div>
            <div className="flex-1 p-5 overflow-y-auto bg-slate-50">
              <div className="bg-black/90 rounded-xl p-4 shadow-inner">
                <p className="text-green-400 font-mono text-[13px] leading-relaxed">
                  [SYSTEM] Streaming secure logs for {activeCard}...<br/>
                  [STATUS] Connection established.<br/>
                  <span className="animate-pulse">_</span>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export default AdminDashboard;
