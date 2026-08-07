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

    const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            action();
        }
    };

    const filteredHistory = history.filter(commit => 
        (commit.commitId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (commit.files || []).some((f: any) => (f.filePath || '').toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const renderStatusBadge = (status: string) => {
        if (status === 'FAILED') {
            return (
                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/40 px-2 py-0.5 rounded font-bold">
                    ❌ CI FAILED
                </span>
            );
        }
        return (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded font-bold">
                ✅ PASSED
            </span>
        );
    };

    const renderDiffContent = (code: string) => {
        const lines = code.split('\n');
        return lines.map((line, idx) => {
            let lineStyle = "text-slate-200";
            let bgStyle = "hover:bg-slate-800/40";

            if (line.trim().startsWith('+') || line.includes('NEWLY EDITED') || line.includes('Fix:') || line.includes('ALTER TABLE')) {
                lineStyle = "text-emerald-300 font-semibold";
                bgStyle = "bg-emerald-950/40 border-l-2 border-emerald-500 pl-1";
            } else if (line.trim().startsWith('-') || line.includes('DELETE FROM') || line.includes('Error')) {
                lineStyle = "text-rose-300 font-semibold";
                bgStyle = "bg-rose-950/40 border-l-2 border-rose-500 pl-1";
            }

            return (
                <div key={`line-${idx + 1}`} className={`py-0.5 px-2 font-mono text-[13.5px] leading-relaxed transition-colors ${lineStyle} ${bgStyle}`}>
                    <span className="inline-block w-8 text-slate-600 select-none text-[11px] mr-2 text-right">{idx + 1}</span>
                    <span>{line}</span>
                </div>
            );
        });
    };

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
                            {filteredHistory.map((commit) => (
                                <div key={commit.commitId || `commit-${commit.createdAt}`} className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex flex-col gap-2.5 shadow-md">
                                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[12px] font-mono font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-500/20">
                                                Commit: {commit.commitId ? commit.commitId.slice(0, 8) : 'N/A'}
                                            </span>
                                            {renderStatusBadge(commit.status)}
                                        </div>
                                        <span className="text-[11px] text-slate-400 font-mono">
                                            {commit.createdAt ? new Date(commit.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) : ''}
                                        </span>
                                    </div>

                                    {commit.status === 'FAILED' && commit.errorMessage && (
                                        <div className="text-[11px] font-mono bg-red-950/60 border border-red-800/60 text-red-300 p-2.5 rounded-lg whitespace-pre-wrap select-all">
                                            ⚠️ <strong className="text-red-200">Failure Reason:</strong> {commit.errorMessage}
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-1.5 mt-0.5">
                                        <span className="text-[11px] text-slate-400 font-semibold">
                                            Files Changed ({commit.files?.length || 0}):
                                        </span>
                                        <div className="space-y-1.5">
                                            {commit.files?.map((file: any) => (
                                                <div 
                                                    key={`${commit.commitId}-${file.filePath}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => handleSelectFile(commit, file.filePath)}
                                                    onKeyDown={(e) => handleKeyDown(e, () => handleSelectFile(commit, file.filePath))}
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
                    {/* Single-Row Crystal Glassmorphism Header */}
                    <div className="sticky top-0 z-30 backdrop-blur-md bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-lg mb-2 flex flex-row items-center justify-between gap-2 shadow-lg">
                        <button 
                            type="button"
                            onClick={() => setSelectedFile(null)}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg transition font-medium shrink-0"
                        >
                            ← Back
                        </button>
                        <span className="text-[12px] font-mono text-yellow-400 truncate max-w-[160px] sm:max-w-[300px] text-center">
                            📂 {selectedFile}
                        </span>
                        <button 
                            type="button"
                            onClick={handleCopy}
                            className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-3 py-1.5 rounded-lg transition shrink-0 shadow-md active:scale-95"
                        >
                            {copied ? '✅ Copied!' : '📋 Copy Code'}
                        </button>
                    </div>

                    {/* Maximized Code View Container with Diff Highlighting */}
                    <div className="bg-[#0b1120] border border-slate-800 rounded-lg py-3 overflow-auto flex-1 max-h-[66vh] select-text custom-scrollbar">
                        {loading ? (
                            <div className="text-center py-8 text-slate-400 animate-pulse text-sm">Fetching version diff content...</div>
                        ) : (
                            <div className="whitespace-pre overflow-x-auto">
                                {renderDiffContent(codeContent)}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
