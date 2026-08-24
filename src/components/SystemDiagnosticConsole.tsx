/* eslint-disable sonarjs/no-duplicate-string */
import React, { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { readAdminJson } from "../admin/auth/adminFetch";
import { AnimatedMonitorFrame } from "../admin/dashboard/components/AnimatedMonitorFrame";

export default function SystemDiagnosticConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // Listen for custom event from AdminDashboard
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("open-telemetry-modal", handleOpen);
    return () => window.removeEventListener("open-telemetry-modal", handleOpen);
  }, []);

  const fetchTelemetry = async () => {
    try {
      const data = await readAdminJson<any>("/api/diagnostics");
      setTelemetry(data);
      setLoading(false);
      setErrorMsg(null);
    } catch {
      console.error("Diagnostics fetch failed");
      setLoading(false);
      setErrorMsg("Admin diagnostics are currently unavailable.");
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isOpen) {
      setLoading(true);
      fetchTelemetry();
      interval = setInterval(fetchTelemetry, 3000); // Real-time fetch every 3s
    }
    return () => clearInterval(interval);
  }, [isOpen]);

  // Format raw data for copying - Switched to 'switch-case' to lower Cognitive Complexity
  const getRawData = (moduleName: string) => {
    if (!telemetry) return "No data available";
    const time =
      new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
      " (IST)";
    const header = `[RAW TELEMETRY] - ${time}\nTarget Module: ${moduleName}\nStatus: LIVE DATA STREAM\n--------------------------------\n`;

    switch (moduleName) {
      case "Master Console":
        return (
          header +
          (telemetry.logs
            ?.map(
              (l: any) =>
                `> [${l.timestamp}] [${l.source}] [${l.level}] ${l.message}`,
            )
            .join("\n") || "> No logs available.")
        );
      case "Bridge Status":
        return (
          header +
          `> Bridge Node: ${telemetry.bridge?.bridgeStatus}\n> Server API: ${telemetry.bridge?.serverStatus}\n> Uptime: ${telemetry.bridge?.uptime}\n> Platform: ${telemetry.bridge?.platform}`
        );
      case "Git Activity":
        return header + `> Latest Commit: ${telemetry.gitStatus}`;
      case "Hardware Metrics":
        return (
          header +
          `> Server Load: ${telemetry.hardware?.cpu}\n> RAM Usage: ${telemetry.hardware?.ram}\n> Architecture: ${telemetry.hardware?.arch}`
        );
      case "AI Providers":
        return (
          header +
          (telemetry.providers
            ?.map((p: any) => `> ${p.name} - ${p.status} (${p.type})`)
            .join("\n") || "> No providers found.")
        );
      default:
        return header + JSON.stringify(telemetry, null, 2);
    }
  };

  // FIXED: Extracted nested ternaries into sequential returns to drop complexity heavily
  const renderContentArea = () => {
    if (loading) {
      return (
        <div className="text-slate-500 font-bold text-center py-20 animate-pulse">
          Connecting to Core Modules...
        </div>
      );
    }

    if (errorMsg) {
      return (
        <div className="bg-red-50 border border-red-200 text-red-600 p-6 rounded-xl text-center shadow-sm">
          <h3 className="font-bold text-lg mb-2">⚠️ Connection Failed</h3>
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      );
    }

    if (activeCard === null) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => setActiveCard("Bridge Status")}
            className="text-left bg-white border border-blue-100 shadow-sm rounded-xl p-4 cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">
              Bridge Node
            </h4>
            <p className="text-lg font-black text-slate-800 mt-0.5">Online</p>
            <p className="text-[10px] text-slate-400 mt-1">
              {telemetry?.bridge?.uptime}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveCard("Git Activity")}
            className="text-left bg-white border border-orange-100 shadow-sm rounded-xl p-4 cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <h4 className="text-[10px] font-bold text-orange-600 uppercase tracking-wide">
              Last Commit
            </h4>
            <p className="text-sm font-black text-slate-800 mt-1 line-clamp-1">
              {telemetry?.gitStatus}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveCard("Hardware Metrics")}
            className="text-left bg-white border border-green-100 shadow-sm rounded-xl p-4 cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <h4 className="text-[10px] font-bold text-green-600 uppercase tracking-wide">
              Server Load
            </h4>
            <p className="text-lg font-black text-slate-800 mt-0.5">
              {telemetry?.hardware?.cpu}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              RAM: {telemetry?.hardware?.ram}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setActiveCard("AI Providers")}
            className="text-left bg-white border border-purple-100 shadow-sm rounded-xl p-4 cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.02] transition-all duration-200 active:scale-95"
          >
            <h4 className="text-[10px] font-bold text-purple-600 uppercase tracking-wide">
              Local Models
            </h4>
            <p className="text-lg font-black text-slate-800 mt-0.5">Active</p>
          </button>

          <button
            type="button"
            onClick={() => setActiveCard("Master Console")}
            className="text-left bg-white border border-slate-200 shadow-sm rounded-xl p-4 cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.02] transition-all duration-200 active:scale-95 md:col-span-2"
          >
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              Runtime Console{" "}
              <span className="bg-red-100 text-red-600 px-1.5 rounded animate-pulse">
                LIVE
              </span>
            </h4>
            <div className="mt-2 h-16 overflow-hidden text-[10px] font-mono text-slate-600 border-l-2 border-slate-300 pl-2">
              {/* FIXED: Using highly unique composite key instead of map index */}
              {telemetry?.logs?.slice(0, 3).map((l: any) => (
                <div key={l.id || l.timestamp + l.message}>{l.message}</div>
              ))}
            </div>
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-3">
          <button
            type="button"
            onClick={() => setActiveCard(null)}
            className="text-[13px] text-slate-600 font-bold hover:text-slate-900 flex items-center gap-1.5 bg-slate-200/60 px-3 py-1.5 rounded-lg transition-colors active:scale-95"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(getRawData(activeCard));
              setCopiedText(true);
              setTimeout(() => setCopiedText(false), 2000);
            }}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all active:scale-95 shadow-sm ${copiedText ? "bg-emerald-100 text-emerald-700" : "bg-slate-800 hover:bg-slate-700 text-white"}`}
          >
            {copiedText ? "✓ Copied" : "⧉ Copy Data"}
          </button>
        </div>
        <div className="bg-slate-900 rounded-lg p-4 flex-1 overflow-auto select-text cursor-text shadow-inner">
          <pre className="font-mono text-[12px] text-emerald-400 whitespace-pre-wrap leading-relaxed select-text">
            {activeCard === "Master Console"
              ? telemetry?.logs
                  ?.map((l: any) => `> [${l.timestamp}] ${l.message}\n`)
                  .join("")
              : getRawData(activeCard)}
          </pre>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center font-sans">
          <AnimatedMonitorFrame
            className="w-full max-w-4xl h-[85vh] bg-slate-50 shadow-2xl rounded-2xl flex flex-col overflow-hidden border border-slate-200"
            contentClassName="flex-1 p-5 overflow-y-auto"
            headerClassName="bg-white"
            onClose={() => {
              setIsOpen(false);
              setActiveCard(null);
            }}
            title={
              <>
                <span className="text-xl">📊</span>{" "}
                {activeCard ? `${activeCard} Log` : "Overview Monitor"}
              </>
            }
          >
            {renderContentArea()}
          </AnimatedMonitorFrame>
        </div>
      )}
    </AnimatePresence>
  );
}
