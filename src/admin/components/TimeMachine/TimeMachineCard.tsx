import React, { useState, useEffect } from 'react';

export default function TimeMachineCard() {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCommit, setSelectedCommit] = useState<any>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
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
                console.error("Time Machine Fetch Error:", err);
                setLoading(false);
            });
    }, []);

    const handleSelectFile = (commit: any, filePath: string) => {
        setSelectedCommit(commit);
        setSelectedFile(filePath);
        setLoading(true);
        fetch(`/api/system/time-machine/version?commitId=${commit.commitId}&filePath=${encodeURIComponent(filePath)}`)
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

    const filteredHistory = history.filter(commit => 
        (commit.commitId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (commit.files || []).some((f: any) => (f.filePath || '').toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-3 sm:p-4 text-slate-200 shadow-xl w-full h-full flex flex-col font-sans">
            {!selectedFile ? (
                <div className="flex flex-col h-full">
                    <div className="mb-4 flex flex-col gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-yellow-400 flex items-center gap-2">
                                ⏳ Source Time Machine
                            </h2>
                            <p className="text-[12px] text-slate-400 mt-1">
                                Commit-grouped snapshot and CI status tracker.
                            </p>
                        </div>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                            <input 
                                type="text" 
                                placeholder="Search by commit ID or file path..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-yellow-500 focus:border-yellow-500 block w-full pl-9 p-2.5 outline-none"
                            />
                        </div>
                    </div>
                    
                    {loading ? (
                        <div className="text-center py-8 text-slate-400 animate-pulse flex-1 text-sm">Loading grouped commit logs...</div>
                    ) : filteredHistory.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 flex-1 text-sm">No logs found. Push code changes to trigger history.</div>
                    ) : (
                        <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar flex-1 max-h-[60vh]">
                            {filteredHistory.map((commit, idx) => (
                                <div key={idx} className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex flex-col gap-2.5 shadow-md">
                                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[12px] font-mono font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-500/20">
                                                Commit: {commit.commitId ? commit.commitId.slice(0, 8) : 'N/A'}
                                            </span>
                                            {commit.status === 'FAILED' ? (
                                                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-0.5 rounded font-bold">
                                                    ❌ CI FAILED
                                                </span>
                                            ) : (
                                                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded font-bold">
                                                    ✅ PASSED
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[11px] text-slate-400 font-mono">
                                            {commit.createdAt ? new Date(commit.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : ''}
                                        </span>
                                    </div>

                                    {/* Failure Error log details for easy copy */}
                                    {commit.status === 'FAILED' && commit.errorMessage && (
                                        <div className="text-[11px] font-mono bg-red-950/60 border border-red-800/60 text-red-300 p-2.5 rounded-lg whitespace-pre-wrap select-all">
                                            ⚠️ <strong className="text-red-200">Failure Reason:</strong> {commit.errorMessage}
                                        </div>
                                    )}

                                    {/* Files modified in this specific commit */}
                                    <div className="flex flex-col gap-1.5 mt-0.5">
                                        <span className="text-[11px] text-slate-400 font-semibold">
                                            Files Changed ({commit.files?.length || 0}):
                                        </span>
                                        <div className="space-y-1.5">
                                            {commit.files?.map((file: any, fIdx: number) => (
                                                <div 
                                                    key={fIdx}
                                                    onClick={() => handleSelectFile(commit, file.filePath)}
                                                    className="flex justify-between items-center bg-slate-950 hover:border-yellow-500/50 border border-slate-800/80 p-2 rounded-md cursor-pointer transition group"
                                                >
                                                    <span className="text-[12px] font-mono text-slate-300 truncate max-w-[210px] group-hover:text-yellow-400">
                                                        📂 {file.filePath}
                                                    </span>
                                                    <span className="text-[11px] bg-slate-800 hover:bg-yellow-500 hover:text-black text-slate-200 px-2.5 py-1 rounded transition font-medium">
                                                        View Code
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col h-full relative">
                    {/* Sticky Crystal Glassmorphism Header */}
                    <div className="sticky top-0 z-20 backdrop-blur-md bg-slate-900/90 border border-slate-800/80 p-3 rounded-lg mb-3 flex flex-col sm:flex-row justify-between sm:items-center gap-2.5 shadow-lg">
                        <div className="flex items-center justify-between w-full sm:w-auto gap-2">
                            <button 
                                onClick={() => setSelectedFile(null)}
                                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg transition font-medium"
                            >
                                ← Back
                            </button>
                            <span className="text-[12px] font-mono text-yellow-400 truncate max-w-[180px]">
                                📂 {selectedFile}
                            </span>
                        </div>
                        <button 
                            onClick={handleCopy}
                            className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-3 py-2 rounded-lg transition w-full sm:w-auto text-center shadow-md active:scale-95"
                        >
                            {copied ? '✅ Copied!' : '📋 Copy Code'}
                        </button>
                    </div>

                    {/* Code Container with Enhanced Font Size and Spacing */}
                    <div className="bg-[#0b1120] border border-slate-800 rounded-lg p-3.5 overflow-auto font-mono text-[13.5px] leading-relaxed text-slate-200 flex-1 max-h-[62vh] select-text">
                        {loading ? (
                            <div className="text-center py-8 text-slate-400 animate-pulse text-sm">Fetching code content...</div>
                        ) : (
                            <pre className="whitespace-pre-wrap break-words">{codeContent}</pre>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
