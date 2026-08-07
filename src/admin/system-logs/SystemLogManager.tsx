import React, { useState, useEffect, useMemo } from 'react';
import { Heart, Activity, Terminal, AlertTriangle, X, Folder, FileCode, Copy, Check, Code, ChevronLeft, History, Search } from 'lucide-react';
import TimeMachineCard from '../components/TimeMachine/TimeMachineCard';

export default function SystemLogManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<'cards' | 'source' | 'time_machine'>('cards');

  const [treeData, setTreeData] = useState<any[]>([]);                  
  const [latestUpdateTime, setLatestUpdateTime] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  
  // নতুন সার্চ স্টেট
  const [searchQuery, setSearchQuery] = useState('');

  const [isCopied, setIsCopied] = useState(false);
  const [isTreeCopied, setIsTreeCopied] = useState(false);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [errorStatus, setErrorStatus] = useState<{hasError: boolean, file: string | null, errorLine: number | null}>({ hasError: false, file: null, errorLine: null });

  useEffect(() => {
    if (isOpen && activeView === 'source') {
      setIsLoadingTree(true);
      fetch('/api/system/status')                                             
        .then(res => res.json())                                              
        .then(data => {
          if (data.success && data.hasError) setErrorStatus(data);              
          else setErrorStatus({ hasError: false, file: null, errorLine: null });
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
  }, [isOpen, activeView]);

  const handleFileClick = (filePath: string) => {
    setSelectedFile(filePath);
    setFileContent('// Loading source code from server...\n');            
    fetch(`/api/system/file?path=${encodeURIComponent(filePath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setFileContent(data.content);
        else setFileContent(`// Error: ${data.message}`);
      })
      .catch(err => setFileContent(`// Failed to fetch file content: ${err.message}`));                                                       
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(fileContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);                         
  };
                                                                        
  const handleCopyTree = () => {
    const generateTreeText = (items: any[], prefix = '') => {
      let text = '';
      items.forEach((item, idx) => {
        const isLast = idx === items.length - 1;
        const pointer = isLast ? '└── ' : '├── ';
        text += `${prefix}${pointer}${item.name}\n`;                          
        if (item.children) {
          text += generateTreeText(item.children, prefix + (isLast ? '    ' : '│   '));
        }
      });
      return text;
    };                                                                    
    const fullTreeText = "ORBIS Foundation Project Structure:\n\n" + generateTreeText(treeData);
    navigator.clipboard.writeText(fullTreeText);                          
    setIsTreeCopied(true);
    setTimeout(() => setIsTreeCopied(false), 2000);                     
  };

  // সার্চের উপর ভিত্তি করে ট্রি ফিল্টার করার লজিক
  const filteredTreeData = useMemo(() => {
    if (!searchQuery.trim()) return treeData;
    const query = searchQuery.toLowerCase();

    const filterNodes = (nodes: any[]): any[] => {
      return nodes.map(node => {
        if (node.type === 'directory') {
          const filteredChildren = filterNodes(node.children || []);
          if (filteredChildren.length > 0 || node.name.toLowerCase().includes(query)) {
            return { ...node, children: filteredChildren };
          }
          return null;
        } else {
          if (node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query)) {
            return node;
          }
          return null;
        }
      }).filter(Boolean);
    };
    return filterNodes(treeData);
  }, [treeData, searchQuery]);

  const renderTree = (items: any[]) => {
    return items.map((item, index) => {
      if (item.type === 'directory') {
        const folderHasError = errorStatus.hasError && typeof errorStatus.file === 'string' && errorStatus.file.startsWith(item.path);
        return (
          <div key={index} className="ml-2 my-1">
            <div className={`flex items-center gap-2 py-1 px-2 rounded font-medium text-xs transition-colors ${
              folderHasError ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'text-slate-300'
            }`}>                                                                    
              <Folder size={14} className={folderHasError ? 'text-red-400' : 'text-blue-400'} />
              <span>{item.name}</span>                                            
            </div>
            <div className="pl-3 border-l border-slate-700/50 ml-1 mt-1">
              {item.children && renderTree(item.children)}
            </div>
          </div>
        );
      } else {                                                                
        const isErrorFile = errorStatus.hasError && errorStatus.file === item.path;
        const isLatestUpdate = !isErrorFile && item.mtime >= latestUpdateTime - 60000;
        return (
          <div
            key={index}
            onClick={() => handleFileClick(item.path)}
            className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-xs my-0.5 transition-all ${
              isErrorFile
                ? 'bg-red-500/20 text-red-400 border border-red-500/50 font-bold animate-pulse'
                : isLatestUpdate
                  ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 font-semibold'
                  : 'text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <FileCode size={14} className={isErrorFile ? 'text-red-400' : isLatestUpdate ? 'text-yellow-400' : 'text-slate-400'} />
            <span className="truncate">{item.name}</span>
            {isLatestUpdate && <span className="ml-auto text-[9px] bg-yellow-500/20 px-1 rounded text-yellow-500">Updated</span>}
          </div>                                                              
        );                                                                  
      }
    });
  };                                                                  
  
  return (
    <>                                                                      
      <div
        onClick={() => setIsOpen(true)}
        className="p-4 rounded-2xl border backdrop-blur-md cursor-pointer transition-all duration-300 bg-[#0f172a]/80 border-slate-700 hover:border-blue-500/50 shadow-lg"
      >
        <div className="flex items-center gap-3 mb-2">
          <Heart className="text-blue-400" size={20} />
          <h3 className="font-semibold text-slate-200">System Logs & Source</h3>
        </div>                                                                
        <p className="text-xl font-bold text-white">Live Diagnostics</p>
        <p className="text-xs text-slate-400 mt-1">Real-time repository explorer & logs</p>
      </div>

      {isOpen && (                                                            
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
                                                      
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900 shrink-0">
              <div className="flex items-center gap-3">                               
                <Activity size={20} className="text-blue-400" />                      
                <h2 className="text-lg font-bold text-white">System Monitor & Live Source Explorer</h2>
              </div>                                                                
              <div className="flex items-center gap-2">
                {((activeView === 'source' && !selectedFile) || activeView === 'time_machine') && (
                  <button
                    onClick={() => {
                        setActiveView('cards');
                        setSearchQuery(''); // Back করলে সার্চ ক্লিয়ার হয়ে যাবে
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition"
                  >                                                                       
                    Back to Cards                                                       
                  </button>
                )}
                <button 
                  onClick={() => { setIsOpen(false); setSelectedFile(null); setActiveView('cards'); setSearchQuery(''); }} 
                  className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800"
                >                                       
                  <X size={20} />
                </button>
              </div>
            </div>                                                    
                                                              
            <div className="flex-1 overflow-hidden p-4 bg-[#09090b]">

              {activeView === 'cards' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full content-start">
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
                    className="p-5 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors shadow-lg"
                  >                                                                       
                    <div className="flex items-center gap-2 mb-3">
                      <Code size={20} className="text-purple-400" />                        
                      <h4 className="font-semibold text-slate-200">Source Explorer</h4>
                    </div>
                    <p className="text-xs text-slate-400">Browse live repository & view source code</p>
                  </div>

                  <div                                                                    
                    onClick={() => setActiveView('time_machine')}                               
                    className="p-5 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors shadow-lg"
                  >                                                                       
                    <div className="flex items-center gap-2 mb-3">
                      <History size={20} className="text-yellow-400" />                        
                      <h4 className="font-semibold text-slate-200">Time Machine</h4>
                    </div>
                    <p className="text-xs text-slate-400">History & code revisions</p>
                  </div>
                </div>                                                              
              )}                                                      
              
              {activeView === 'source' && (                                           
                <div className="h-full relative overflow-hidden rounded-xl border border-slate-800 flex flex-col bg-[#0f172a]">

                  {!selectedFile && (
                    <div className="flex-1 p-4 overflow-y-auto pb-10">
                      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">                                                       
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Project Structure</h3>
                        <button onClick={handleCopyTree} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition ${isTreeCopied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-blue-400 hover:bg-slate-700'}`}>                                                     
                          {isTreeCopied ? <Check size={14} /> : <Copy size={14} />}
                          {isTreeCopied ? 'Copied Tree' : 'Copy Tree'}
                        </button>
                      </div>

                      {/* 🔥 নতুন সার্চ বার যুক্ত করা হলো */}
                      <div className="mb-4 relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search files or folders..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg pl-9 p-2.5 outline-none focus:border-blue-500 transition-colors"
                        />
                      </div>
                                                                                            
                      {isLoadingTree ? (
                        <div className="flex flex-col items-center justify-center py-10 opacity-50">
                          <Activity size={32} className="animate-spin text-blue-400 mb-4" />
                          <p className="text-sm text-slate-400">Fetching live dependency tree...</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {filteredTreeData.length > 0 ? renderTree(filteredTreeData) : (
                            <p className="text-slate-500 text-sm text-center py-4">
                              {searchQuery ? 'No matching files found.' : 'No files found.'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedFile && (
                    <div className="absolute inset-0 z-20 bg-[#0f172a] flex flex-col animate-in slide-in-from-bottom-4 duration-200">
                      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900 shrink-0">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <button onClick={() => setSelectedFile(null)} className="p-1.5 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 shrink-0">                                                                                    
                            <ChevronLeft size={16} />
                          </button>
                          <span className="text-xs font-mono text-slate-300 truncate max-w-[150px] sm:max-w-md bg-slate-800 px-2 py-1 rounded">
                            {selectedFile.split('/').pop()}                                     
                          </span>
                        </div>
                        <button onClick={handleCopyCode} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shrink-0 ${isCopied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-md'}`}>                                         
                          {isCopied ? <Check size={14} /> : <Copy size={14} />}
                          {isCopied ? 'Copied!' : 'Copy Code'}
                        </button>
                      </div>                                          
                      
                      <div className="flex-1 overflow-auto bg-[#09090b] font-mono text-[11px] sm:text-xs text-slate-300 pb-10">
                        {fileContent.split('\n').map((line, idx) => {                           
                          const lineNumber = idx + 1;
                          const isErrorLine = errorStatus.hasError && selectedFile === errorStatus.file && lineNumber === errorStatus.errorLine;
                          return (                                                                
                            <div key={lineNumber} className={`flex w-full min-w-max hover:bg-white/5 transition-colors ${isErrorLine ? 'bg-red-500/20 text-red-300 font-bold border-l-2 border-red-500' : ''}`}>
                              <div className="w-10 sm:w-12 shrink-0 text-right pr-3 py-0.5 text-slate-600 select-none border-r border-slate-800/50 bg-slate-900/30">
                                {lineNumber}
                              </div>                                                                
                              <div className="pl-4 py-0.5 whitespace-pre">
                                {line || ' '}                                                       
                              </div>
                            </div>
                          );                                                                  
                        })}
                      </div>
                    </div>
                  )}                                                  
                </div>                                                              
              )}                                                      
              
              {activeView === 'time_machine' && (
                <div className="h-full relative overflow-hidden rounded-xl border border-slate-800 flex flex-col bg-[#0f172a]">
                  <TimeMachineCard />
                </div>
              )}
            </div>
          </div>                                                              
        </div>
      )}                                                                  
    </>                                                                 
  );
}
