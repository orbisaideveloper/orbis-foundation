import React, { useState, useEffect } from 'react';
import { Heart, Activity, Terminal, AlertTriangle, X, Copy } from 'lucide-react';

export default function SystemLogManager() {
  const [isOpen, setIsOpen] = useState(false);
  
  // ডাইনামিক স্টেটস
  const [hasCriticalError, setHasCriticalError] = useState(false);
  const [hasActionError, setHasActionError] = useState(false);

  // রিয়েল-টাইম লাইভ সিঙ্ক লজিক
  useEffect(() => {
    const fetchLogStatus = async () => {
      try {
        // আপাতত একটি এপিআই রাউট দেওয়া হলো, ব্যাকএন্ডের আসল রাউট অনুযায়ী এটি পরিবর্তন করতে পারবেন
        const res = await fetch('/api/logs-status'); 
        if (res.ok) {
          const data = await res.json();
          // API থেকে true/false আসলে স্টেট আপডেট হবে
          setHasCriticalError(data.hasCriticalError || false);
          setHasActionError(data.hasActionError || false);
        }
      } catch (error) {
        console.error("Failed to fetch log status:", error);
      }
    };

    fetchLogStatus(); // প্রথমবার লোড হওয়ার সাথে সাথেই কল হবে
    const interval = setInterval(fetchLogStatus, 5000); // প্রতি ৫ সেকেন্ডে লাইভ আপডেট

    return () => clearInterval(interval); // পারফরম্যান্স ঠিক রাখতে ক্লিনআপ ফাংশন
  }, []);

  // কালার লজিক (যেকোনো একটা এরর থাকলেই মেইন কার্ড লাল)
  const isSystemError = hasCriticalError || hasActionError;
  const mainBg = isSystemError ? 'bg-red-500/10 border-red-500/50' : 'bg-emerald-500/10 border-emerald-500/50';
  const mainText = isSystemError ? 'text-red-400' : 'text-emerald-400';

  return (
    <>
      {/* 1. Main Dashboard Card (System Logs) */}
      <div
        onClick={() => setIsOpen(true)}
        className={`p-4 rounded-2xl border backdrop-blur-md cursor-pointer transition-all duration-300 ${mainBg}`}
      >
        <div className="flex items-center gap-3 mb-2">
          <Heart className={mainText} size={20} />
          <h3 className={`font-semibold transition-colors duration-300 ${mainText}`}>
            {isSystemError ? 'System Alert' : 'System Logs'}
          </h3>
        </div>
        <p className={`text-xl font-bold transition-colors duration-300 ${mainText}`}>
          {isSystemError ? 'Errors Found' : 'Optimal'}
        </p>
        <p className="text-xs text-slate-400 mt-1 transition-colors duration-300">
          {isSystemError ? 'Tap to view details' : 'All systems secured'}
        </p>
      </div>

      {/* 2. Modal Popup */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-3">
                <Activity size={20} className="text-blue-400" />
                <h2 className="text-lg font-bold text-white">System Monitor</h2>
              </div>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors border border-slate-700">
                  <Copy size={14} />
                  Copy Data
                </button>
                <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content - The 3 Inner Cards */}
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Card A: Hardware Node */}
              <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer">
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={18} className="text-blue-400" />
                  <h4 className="font-semibold text-slate-200">Hardware Node</h4>
                </div>
                <p className="text-xs text-slate-400">System Info & Kernel</p>
              </div>

              {/* Card B: Action Logs */}
              <div className={`p-4 rounded-xl border transition-colors cursor-pointer duration-300 ${hasActionError ? 'bg-red-900/20 border-red-500/50' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Terminal size={18} className={`transition-colors duration-300 ${hasActionError ? 'text-red-400' : 'text-slate-300'}`} />
                  <h4 className={`font-semibold transition-colors duration-300 ${hasActionError ? 'text-red-400' : 'text-slate-200'}`}>Action Logs</h4>
                </div>
                <p className="text-xs text-slate-400">User activity & events</p>
              </div>

              {/* Card C: Critical Errors */}
              <div className={`p-4 rounded-xl border transition-colors cursor-pointer duration-300 ${hasCriticalError ? 'bg-red-900/20 border-red-500/50' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={18} className={`transition-colors duration-300 ${hasCriticalError ? 'text-red-400' : 'text-slate-300'}`} />
                  <h4 className={`font-semibold transition-colors duration-300 ${hasCriticalError ? 'text-red-400' : 'text-slate-200'}`}>Critical Errors</h4>
                </div>
                <p className="text-xs text-slate-400">System crashes & APIs</p>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
