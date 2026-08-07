import React, { useState, useEffect, useCallback } from 'react';

interface LogItem {
    id: string;
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
    source: string;
}

export default function SystemLogManager() {
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterLevel, setFilterLevel] = useState<string>('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const sanitizedFilter = encodeURIComponent(filterLevel);
            const res = await fetch(`/api/system/logs?level=${sanitizedFilter}`);
            const data = await res.json();
            if (data.success && Array.isArray(data.logs)) {
                setLogs(data.logs);
            }
        } catch (err) {
            console.error("Failed to fetch system logs:", err);
        } finally {
            setLoading(false);
        }
    }, [filterLevel]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            action();
        }
    };

    const getBadgeStyle = (level: string) => {
        if (level === 'ERROR') {
            return 'bg-red-500/20 text-red-400 border-red-500/40';
        }
        if (level === 'WARN') {
            return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40';
        }
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    };

    const filteredLogs = logs.filter(log => {
        return log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
               log.source.toLowerCase().includes(searchTerm.toLowerCase());
    });

    return (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 text-slate-200 shadow-xl w-full font-sans">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <div>
                    <h2 className="text-lg font-bold text-yellow-400">📜 System Audit & Logs</h2>
                    <p className="text-[12px] text-slate-400 mt-0.5">Real-time system telemetry and event monitoring.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        type="button"
                        onClick={fetchLogs} 
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition"
                    >
                        🔄 Refresh
                    </button>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <input 
                    type="text" 
                    placeholder="Search logs by message or source..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-yellow-500 focus:border-yellow-500 block w-full p-2.5 outline-none"
                />
                <select 
                    value={filterLevel} 
                    onChange={(e) => setFilterLevel(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg p-2.5 outline-none font-mono"
                >
                    <option value="ALL">All Levels</option>
                    <option value="INFO">INFO</option>
                    <option value="WARN">WARN</option>
                    <option value="ERROR">ERROR</option>
                </select>
            </div>

            {loading ? (
                <div className="text-center py-8 text-slate-400 animate-pulse text-sm">Loading system telemetry logs...</div>
            ) : filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No matching log events found.</div>
            ) : (
                <div className="space-y-2 overflow-y-auto pr-1 max-h-[60vh] custom-scrollbar">
                    {filteredLogs.map((log) => (
                        <div 
                            key={log.id} 
                            role="button"
                            tabIndex={0}
                            onClick={() => console.log('Log selected:', log.id)}
                            onKeyDown={(e) => handleKeyDown(e, () => console.log('Log selected:', log.id))}
                            className="bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 transition cursor-pointer"
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className={`text-[10px] border px-2 py-0.5 rounded font-bold font-mono ${getBadgeStyle(log.level)}`}>
                                    {log.level}
                                </span>
                                <span className="text-[12px] font-mono text-slate-300 truncate max-w-[280px]">
                                    [{log.source}] {log.message}
                                </span>
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono shrink-0">
                                {new Date(log.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
