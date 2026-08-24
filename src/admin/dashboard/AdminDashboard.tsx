import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SystemLogManager from "../system-logs/SystemLogManager";
import { GlassChatCard } from "../../features/orbis-ai-chatbot/components/GlassChatCard";
import { TermuxObservatory } from "./sections/TermuxObservatory";
import { readAdminJson } from "../auth/adminFetch";
import { DiagnosticExportActions } from "./DiagnosticExportActions";
import { AnimatedMonitorFrame } from "./components/AnimatedMonitorFrame";

const SOURCE_TREE_NAME = "Source Tree";
const MASTER_NODE_NAME = "Master Node";

const LiveStatusText = () => {
  const [status, setStatus] = React.useState(
    "আপনার সিস্টেমের প্রতিটি মডিউল সফলভাবে সিঙ্ক হয়েছে। ORBIS Foundation-এর কোর ইঞ্জিন এখন অপটিমাল পারফরম্যান্সে চলছে।",
  );
  React.useEffect(() => {
    readAdminJson<any>("/api/diagnostics")
      .then((d) => {
        if (d?.gitStatus && d.gitStatus !== "Unknown")
          setStatus(
            `[ লাইভ ] ${d.gitStatus} | Bridge: ${d.bridge.bridgeStatus}`,
          );
      })
      .catch(() => {});
  }, []);
  return (
    <p className="text-[12px] text-slate-600 leading-relaxed font-bold mt-1 bg-green-100/50 p-1.5 rounded-md border border-green-200 inline-block">
      {status}
    </p>
  );
};

