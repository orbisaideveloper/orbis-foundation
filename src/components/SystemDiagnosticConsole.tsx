import React, { useState, useEffect } from 'react';

export default function SystemDiagnosticConsole() {
    const [isOpen, setIsOpen] = useState(false);
    const [telemetry, setTelemetry] = useState<any>(null);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isOpen) {
            // ফেচ রিকোয়েস্ট আপনার ব্যাকএন্ড রাউটে যাবে
            const fetchData = async () => {
                try {
                    const res = await fetch('/api/diagnostics');
                    const data = await res.json();
                    setTelemetry(data);
                } catch (e) {
                    console.error("Telemetry error", e);
                }
            };
            fetchData();
            interval = setInterval(fetchData, 3000); // প্রতি ৩ সেকেন্ডে আপডেট
        }
        return () => clearInterval(interval);
    }, [isOpen]);

    return (
        <>
            {/* মেইন ড্যাশবোর্ড কার্ড (ছোট ভার্সন) */}
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
                            <p className="text-emerald-400 m-0 mt-1 text-sm">🟢 লাইভ মনিটরিং অ্যাক্টিভ</p>
                        </div>
                    </div>
                    <div className="bg-white/5 px-4 py-2 rounded-full text-slate-400 text-sm font-medium">
                        ওপেন করুন ➔
                    </div>
                </div>
            </div>

            {/* ফুল স্ক্রিন মডাল (২য় পেজ) */}
            {isOpen && (
                <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 overflow-y-auto p-6">
                    <div className="max-w-5xl mx-auto pb-20">
                        <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-6">
                            <h2 className="text-2xl text-slate-100">⚙️ ORBIS Master Telemetry System</h2>
                            <button onClick={() => setIsOpen(false)} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-bold">
                                Close ✖
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* কার্ড ১: Bridge Status */}
                            <div className="bg-slate-800/50 border border-white/10 p-4 rounded-xl">
                                <h3 className="text-sky-400 text-lg mb-2">1. Bridge Status</h3>
                                <pre className="text-slate-300 text-sm">{telemetry ? JSON.stringify(telemetry.bridge, null, 2) : 'Loading...'}</pre>
                            </div>

                            {/* কার্ড ২: AI Providers */}
                            <div className="bg-slate-800/50 border border-white/10 p-4 rounded-xl">
                                <h3 className="text-sky-400 text-lg mb-2">2. AI Providers</h3>
                                <pre className="text-slate-300 text-sm">{telemetry ? JSON.stringify(telemetry.providers, null, 2) : 'Loading...'}</pre>
                            </div>

                            {/* কার্ড ৩: Master Console Log */}
                            <div className="bg-slate-900 border border-sky-500/50 p-4 rounded-xl md:col-span-2">
                                <h3 className="text-sky-400 text-lg mb-2">3. Master Runtime Console</h3>
                                <div className="h-48 overflow-y-auto text-emerald-400 font-mono text-xs">
                                    {telemetry?.logs?.map((log: any, i: number) => (
                                        <div key={i}>{`> [${log.timestamp}] [${log.source}] ${log.message}`}</div>
                                    )) || 'Waiting for logs...'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
