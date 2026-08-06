import React, { useState, useEffect } from 'react';
import { Heart, Activity, Terminal, AlertTriangle, X, Folder, FileCode, Copy, Check, Code } from 'lucide-react';

export default function SystemLogManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<'cards' | 'source'>('cards');
  
  // সোর্স কোড ভিউয়ারের স্টেটস
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('// Select a file to view its source code...');
  const [isCopied, setIsCopied] = useState(false);

  // ডামি ডেটা (পরে ব্যাকএন্ড API থেকে আসবে)
  const systemState = {
    hasError: true,
    errorFile: 'src/admin/system-logs/SystemLogManager.tsx',
    errorLine: 45
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(fileContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <>
      {/* Main Dashboard Card */}
      <div
        onClick={() => setIsOpen(true)}
        className="p-4 rounded-2xl border backdrop-blur-md cursor-pointer transition-all duration-300 bg-[#0f172a]/80 border-slate-700 hover:border-blue-500/50"
      >
        <div className="flex items-center gap-3 mb-2">
          <Heart className="text-blue-400" size={20} />
          <h3 className="font-semibold text-slate-200">System Logs & Source</h3>
        </div>
        <p className="text-xl font-bold text-white">Diagnostics</p>
        <p className="text-xs text-slate-400 mt-1">View code, errors & hardware logs</p>
      </div>

      {/* Main Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
              <div className="flex items-center gap-3">
                <Activity size={20} className="text-blue-400" />
                <h2 className="text-lg font-bold text-white">System Monitor & Code Explorer</h2>
              </div>
              <div className="flex items-center gap-2">
                {activeView === 'source' && (
                  <button 
                    onClick={() => setActiveView('cards')}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition"
                  >
                    Back to Cards
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden p-4">
              
              {/* 3-Cards View */}
              {activeView === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full content-start">
                  {/* Card 1: Hardware */}
                  <div className="p-5 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 cursor-pointer">
                    <div className="flex items-center gap-2 mb-3">
                      <Activity size={20} className="text-blue-400" />
                      <h4 className="font-semibold text-slate-200">Hardware Node</h4>
                    </div>
                    <p className="text-xs text-slate-400">Server stats, Memory & CPU usage</p>
                  </div>

                  {/* Card 2: Action Logs */}
                  <div className="p-5 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 cursor-pointer">
                    <div className="flex items-center gap-2 mb-3">
                      <Terminal size={20} className="text-emerald-400" />
                      <h4 className="font-semibold text-slate-200">Action Logs</h4>
                    </div>
                    <p className="text-xs text-slate-400">User events and system actions</p>
                  </div>

                  {/* Card 3: Source Code & Errors (Triggers Explorer) */}
                  <div 
                    onClick={() => setActiveView('source')}
                    className={`p-5 rounded-xl border cursor-pointer transition-colors ${systemState.hasError ? 'bg-red-500/10 border-red-500/50 hover:bg-red-500/20' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Code size={20} className={systemState.hasError ? 'text-red-400' : 'text-purple-400'} />
                      <h4 className={`font-semibold ${systemState.hasError ? 'text-red-400' : 'text-slate-200'}`}>Source Explorer</h4>
                    </div>
                    <p className="text-xs text-slate-400">Browse repository & view errors</p>
                  </div>
                </div>
              )}

              {/* Source Code Explorer View */}
              {activeView === 'source' && (
                <div className="flex h-full border border-slate-800 rounded-xl overflow-hidden bg-[#09090b]">
                  
                  {/* Left: File Tree */}
                  <div className="w-1/3 border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Repository</h3>
                    
                    <div className="space-y-1">
                      {/* Normal Folder Structure */}
                      <div className="flex items-center gap-2 text-slate-300 py-1">
                        <Folder size={16} className="text-blue-400" />
                        <span className="text-sm">src</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-300 py-1 ml-4">
                        <Folder size={16} className="text-blue-400" />
                        <span className="text-sm">admin</span>
                      </div>
                      
                      {/* Error File Highlighted */}
                      <div 
                        onClick={() => {
                          setSelectedFile(systemState.errorFile);
                          setFileContent("// Example Source Code\n// This will be fetched from Node.js backend\nexport default function App() {\n  return <div>Error Here</div>;\n}");
                        }}
                        className={`flex items-center gap-2 py-1 ml-8 px-2 rounded cursor-pointer ${selectedFile === systemState.errorFile ? 'bg-slate-800' : 'hover:bg-slate-800/50'}`}
                      >
                        <FileCode size={16} className={systemState.hasError ? 'text-red-400' : 'text-slate-400'} />
                        <span className={`text-sm truncate ${systemState.hasError ? 'text-red-400 font-medium' : 'text-slate-300'}`}>
                          SystemLogManager.tsx
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Code Viewer */}
                  <div className="flex-1 flex flex-col relative">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between p-2 border-b border-slate-800 bg-slate-900/80">
                      <span className="text-xs font-mono text-slate-400 px-2">
                        {selectedFile || 'No file selected'}
                      </span>
                      
                      {/* One-Click Copy Button */}
                      <button 
                        onClick={handleCopy}
                        disabled={!selectedFile}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${!selectedFile ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-500' : isCopied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}
                      >
                        {isCopied ? <Check size={14} /> : <Copy size={14} />}
                        {isCopied ? 'Copied Full File' : 'Copy Full Code'}
                      </button>
                    </div>

                    {/* Code Display Area */}
                    <div className="flex-1 p-4 overflow-auto font-mono text-sm text-slate-300 whitespace-pre">
                      {fileContent}
                    </div>
                  </div>

                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  );
}
