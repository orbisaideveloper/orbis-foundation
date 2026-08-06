import React, { useState, useEffect } from 'react';
import { Heart, Activity, Terminal, AlertTriangle, X, Folder, FileCode, Bug } from 'lucide-react';

export default function SystemLogManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'source'>('overview');

  // রিয়েল ডেটার জন্য স্টেট (ভবিষ্যতে ব্যাকএন্ড থেকে আসবে)
  const [systemState, setSystemState] = useState({
    status: 'optimal', // 'optimal' বা 'critical'
    errorFile: '',
    errorLine: 0,
    errorMessage: '',
    sourceCode: ''
  });

  // 초기 API কলের জন্য ফ্রেমওয়ার্ক (এখনকার জন্য ব্ল্যাংক, ব্যাকএন্ড রেডি হলে ডেটা আসবে)
  useEffect(() => {
    const fetchRealLogs = async () => {
      try {
        const res = await fetch('/api/system/crash-reports');
        if (res.ok) {
          const data = await res.json();
          if (data.hasError) {
            setSystemState({
              status: 'critical',
              errorFile: data.file,
              errorLine: data.line,
              errorMessage: data.message,
              sourceCode: data.codeSnippet
            });
          } else {
            setSystemState(prev => ({ ...prev, status: 'optimal' }));
          }
        }
      } catch (error) {
        // API না থাকলে বা ফেইল করলে সাইলেন্ট থাকবে
      }
    };
    
    fetchRealLogs();
    const interval = setInterval(fetchRealLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  // UI Colors
  const isCritical = systemState.status === 'critical';
  const mainBg = isCritical ? 'bg-red-500/10 border-red-500/50' : 'bg-emerald-500/10 border-emerald-500/50';
  const mainText = isCritical ? 'text-red-400' : 'text-emerald-400';

  return (
    <>
      {/* 1. Main Dashboard Card */}
      <div
        onClick={() => setIsOpen(true)}
        className={`p-4 rounded-2xl border backdrop-blur-md cursor-pointer transition-all duration-300 ${mainBg}`}
      >
        <div className="flex items-center gap-3 mb-2">
          <Heart className={mainText} size={20} />
          <h3 className={`font-semibold ${mainText}`}>
            {isCritical ? 'System Crash' : 'System Logs'}
          </h3>
        </div>
        <p className={`text-xl font-bold ${mainText}`}>
          {isCritical ? 'Critical Error' : 'Optimal'}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {isCritical ? systemState.errorFile : 'All systems secured'}
        </p>
      </div>

      {/* 2. Advanced Diagnostic Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
              <div className="flex items-center gap-3">
                <Terminal size={20} className="text-blue-400" />
                <h2 className="text-lg font-bold text-white">Advanced Error Diagnostics</h2>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800">
                <X size={20} />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex flex-1 overflow-hidden">
              
              {/* Left Sidebar: Folder / File Tree View */}
              <div className="w-1/3 border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Project Structure</h3>
                
                <div className="space-y-2">
                  {/* Normal Folder */}
                  <div className="flex items-center gap-2 text-slate-300">
                    <Folder size={16} className="text-blue-400" />
                    <span className="text-sm font-medium">src</span>
                  </div>
                  
                  {/* Real-time Dynamic Error File Representation */}
                  {isCritical ? (
                    <div 
                      onClick={() => setActiveTab('source')}
                      className="ml-4 p-2 rounded-lg bg-red-500/10 border border-red-500/30 cursor-pointer flex items-start gap-2 mt-2"
                    >
                      <Bug size={16} className="text-red-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-red-400 break-all">{systemState.errorFile}</p>
                        <p className="text-xs text-red-400/70 mt-1 line-clamp-2">{systemState.errorMessage}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="ml-4 p-2 flex items-center gap-2 text-slate-500">
                      <FileCode size={16} />
                      <span className="text-sm italic">No errors detected. Everything is green.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Panel: Source Code Viewer */}
              <div className="flex-1 bg-[#09090b] flex flex-col relative">
                {isCritical && activeTab === 'source' ? (
                  <>
                    <div className="p-3 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
                      <span className="text-xs font-mono text-slate-400">Viewing exact crash location</span>
                      <span className="text-xs font-mono bg-red-500/20 text-red-400 px-2 py-1 rounded">Line: {systemState.errorLine}</span>
                    </div>
                    <div className="flex-1 p-4 overflow-auto font-mono text-sm text-slate-300 whitespace-pre">
                      {/* 
                        Future Integration: Here we will split the sourceCode by newlines, 
                        map over them, and apply bg-red-900 to the index matching errorLine.
                      */}
                      {systemState.sourceCode || "// Source code could not be loaded."}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                    <Activity size={48} className="mb-4 opacity-20" />
                    <p className="font-medium">System is running optimally</p>
                    <p className="text-sm mt-1">No source code investigation required</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
