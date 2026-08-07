import React, { useState, useEffect } from 'react';
import { Heart, Activity, Terminal, AlertTriangle, X, Folder, FileCode, Copy, Check, Code } from 'lucide-react';

export default function SystemLogManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<'cards' | 'source'>('cards');
  
  const [treeData, setTreeData] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('// Loading source code from server...');
  const [isCopied, setIsCopied] = useState(false);
  const [latestUpdateTime, setLatestUpdateTime] = useState<number>(0);
  const [isTreeCopied, setIsTreeCopied] = useState(false);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [errorStatus, setErrorStatus] = useState({ hasError: false, file: '', line: 0 });

  // রিয়েল-টাইমে সার্ভার থেকে ফোল্ডার ট্রি ফেচ করা
  useEffect(() => {
    if (isOpen) {
      setIsLoadingTree(true);
      fetch('/api/system/status')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.hasError) setErrorStatus(data);
          else setErrorStatus({ hasError: false, file: null, errorLine: null } as any);
        }).catch(() => {});

      fetch('/api/system/tree')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setTreeData(data.tree);
            let maxTime = 0;
            const findMaxTime = (items: any[]) => {
              items.forEach(item => {
                if (item.mtime > maxTime) maxTime = item.mtime;
                if (item.children) findMaxTime(item.children);
              });
            };
            findMaxTime(data.tree);
            setLatestUpdateTime(maxTime);
          }
        })
        .finally(() => setIsLoadingTree(false));
    }
  }, [isOpen]);

  // নির্দিষ্ট ফাইলের কোড লোড করা
  const handleFileClick = (filePath: string) => {
    setSelectedFile(filePath);
    fetch(`/api/system/file?path=${encodeURIComponent(filePath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setFileContent(data.content);
        } else {
          setFileContent(`// Error: ${data.message}`);
        }
      })
      .catch(err => setFileContent(`// Failed to fetch file content: ${err.message}`));
  };


  const handleCopyTree = () => {
    const generateTreeText = (items: any[], prefix = '') => {
      let text = '';
      items.forEach((item, idx) => {
        const isLast = idx === items.length - 1;
        const pointer = isLast ? '└── ' : '├── ';
        text += ;
        if (item.children) text += generateTreeText(item.children, prefix + (isLast ? '    ' : '│   '));
      });
      return text;
    };
    navigator.clipboard.writeText("ORBIS Foundation Project Structure:

" + generateTreeText(treeData));
    setIsTreeCopied(true);
    setTimeout(() => setIsTreeCopied(false), 2000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(fileContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // রিকার্সিভ রেন্ডারিং ফাংশন (ফোল্ডার এবং ফাইল দেখানোর জন্য)
  const renderTree = (items: any[]) => {
    return items.map((item, index) => {
      if (item.type === 'directory') {
        const folderHasError = errorStatus.hasError && typeof errorStatus.file === 'string' && errorStatus.file.startsWith(item.path);
        return (
          <div key={index} className="ml-3 my-2">
            <div className={}>
              <Folder size={16} className={folderHasError ? 'text-red-400' : 'text-blue-400'} />
              <span>{item.name}</span>
            </div>
            <div className="pl-2 border-l-2 border-slate-700/50 ml-2 mt-1">
              {item.children && renderTree(item.children)}
            </div>
          </div>
        );
      } else {
        const isErrorFile = errorStatus.hasError && errorStatus.file === item.path;
        return (
          <div
            key={index}
            onClick={() => handleFileClick(item.path)}
            className={}
          >
            <FileCode size={16} className={isErrorFile ? 'text-red-400' : isLatestUpdate ? 'text-yellow-400' : 'text-slate-400'} />
            <span className="truncate">{item.name}</span>
            {isLatestUpdate && <span className="ml-auto text-[10px] bg-yellow-500/20 px-1.5 py-0.5 rounded text-yellow-500">Updated</span>}
          </div>
        );
      }
    });
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
        <p className="text-xl font-bold text-white">Live Diagnostics</p>
        <p className="text-xs text-slate-400 mt-1">Real-time repository explorer & logs</p>
      </div>

      {/* Main Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
              <div className="flex items-center gap-3">
                <Activity size={20} className="text-blue-400" />
                <h2 className="text-lg font-bold text-white">System Monitor & Live Source Explorer</h2>
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
                  <div className="p-5 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 cursor-pointer">
                    <div className="flex items-center gap-2 mb-3">
                      <Activity size={20} className="text-blue-400" />
                      <h4 className="font-semibold text-slate-200">Hardware Node</h4>
                    </div>
                    <p className="text-xs text-slate-400">Server stats, Memory & CPU usage</p>
                  </div>

                  <div className="p-5 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 cursor-pointer">
                    <div className="flex items-center gap-2 mb-3">
                      <Terminal size={20} className="text-emerald-400" />
                      <h4 className="font-semibold text-slate-200">Action Logs</h4>
                    </div>
                    <p className="text-xs text-slate-400">User events and system actions</p>
                  </div>

                  <div 
                    onClick={() => setActiveView('source')}
                    className="p-5 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Code size={20} className="text-purple-400" />
                      <h4 className="font-semibold text-slate-200">Source Explorer</h4>
                    </div>
                    <p className="text-xs text-slate-400">Browse live repository & view source code</p>
                  </div>
                </div>
              )}

              {/* Source Code Explorer View */}
              {activeView === 'source' && (
                <div className="flex h-full border border-slate-800 rounded-xl overflow-hidden bg-[#09090b]">
                  
                  {/* Left: Live File Tree */}
                  <div className="w-1/3 border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Live Repository</h3>
                    <div className="space-y-1">
                      {treeData.length > 0 ? renderTree(treeData) : (
                        <p className="text-xs text-slate-500 animate-pulse">Scanning server files...</p>
                      )}
                    </div>
                  </div>

                  {/* Right: Code Viewer & Full Copy Option */}
                  <div className="flex-1 flex flex-col relative">
                    <div className="flex items-center justify-between p-2 border-b border-slate-800 bg-slate-900/80">
                      <span className="text-xs font-mono text-slate-400 px-2 truncate max-w-[60%]">
                        {selectedFile || 'Select a file from the left tree'}
                      </span>
                      
                      <button 
                        onClick={handleCopy}
                        disabled={!selectedFile}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                          !selectedFile 
                            ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-500' 
                            : isCopied 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                        }`}
                      >
                        {isCopied ? <Check size={14} /> : <Copy size={14} />}
                        {isCopied ? 'Copied Full File' : 'Copy Full Code'}
                      </button>
                    </div>

                    <div className="flex-1 p-4 overflow-auto font-mono text-xs text-slate-300 whitespace-pre">
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
