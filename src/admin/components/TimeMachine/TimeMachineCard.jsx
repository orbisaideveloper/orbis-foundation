import React, { useState, useEffect } from 'react';

export default function TimeMachineCard({ onClose }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedVersion, setSelectedVersion] = useState(null);
    const [codeContent, setCodeContent] = useState('');
    const [copied, setCopied] = useState(false);

    // ব্যাকএন্ডের স্বাধীন টাইম মেশিন API থেকে হিস্ট্রি ফেচ করা
    useEffect(() => {
        fetch('/api/source/time-machine/history')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setHistory(data.history);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error("Time Machine Error:", err);
                setLoading(false);
            });
    }, []);

    // নির্দিষ্ট ভার্সনের কোড লোড করা
    const handleSelectVersion = (item) => {
        setSelectedVersion(item);
        setLoading(true);
        fetch(`/api/source/time-machine/version?commitId=${item.commitId}&filePath=${encodeURIComponent(item.filePath)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setCodeContent(data.data.content);
                } else {
                    setCodeContent('// Error loading code content');
                }
                setLoading(false);
            })
            .catch(err => {
                setCodeContent('// Failed to fetch version');
                setLoading(false);
            });
    };

    // কোড কপি করার ফাংশন
    const handleCopy = () => {
        navigator.clipboard.writeText(codeContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 text-slate-200 shadow-xl w-full max-w-4xl mx-auto my-4 font-sans">
            {/* হেডার সেকশন */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                <div>
                    <h2 className="text-xl font-bold text-yellow-400 flex items-center gap-2">
                        ⏳ Source Time Machine
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                        Track previous versions, review code changes, and safely recover stable code.
                    </p>
                </div>
                {onClose && (
                    <button 
                        onClick={onClose}
                        className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-lg text-sm transition"
                    >
                        ✕ Close
                    </button>
                )}
            </div>

            {/* মূল বডি: যদি কোড ভিউ সিলেক্ট করা না থাকে তবে লিস্ট দেখাবে, সিলেক্ট করলে কোড দেখাবে */}
            {!selectedVersion ? (
                <div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">Recent Code Modification Logs (Max 100)</h3>
                    {loading ? (
                        <div className="text-center py-8 text-slate-400 animate-pulse">Loading time machine logs...</div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">No history logs found yet. Modify some files to generate logs.</div>
                    ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                            {history.map((item, index) => (
                                <div 
                                    key={index} 
                                    onClick={() => handleSelectVersion(item)}
                                    className="bg-slate-900/80 border border-slate-800 hover:border-yellow-500/50 p-3 rounded-lg flex justify-between items-center cursor-pointer transition group"
                                >
                                    <div>
                                        <span className="text-xs font-mono text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-500/20">
                                            {item.filePath}
                                        </span>
                                        <p className="text-xs text-slate-400 mt-1">
                                            Commit ID: {item.commitId.slice(0, 8)}...
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs text-slate-400">
                                            {new Date(item.createdAt).toLocaleString()}
                                        </span>
                                        <span className="block text-xs text-yellow-400 opacity-0 group-hover:opacity-100 transition mt-0.5">
                                            View Code →
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div>
                    {/* নেভিগেশন এবং কন্ট্রোল বার */}
                    <div className="flex justify-between items-center mb-3 bg-slate-900 p-3 rounded-lg border border-slate-800">
                        <div>
                            <button 
                                onClick={() => setSelectedVersion(null)}
                                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                            >
                                ← Back to History List
                            </button>
                        </div>
                        <div className="text-xs font-mono text-yellow-400 truncate max-w-xs">
                            📂 {selectedVersion.filePath}
                        </div>
                        <div>
                            <button 
                                onClick={handleCopy}
                                className="text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/30 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                            >
                                {copied ? '✅ Copied!' : '📋 Copy Code'}
                            </button>
                        </div>
                    </div>

                    {/* কোড ডিসপ্লে স্ক্রিন */}
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 max-h-96 overflow-auto font-mono text-xs text-slate-300">
                        {loading ? (
                            <div className="text-center py-8 text-slate-400 animate-pulse">Fetching version content...</div>
                        ) : (
                            <pre className="whitespace-pre-wrap">{codeContent}</pre>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