export function AdminDashboard() {
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [activeSubCard, setActiveSubCard] = useState<string | null>(null);
  const [sysStats, setSysStats] = useState({
    load: "0",
    load5m: "0",
    load15m: "0",
    ramUsedPercent: "0",
    totalMem: "0",
    usedMem: "0",
    freeMem: "0",
    uptime: "0",
    processUptime: "0",
    cpuCores: 0,
    cpuModel: "...",
    arch: "...",
    platform: "...",
    release: "...",
    hostname: "...",
    heapUsed: "0",
    status: "Connecting...",
  });
  const [copiedText, setCopiedText] = useState(false);
  const copyResetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [showOutput, setShowOutput] = useState(false);
  const [viewMode, setViewMode] = useState("diagnostic");
  const [outputData] = useState("");
  const [liveTree, setLiveTree] = useState(
    "অপেক্ষা করুন, রেন্ডার সার্ভার থেকে লাইভ ট্রি আনা হচ্ছে...",
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) {
        clearTimeout(copyResetTimer.current);
      }
    };
  }, []);

  const markCopied = () => {
    if (copyResetTimer.current !== null) {
      clearTimeout(copyResetTimer.current);
    }
    setCopiedText(true);
    copyResetTimer.current = setTimeout(() => {
      setCopiedText(false);
      copyResetTimer.current = null;
    }, 2000);
  };

  const fetchLiveTree = async () => {
    try {
      const response = await fetch("/api/orbis-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "সোর্স কোড দেখাও" }),
      });
      const data = await response.json();
      setLiveTree(data.result);
    } catch (error) {
      console.error(error);
      setLiveTree("[ERROR] Live Tree Fetch Failed. Check API connection.");
    }
  };

  useEffect(() => {
    if (activeCard === "overview") {
      fetch("/api/system-stats")
        .then((res) => res.json())
        .then((data) => setSysStats(data))
        .catch(() =>
          setSysStats((s) => ({ ...s, status: "OFFLINE", load: "ERR" })),
        );
    }
  }, [activeCard]);

  useEffect(() => {
    if (showOutput || activeSubCard === SOURCE_TREE_NAME) {
      fetchLiveTree();
    }
  }, [showOutput, activeSubCard]);

  useEffect(() => {
    if (activeSubCard || activeCard) {
      window.history.pushState({ modal: true }, "");
      const handlePop = () => {
        setActiveSubCard(null);
        setActiveCard(null);
      };
      window.addEventListener("popstate", handlePop);
      return () => window.removeEventListener("popstate", handlePop);
    }
  }, [activeSubCard, activeCard]);

  const [data, setData] = useState({
    engine: "Loading...",
    uptime: "---",
    health: "Checking...",
    db: "N/A",
    ai: "Scanning...",
    latency: "---",
    sync: "---",
    phase: "03",
    runtime: "Node.js",
    runtimeVer: "v24.18.0",
    release: "v4.1.10",
    releaseType: "Automated CI/CD",
    core: "Active",
    coreStatus: "All nominal",
  });

  useEffect(() => {
    let isMounted = true;
    const fetchRealData = async () => {
      if (isMounted) {
        try {
          const res = await fetch("/api/system-stats");
          const stats = await res.json();
          setData({
            engine: stats.status,
            uptime: stats.uptime,
            health:
              Number.parseFloat(stats.ramUsedPercent) < 85
                ? "Optimal"
                : "Warning",
            db: "Secured",
            ai: "Active",
            latency: stats.load + "ms",
            sync: "Synced",
            phase: "04",
            runtime: "Node.js",
            runtimeVer: stats.arch,
            release: stats.release.substring(0, 15),
            releaseType: stats.platform,
            core: stats.cpuCores + " Cores",
            coreStatus:
              Number.parseFloat(stats.load) < 5 ? "All nominal" : "High Load",
          });
          setSysStats(stats);
        } catch (err) {
          console.error(err);
        }
      }
    };
    fetchRealData();
    const interval = setInterval(fetchRealData, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const getTargetName = (card: string | null) => {
    if (!card) return "";
    const map: Record<string, string> = {
      health: "Health",
      engine: "Engine",
      core: "Architecture",
      runtime: "Microservices",
      release: MASTER_NODE_NAME,
    };
    return map[card] || card;
  };

  const renderPremiumModalContent = () => {
    if (activeCard === "overview") {
      if (activeSubCard) {
        return (
          <div className="flex flex-col h-full animate-in fade-in zoom-in duration-200">
            <button
              type="button"
              onClick={() => setActiveSubCard(null)}
              className="mb-3 text-[13px] text-slate-600 font-bold hover:text-slate-900 flex items-center gap-1.5 w-fit bg-slate-200/60 px-3 py-1.5 rounded-lg transition-colors active:scale-95"
            >
              ← Back
            </button>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex-1 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  {activeSubCard} Data Log
                  <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse border border-emerald-200">
                    LIVE
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      activeSubCard === SOURCE_TREE_NAME
                        ? liveTree
                        : generateRawTelemetry(activeSubCard, sysStats),
                    );
                    markCopied();
                  }}
                  className={`text-[12px] font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all active:scale-95 shadow-sm ${copiedText ? "bg-emerald-100 text-emerald-700" : "bg-slate-800 hover:bg-slate-700 text-white"}`}
                >
                  {copiedText ? "✓ Copied" : "⧉ Copy"}
                </button>
              </div>
              <div className="bg-slate-900 rounded-lg p-4 flex-1 overflow-auto select-text cursor-text shadow-inner">
                <pre className="font-mono text-[12px] text-emerald-400 whitespace-pre-wrap leading-relaxed select-text">
                  {activeSubCard === SOURCE_TREE_NAME
                    ? liveTree
                    : generateRawTelemetry(activeSubCard, sysStats)
                        .replace(
                          /CPU: 12% \| RAM: 45%/g,
                          `CPU: ${sysStats.load}% | RAM: ${sysStats.ramUsedPercent}%`,
                        )
                        .replace(
                          /Current Server Load: 12\.4%/g,
                          `Current Server Load: ${sysStats.load}%`,
                        )
                        .replace(
                          /Phase 04 active/g,
                          `System Uptime: ${sysStats.uptime}`,
                        )
                        .replace(
                          /14 active services/g,
                          `${sysStats.cpuCores} CPU Cores Active on ${sysStats.platform}`,
                        )}
                </pre>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setActiveSubCard("System Phase")}
            className="text-left bg-white border border-orange-100 shadow-sm rounded-xl p-3 flex flex-col justify-center cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <h4 className="text-[10px] font-bold text-orange-600 uppercase tracking-wide">
              System Phase
            </h4>
            <p className="text-lg font-black text-slate-800 mt-0.5">
              Phase {data.phase}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubCard("Architecture")}
            className="text-left bg-white border border-orange-100 shadow-sm rounded-xl p-3 flex flex-col justify-center cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <h4 className="text-[10px] font-bold text-orange-600 uppercase tracking-wide">
              Architecture
            </h4>
            <p className="text-lg font-black text-slate-800 mt-0.5">
              {sysStats.cpuCores} Cores ({sysStats.arch})
            </p>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubCard("Microservices")}
            className="text-left bg-white border border-slate-200 shadow-sm rounded-xl p-3 flex flex-col justify-center cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              Microservices
            </h4>
            <p className="text-lg font-black text-slate-800 mt-0.5">
              {sysStats.ramUsedPercent}%
            </p>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubCard(MASTER_NODE_NAME)}
            className="text-left bg-white border border-green-100 shadow-sm rounded-xl p-3 flex flex-col justify-center cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <h4 className="text-[10px] font-bold text-green-600 uppercase tracking-wide">
              Master Node
            </h4>
            <p className="text-lg font-black text-green-700 mt-0.5">
              {sysStats.platform}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubCard("API Gateway")}
            className="text-left bg-white border border-slate-200 shadow-sm rounded-xl p-3 flex flex-col justify-center cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              API Gateway
            </h4>
            <p className="text-lg font-black text-slate-800 mt-0.5">
              {sysStats.status}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubCard("Avg Load")}
            className="text-left bg-white border border-slate-200 shadow-sm rounded-xl p-3 flex flex-col justify-center cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              Avg Load
            </h4>
            <p className="text-lg font-black text-slate-800 mt-0.5">
              {sysStats.load}%
            </p>
          </button>
        </div>
      );
    }

    const targetName = getTargetName(activeCard);
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex-1 flex flex-col h-full">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 capitalize">
            <span className="text-xl">📡</span> Live Stream:{" "}
            {activeCard?.replace("_", " ")}
          </h3>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(
                generateRawTelemetry(targetName, sysStats),
              );
              markCopied();
            }}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all active:scale-95 shadow-sm ${copiedText ? "bg-emerald-100 text-emerald-700" : "bg-slate-800 hover:bg-slate-700 text-white"}`}
          >
            {copiedText ? "✓ Copied" : "⧉ Copy Data"}
          </button>
        </div>
        <div className="bg-slate-900 rounded-lg p-4 flex-1 overflow-auto select-text cursor-text shadow-inner">
          <pre className="font-mono text-[12px] text-teal-300 whitespace-pre-wrap leading-relaxed">
            {`[SYSTEM] Accessing secure node: ${activeCard}...\n[STATUS] Connection established.\n\n`}
            {generateRawTelemetry(targetName, sysStats)}
          </pre>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen bg-[#F8FAFC] flex flex-col relative pb-6 font-sans">
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="fixed inset-y-0 left-0 w-64 bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <span>🧠</span> Menu
                </h2>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="bg-slate-200 text-slate-600 h-8 w-8 rounded-full font-bold flex items-center justify-center hover:bg-slate-300"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 flex flex-col gap-2">
                <button
                  type="button"
                  className="text-left px-4 py-3 rounded-xl bg-green-50 text-green-700 font-semibold border border-green-100"
                >
                  📊 Dashboard
                </button>
                <button
                  type="button"
                  className="text-left px-4 py-3 rounded-xl text-slate-600 font-medium hover:bg-slate-50"
                >
                  ⚙️ System Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarOpen(false);
                    setViewMode("diagnostic");
                    setShowOutput(true);
                  }}
                  className="text-left px-4 py-3 rounded-xl text-slate-600 font-bold hover:bg-slate-100 flex items-center gap-3"
                >
                  <span className="text-lg">💻</span> ডায়াগনস্টিক টার্মিনাল
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarOpen(false);
                    setViewMode("tree");
                    setShowOutput(true);
                  }}
                  className="text-left px-4 py-3 rounded-xl text-slate-600 font-bold hover:bg-slate-100 flex items-center gap-3"
                >
                  <span className="text-lg">🗂️</span> লাইভ ডিপেন্ডেন্সি ট্রি
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <header className="flex items-center justify-between px-5 py-4 bg-white sticky top-0 z-10 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="text-slate-500 hover:text-slate-700 p-1"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <h1 className="text-[16px] font-bold text-slate-800 flex items-center gap-2 cursor-pointer hover:opacity-80 transition-all">
            <div className="relative w-6 h-6 flex items-center justify-center">
              <img
                src="/orbis-logo.png"
                alt="Orbis"
                className="absolute inset-0 w-full h-full object-contain z-10"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <span className="text-xl relative z-0">🧠</span>
            </div>
            <span>Orbis Foundation Admin Dashboard</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 bg-green-50/80 px-2.5 py-1.5 rounded-full border border-green-100">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </span>
          <span className="text-[11px] font-bold text-green-700 uppercase tracking-wide">
            Live
          </span>
        </div>
      </header>

      <div className="px-5 mt-5 mb-2">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("open-telemetry-modal"))
          }
          className="w-full text-left cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all p-4 rounded-[20px] bg-gradient-to-br from-green-50 to-emerald-50/50 border border-green-100/60 shadow-sm relative overflow-hidden"
        >
          <div className="flex items-start gap-3 relative z-10">
            <span className="text-xl mt-0.5">☀️</span>
            <div>
              <h2 className="text-[15px] font-bold text-slate-800 mb-1">
                সিস্টেম লাইভ এবং প্রস্তুত
              </h2>
              <LiveStatusText />
            </div>
          </div>
        </button>
      </div>

      <DiagnosticExportActions />

      <div className="w-full px-5 mt-4 mb-5">
        <GlassChatCard />
      </div>

      <AnimatePresence>
        {showOutput && (
          <AnimatedMonitorFrame
            className="fixed inset-0 bg-white z-[60] flex flex-col"
            contentClassName="flex-1 p-4 overflow-hidden bg-slate-50 flex flex-col gap-4"
            headerClassName="pt-6"
            onClose={() => setShowOutput(false)}
            titleClassName="text-[16px] font-bold text-teal-700 flex items-center gap-2"
            title={
              <>
                <span className="text-xl">💻</span> Terminal Output
              </>
            }
          >
            {viewMode === "diagnostic" && (
              <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-[13px] flex-1 overflow-auto shadow-inner relative flex flex-col">
                <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-2 sticky top-0 bg-slate-900 z-10">
                  <span className="text-slate-400 text-[11px]">
                    ~/orbis/terminal
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(outputData);
                      markCopied();
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded-md text-[10px] font-bold transition-all shadow-sm"
                  >
                    {copiedText ? "✓ Copied" : "⧉ Copy"}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap select-text">
                  {outputData}
                </pre>
              </div>
            )}

            {viewMode === "tree" && (
              <div className="bg-[#0b1120] text-blue-300 p-4 rounded-xl font-mono text-[12px] flex-1 overflow-auto shadow-inner relative flex flex-col">
                <div className="flex justify-between items-center mb-3 border-b border-slate-700 pb-2 sticky top-0 bg-[#0b1120] pt-1 z-10">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    <span className="text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                      Live System Tree (Render Cloud)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(liveTree);
                      markCopied();
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded-md text-[10px] font-bold transition-all shadow-sm"
                  >
                    {copiedText ? "✓ Copied" : "⧉ Copy"}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap select-text leading-relaxed text-[11px] pb-4">
                  {liveTree}
                </pre>
              </div>
            )}
          </AnimatedMonitorFrame>
        )}
      </AnimatePresence>

      <div className="px-5 mb-4">
        <button
          type="button"
          onClick={() => {
            setViewMode("tree");
            setShowOutput(true);
          }}
          className="w-full bg-indigo-50 text-indigo-700 border border-indigo-200 p-3 rounded-[16px] text-[13px] font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-indigo-100 active:scale-95 transition-all"
        >
          <span className="text-lg">🗂️</span> লাইভ ডিপেন্ডেন্সি ট্রি
        </button>
      </div>

      <div className="px-5 grid grid-cols-2 gap-3.5">
        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => setActiveCard("overview")}
          className="cursor-pointer bg-white border border-slate-100 shadow-sm rounded-[20px] p-4 flex flex-col justify-between min-h-[110px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-orange-50 p-1.5 rounded-lg">
              <span className="text-sm">🏛️</span>
            </div>
            <h3 className="text-[12px] font-bold text-slate-600">Overview</h3>
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">
              Phase {data.phase}
            </p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              Modular Arch
            </p>
          </div>
        </motion.div>

        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => setActiveCard("engine")}
          className="cursor-pointer bg-white border border-slate-100 shadow-sm rounded-[20px] p-4 flex flex-col justify-between min-h-[110px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-blue-50 p-1.5 rounded-lg">
              <span className="text-sm">⚙️</span>
            </div>
            <h3 className="text-[12px] font-bold text-slate-600">Engine</h3>
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{data.engine}</p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              Uptime: {data.uptime}
            </p>
          </div>
        </motion.div>

        <SystemLogManager />

        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => setActiveCard("brain")}
          className="cursor-pointer bg-white border border-slate-100 shadow-sm rounded-[20px] p-4 flex flex-col justify-between min-h-[110px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-rose-50 p-1.5 rounded-lg">
              <span className="text-sm">🧠</span>
            </div>
            <h3 className="text-[12px] font-bold text-slate-600">Brain Sync</h3>
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{data.sync}</p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              Neural Sync
            </p>
          </div>
        </motion.div>

        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => setActiveCard("ai")}
          className="cursor-pointer bg-white border border-slate-100 shadow-sm rounded-[20px] p-4 flex flex-col justify-between min-h-[110px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-purple-50 p-1.5 rounded-lg">
              <span className="text-sm">🤖</span>
            </div>
            <h3 className="text-[12px] font-bold text-slate-600">AI Agents</h3>
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{data.ai}</p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              Latency: {data.latency}
            </p>
          </div>
        </motion.div>

        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => setActiveCard("runtime")}
          className="cursor-pointer bg-white border border-slate-100 shadow-sm rounded-[20px] p-4 flex flex-col justify-between min-h-[110px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-yellow-50 p-1.5 rounded-lg">
              <span className="text-sm">⚡</span>
            </div>
            <h3 className="text-[12px] font-bold text-slate-600">Runtime</h3>
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{data.runtime}</p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              {data.runtimeVer}
            </p>
          </div>
        </motion.div>

        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => setActiveCard("release")}
          className="cursor-pointer bg-white border border-slate-100 shadow-sm rounded-[20px] p-4 flex flex-col justify-between min-h-[110px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-indigo-50 p-1.5 rounded-lg">
              <span className="text-sm">🚀</span>
            </div>
            <h3 className="text-[12px] font-bold text-slate-600">Release</h3>
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{data.release}</p>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
              {data.releaseType}
            </p>
          </div>
        </motion.div>

        <motion.div
          whileTap={{ scale: 0.96 }}
          onClick={() => setActiveCard("core")}
          className="cursor-pointer bg-gradient-to-br from-orange-50/50 to-green-50/30 border border-slate-100 shadow-sm rounded-[20px] p-4 flex flex-col justify-between min-h-[110px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-amber-100/50 p-1.5 rounded-lg">
              <span className="text-sm">📦</span>
            </div>
            <h3 className="text-[12px] font-bold text-slate-700">Modules</h3>
          </div>
          <div>
            <p className="text-xl font-black text-slate-800">{data.core}</p>
            <p className="text-[11px] font-semibold text-green-600/80 mt-0.5">
              {data.coreStatus}
            </p>
          </div>
        </motion.div>
      </div>

      <div className="px-5 mt-4 w-full">
        <TermuxObservatory />
      </div>

      <AnimatePresence>
        {activeCard && (
          <AnimatedMonitorFrame
            className="fixed inset-0 bg-white z-50 flex flex-col"
            contentClassName="flex-1 p-5 overflow-y-auto bg-slate-50"
            onClose={() => {
              setActiveCard(null);
              setActiveSubCard(null);
            }}
            titleClassName="text-[16px] font-bold text-slate-800 capitalize flex items-center gap-2"
            title={
              <>
                <span className="text-xl">📊</span>{" "}
                {activeCard.replace("_", " ")} Monitor
              </>
            }
          >
            {renderPremiumModalContent()}
          </AnimatedMonitorFrame>
        )}
      </AnimatePresence>
    </div>
  );
}
export default AdminDashboard;

export const generateRawTelemetry = (target: string | null, sysStats: any) => {
  if (!target) return "Awaiting module selection...";
  const timestamp = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
  });
  const header = `[RAW HARDWARE TELEMETRY] - ${timestamp} (IST)\nTarget Node: ${target}\nStatus: LIVE DATA STREAM\n------------------------------------------------\n`;

  switch (target) {
    case "System Phase":
    case "Overview":
    case "SYSTEM UPTIME":
      return (
        header +
        `> OS Platform: ${sysStats.platform} (${sysStats.release})\n> Server Hostname: ${sysStats.hostname}\n> OS Uptime: ${sysStats.uptime}\n> Node Process Uptime: ${sysStats.processUptime} Seconds\n> Status: ${sysStats.status}`
      );
    case "Architecture":
    case "CPU ARCH":
      return (
        header +
        `> Architecture: ${sysStats.arch}\n> CPU Model: ${sysStats.cpuModel}\n> Total Cores: ${sysStats.cpuCores} Logical Threads\n> Node.js Heap Allocated: ${sysStats.heapUsed} MB`
      );
    case "Microservices":
    case "RAM USAGE":
      return (
        header +
        `> Total RAM: ${sysStats.totalMem} GB\n> Used RAM: ${sysStats.usedMem} GB (${sysStats.ramUsedPercent}%)\n> Free RAM: ${sysStats.freeMem} GB\n> Memory Status: ${Number.parseFloat(sysStats.ramUsedPercent) > 85 ? "WARNING: HIGH LOAD" : "OPTIMAL"}`
      );
    case MASTER_NODE_NAME:
    case "OS PLATFORM":
    case "Health":
      return (
        header +
        `> Kernel / Release: ${sysStats.release}\n> System Type: ${sysStats.platform}\n> Process Arch: ${sysStats.arch}\n> Hardware Sync: COMPLETE`
      );
    case "API Gateway":
    case "SERVER STATUS":
    case "Engine":
      return (
        header +
        `> Backend API: ${sysStats.status}\n> Process Active Memory: ${sysStats.heapUsed} MB\n> Server OS Uptime: ${sysStats.uptime}`
      );
    case "Avg Load":
    case "CPU LOAD":
      return (
        header +
        `> CPU Load Average (1 min): ${sysStats.load}\n> CPU Load Average (5 min): ${sysStats.load5m}\n> CPU Load Average (15 min): ${sysStats.load15m}\n> Core Distribution: ${sysStats.cpuCores > 0 ? ((Number.parseFloat(sysStats.load) / sysStats.cpuCores) * 100).toFixed(1) : 0}% per core`
      );
    default:
      return (
        header +
        `> Requesting raw data for ${target}...\n> Metrics Snapshot: \n` +
        JSON.stringify(sysStats, null, 2)
      );
  }
};
