import React, { useState, useEffect } from 'react';

export default function TimeMachineCard() {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVersion, setSelectedVersion] = useState<any>(null);
    const [codeContent, setCodeContent] = useState('');
    const [copied, setCopied] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetch('/api/system/time-machine/history')
            .then(res => res.json())
            .then(data => {
                if (data.success && Array.isArray(data.history)) {
                    setHistory(data.history);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Time Machine Module Fetch Error:", err);
                setLoading(false);
            });
    }, []);

    const handleSelectVersion = (item: any) => {
        setSelectedVersion(item);
        setLoading(true);
        fetch(`/api/system/time-machine/version?commitId=${item.commitId}&filePath=${encodeURIComponent(item.filePath)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data?.content) {
                    setCodeContent(data.data.content);
                } else {
                    setCodeContent('// Version content not found');
                }
                setLoading(false);
            })
            .catch(() => {
                setCodeContent('// Failed to fetch version content');
                setLoading(false);
            });
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(codeContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const filteredHistory = history.filter(item => 
        (item?.filePath || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 text-slate-200 shadow-xl w-full h-full flex flex-col font-sans">
            {!selectedVersion ? (
                <div className="flex flex-col h-full">
                    <div className="mb-4 flex flex-col gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-yellow-400 flex items-center gap-2">
                                ⏳ Source Time Machine
                            </h2>
                            <p className="text-[11px] text-slate-400 mt-1">
                                Isolated module: Track and recover commit snapshots.
                            </p>
                        </div>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                            <input 
                                type="text" 
                                placeholder="Search by file path..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-yellow-500 focus:border-yellow-500 block w-full pl-9 p-2 outline-none"
                            />
                        </div>
                    </div>
                    
                    {loading ? (
                        <div className="text-center py-8 text-slate-400 animate-pulse flex-1">Loading time machine logs...</div>
                    ) : filteredHistory.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 flex-1">No logs found yet. Push code changes to trigger history.</div>
                    ) : (
                        <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1 max-h-[50vh]">
                            {filteredHistory.map((item, index) => (
                                <div 
                                    key={index} 
                                    onClick={() => handleSelectVersion(item)}
                                    className="bg-slate-900/80 border border-slate-800 hover:border-yellow-500/50 p-3 rounded-lg flex justify-between items-center cursor-pointer transition group"
                                >
                                    <div className="overflow-hidden pr-3">
                                        <div className="text-[11px] font-mono text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-500/20 truncate">
                                            {item.filePath}
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1.5 font-mono">
                                            Commit: {item.commitId ? item.commitId.slice(0, 8) : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="text-right min-w-[90px]">
                                        <span className="text-[10px] text-slate-400 block mb-1">
                                            {item.createdAt ? new Date(item.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : ''}
                                        </span>
                                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded group-hover:bg-yellow-500 group-hover:text-black transition-colors block text-center">
                                            View Code
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col h-full">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-3 bg-slate-900 p-3 rounded-lg border border-slate-800">
                        <button 
                            onClick={() => setSelectedVersion(null)}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition w-fit"
                        >
                            ← Back to Timeline
                        </button>
                        <div className="text-[11px] font-mono text-yellow-400 truncate max-w-[200px]">
                            📂 {selectedVersion.filePath}
                        </div>
                        <button 
                            onClick={handleCopy}
                            className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-3 py-1.5 rounded-lg transition w-fit"
                        >
                            {copied ? '✅ Copied!' : '📋 Copy Code'}
                        </button>
                    </div>
                    <div className="bg-[#0b1120] border border-slate-800 rounded-lg p-4 overflow-auto font-mono text-[11px] text-slate-300 flex-1 max-h-[55vh]">
                        {loading ? (
                            <div className="text-center py-8 text-slate-400 animate-pulse">Fetching version content...</div>
                        ) : (
                            <pre className="whitespace-pre-wrap leading-relaxed">{codeContent}</pre>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
