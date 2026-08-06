import React, { useState, useEffect } from 'react';

export default function SystemDiagnosticConsole() {
    const [isOpen, setIsOpen] = useState(false);
    const [telemetry, setTelemetry] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchTelemetry = async () => {
        try {
            const res = await fetch('/api/diagnostics');
            if(res.ok) {
                const data = await res.json();
                setTelemetry(data);
                setLoading(false);
            }
        } catch (e) {
            console.error("Telemetry fetch error", e);
        }
    };

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isOpen) {
            fetchTelemetry();
            interval = setInterval(fetchTelemetry, 3000);
        }
        return () => clearInterval(interval);
    }, [isOpen]);

    return (
        <>
            {/* ড্যাশবোর্ড ট্রিগার কার্ড */}
            <div 
                onClick={() => setIsOpen(true)}
                className="bg-gradient-to-br from-slate-900 to-slate-800 border border-sky-500/30 rounded-2xl p-5 mb-4 cursor-pointer shadow-lg hover:shadow-sky-500/20 transition-all"
            >
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-sky-500/20 p-2 rounded-xl text-sky-400">
                            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                        </div>
                        <div>
                            <h4 className="text-slate-100 m-0 text-base font-semibold">সিস্টেম ডায়াগনস্টিকস ও এআই কনসোল</h4>
                            <p className="text-emerald-400 m-0 mt-1 text-sm">🟢 ৮টি মডিউল লাইভ মনিটরিং অ্যাক্টিভ</p>
                        </div>
                    </div>
                    <div className="bg-white/5 px-4 py-2 rounded-full text-slate-400 text-sm font-medium">
                        ওপেন করুন ➔
                    </div>
                </div>
            </div>

            {/* ফুল স্ক্রিন ৮-কার্ড মডাল */}
            {isOpen && (
                <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 overflow-y-auto p-6 font-sans">
                    <div className="max-w-6xl mx-auto pb-20">
                        <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
                            <h2 className="text-2xl text-slate-100 font-bold">⚙️ ORBIS Master Telemetry (8-Core Array)</h2>
                            <button onClick={() => setIsOpen(false)} className="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-lg font-bold transition">
                                Close ✖
                            </button>
                        </div>

                        {loading ? (
                            <div className="text-sky-400 text-center py-10">ফেচিং লাইভ ডাটা...</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                                
                                {/* 1. Bridge Status */}
                                <div className="bg-slate-800/60 border border-white/10 p-5 rounded-xl">
                                    <h3 className="text-sky-400 text-sm font-bold mb-3 uppercase tracking-wider">[▼] 1. Bridge Status</h3>
                                    <div className="text-slate-300 font-mono text-sm leading-relaxed">
                                        <div>• bridge.cjs Status : <span className="text-emerald-400">{telemetry?.bridge?.bridgeStatus}</span></div>
                                        <div>• server.cjs Status : <span className="text-emerald-400">{telemetry?.bridge?.serverStatus}</span></div>
                                        <div>• sync-audit.cjs    : <span className="text-emerald-400">{telemetry?.bridge?.syncAudit}</span></div>
                                        <div>• Last Heartbeat    : {telemetry?.bridge?.lastHeartbeat}</div>
                                        <div>• Uptime            : {telemetry?.bridge?.uptime}</div>
                                        <div>• Port              : {telemetry?.bridge?.port}</div>
                                    </div>
                                </div>

                                {/* 2. AI Providers */}
                                <div className="bg-slate-800/60 border border-white/10 p-5 rounded-xl">
                                    <h3 className="text-sky-400 text-sm font-bold mb-3 uppercase tracking-wider">[▼] 2. AI Providers Monitor</h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs font-mono text-slate-300">
                                            <thead className="text-slate-500 border-b border-white/10">
                                                <tr><th>Provider</th><th>Status</th><th>Ping</th><th>Endpoint</th></tr>
                                            </thead>
                                            <tbody>
                                                {telemetry?.providers?.map((p:any, i:number) => (
                                                    <tr key={i} className="border-b border-white/5">
                                                        <td className="py-1">{p.name}</td>
                                                        <td className={p.status.includes('Online') ? 'text-emerald-400' : 'text-amber-400'}>{p.status}</td>
                                                        <td>{p.ping}</td>
                                                        <td>{p.endpoint}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* 3. Request Pipeline */}
                                <div className="bg-slate-800/60 border border-white/10 p-5 rounded-xl">
                                    <h3 className="text-sky-400 text-sm font-bold mb-3 uppercase tracking-wider">[▼] 3. Request Pipeline Flow</h3>
                                    <div className="text-slate-300 font-mono text-sm flex flex-col gap-2">
                                        <div>[ Dashboard ] ➔ <span className="text-emerald-400">{telemetry?.pipeline?.dashboard}</span></div>
                                        <div className="ml-4">↓</div>
                                        <div>[ Bridge.cjs ] ➔ <span className="text-emerald-400">{telemetry?.pipeline?.bridge}</span></div>
                                        <div className="ml-4">↓</div>
                                        <div>[ AI Provider ] ➔ <span className="text-amber-400">{telemetry?.pipeline?.provider}</span></div>
                                    </div>
                                </div>

                                {/* 4. Live Request Log */}
                                <div className="bg-slate-800/60 border border-white/10 p-5 rounded-xl">
                                    <h3 className="text-sky-400 text-sm font-bold mb-3 uppercase tracking-wider">[▼] 4. Live Request Log</h3>
                                    <div className="h-32 overflow-y-auto bg-slate-900 p-2 rounded border border-white/5 font-mono text-xs text-slate-400">
                                        {telemetry?.requestLogs?.map((log:any, i:number) => (
                                            <div key={i} className="mb-1 border-b border-white/5 pb-1">
                                                <span className="text-sky-300">[{log.timestamp}]</span> {log.provider} ➔ {log.endpoint} <span className={log.status === 200 ? 'text-emerald-400' : 'text-red-400'}>({log.result})</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 5. Master Console (Full Width) */}
                                <div className="bg-slate-950 border border-sky-500/40 p-5 rounded-xl md:col-span-2 shadow-[0_0_15px_rgba(56,189,248,0.1)]">
                                    <h3 className="text-sky-400 text-sm font-bold mb-3 uppercase tracking-wider flex justify-between">
                                        <span>[▼] 5. Master Runtime Console</span>
                                        <span className="text-emerald-400 animate-pulse">● LIVE</span>
                                    </h3>
                                    <div className="h-40 overflow-y-auto font-mono text-xs flex flex-col gap-1">
                                        {telemetry?.logs?.map((log:any, i:number) => (
                                            <div key={i} className={log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARN' ? 'text-amber-400' : 'text-emerald-400'}>
                                                {`> [${log.level}] [${log.timestamp}] [${log.source}]: ${log.message}`}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* 6. Connection Diagnostics */}
                                <div className="bg-slate-800/60 border border-white/10 p-5 rounded-xl">
                                    <h3 className="text-sky-400 text-sm font-bold mb-3 uppercase tracking-wider">[▼] 6. Diagnostics</h3>
                                    <div className="text-slate-300 font-mono text-sm leading-relaxed">
                                        <div>• Bridge API : {telemetry?.diagnostics?.apiReachable}</div>
                                        <div>• Termux : {telemetry?.diagnostics?.termuxReachable}</div>
                                        <div>• Ollama : {telemetry?.diagnostics?.localAIReachable}</div>
                                        <div>• Git Tree : <span className={telemetry?.diagnostics?.gitStatus.includes('Clean') ? 'text-emerald-400' : 'text-amber-400'}>{telemetry?.diagnostics?.gitStatus}</span></div>
                                    </div>
                                </div>

                                {/* 7. Error Inspector */}
                                <div className="bg-slate-800/60 border border-red-500/20 p-5 rounded-xl">
                                    <h3 className="text-red-400 text-sm font-bold mb-3 uppercase tracking-wider">[▼] 7. Error Inspector</h3>
                                    <div className="text-red-300/80 font-mono text-sm leading-relaxed">
                                        <div>• Type: {telemetry?.errors?.type}</div>
                                        <div>• File: {telemetry?.errors?.file}</div>
                                        <div>• Fix: <span className="text-emerald-400">{telemetry?.errors?.fix}</span></div>
                                    </div>
                                </div>

                                {/* 8. Dependency Inspector */}
                                <div className="bg-slate-800/60 border border-white/10 p-5 rounded-xl md:col-span-2">
                                    <h3 className="text-sky-400 text-sm font-bold mb-3 uppercase tracking-wider">[▼] 8. Dependency Inspector</h3>
                                    <div className="flex gap-4 mt-2">
                                        <button className="bg-sky-600 hover:bg-sky-500 text-white text-xs px-4 py-2 rounded transition">Open Live Dependency Tree</button>
                                        <button className="bg-teal-600 hover:bg-teal-500 text-white text-xs px-4 py-2 rounded transition">Open Live Import Graph</button>
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
