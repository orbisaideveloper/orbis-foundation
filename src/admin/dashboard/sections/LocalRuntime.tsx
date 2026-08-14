import React, { useState } from "react";
import {
  Terminal,
  Shield,
  Cpu,
  Copy,
  X,
  ArrowRight,
  Activity,
} from "lucide-react";

export const LocalRuntime: React.FC = () => {
  const [showModal, setShowModal] = useState(false);

  const handleCopyDetails = async () => {
    const report = `ORBIS LOCAL RUNTIME STATUS

Execution Core: READY
Policy Engine: ACTIVE
Runtime Registry: ACTIVE
Lifecycle Manager: ACTIVE
Authorization Gate: ACTIVE

Local Runtime: NOT CONNECTED
Linux Runtime: NOT IMPLEMENTED
Python Runtime: NOT IMPLEMENTED
Android Bridge: NOT IMPLEMENTED
Root Access: DISABLED

Security:
PRIVILEGED = DENIED
SENSITIVE = REQUIRE_APPROVAL
UNKNOWN = DENIED

Architecture:
Brain -> Policy -> Registry -> Lifecycle -> Authorization -> Runtime`;

    try {
      await navigator.clipboard.writeText(report);
      alert("Copied to clipboard successfully!");
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <>
      {/* 🚀 Main Glass Card */}
      <div className="flex flex-col h-full rounded-[24px] border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] p-6 transition-all hover:bg-white/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30">
            <Terminal className="h-5 w-5 text-indigo-400" />
          </div>
          <h2 className="text-lg font-bold tracking-wide text-white">
            LOCAL RUNTIME
          </h2>
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-sm text-gray-400 font-medium">
              Execution Core
            </span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              READY
            </span>
          </div>
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-sm text-gray-400 font-medium">
              Security Gate
            </span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              ACTIVE
            </span>
          </div>
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-sm text-gray-400 font-medium">Runtime</span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
              NOT CONNECTED
            </span>
          </div>
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-sm text-gray-400 font-medium">Linux</span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/20">
              NOT IMPLEMENTED
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400 font-medium">Android</span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/20">
              NOT IMPLEMENTED
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="mt-6 flex items-center justify-center gap-2 w-full rounded-xl bg-white/5 py-3 text-sm font-semibold text-white transition-all hover:bg-white/10 border border-white/10"
        >
          VIEW DETAILS <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* 🚀 Detail View Modal (Glassmorphism Overlay) */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[24px] border border-white/10 bg-[#0f172a]/90 shadow-2xl p-6 md:p-8">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-6 right-6 p-2 rounded-full bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-400" />
              LOCAL RUNTIME DETAILS
            </h2>

            <div className="space-y-6">
              {/* SECTION 1: EXECUTION CORE */}
              <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
                  Execution Core
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    "Contract",
                    "Policy Engine",
                    "Runtime Registry",
                    "Lifecycle Manager",
                    "Authorization Gate",
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center bg-black/20 p-3 rounded-lg"
                    >
                      <span className="text-sm text-gray-300">{item}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        {item === "Contract" ? "READY" : "ACTIVE"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SECTION 2: SECURITY */}
              <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald-400" /> Security
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2">
                    <span className="text-sm text-gray-300">SAFE</span>
                    <span className="text-xs text-emerald-400 font-mono">
                      AUTHORIZATION AVAILABLE
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2">
                    <span className="text-sm text-gray-300">SENSITIVE</span>
                    <span className="text-xs text-orange-400 font-mono">
                      REQUIRE APPROVAL
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2">
                    <span className="text-sm text-gray-300">PRIVILEGED</span>
                    <span className="text-xs text-red-400 font-mono">
                      DENIED
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2">
                    <span className="text-sm text-gray-300">UNKNOWN</span>
                    <span className="text-xs text-red-400 font-mono">
                      DENIED
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 3: RUNTIME */}
              <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-blue-400" /> Runtime Status
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex justify-between items-center p-2 bg-black/20 rounded">
                    <span className="text-sm text-gray-300">Local Runtime</span>
                    <span className="text-[10px] text-orange-400">
                      NOT CONNECTED
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-black/20 rounded">
                    <span className="text-sm text-gray-300">Linux</span>
                    <span className="text-[10px] text-gray-400">
                      NOT IMPLEMENTED
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-black/20 rounded">
                    <span className="text-sm text-gray-300">Python</span>
                    <span className="text-[10px] text-gray-400">
                      NOT IMPLEMENTED
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-black/20 rounded">
                    <span className="text-sm text-gray-300">Android</span>
                    <span className="text-[10px] text-gray-400">
                      NOT IMPLEMENTED
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-black/20 rounded col-span-2">
                    <span className="text-sm text-gray-300">Root Access</span>
                    <span className="text-[10px] text-red-400">DISABLED</span>
                  </div>
                </div>
              </div>

              {/* SECTION 4: ARCHITECTURE FLOW */}
              <div className="bg-white/5 rounded-2xl p-5 border border-white/5 text-center">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
                  Architecture Flow
                </h3>
                <div className="text-sm font-mono text-gray-400 flex flex-wrap justify-center items-center gap-2">
                  <span>Brain</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>Policy</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>Registry</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>Lifecycle</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>Authorization</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="text-white">Future Local Runtime</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/10 flex justify-end">
              <button
                onClick={handleCopyDetails}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors shadow-lg shadow-indigo-500/25"
              >
                <Copy className="h-4 w-4" /> COPY DETAILS
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
