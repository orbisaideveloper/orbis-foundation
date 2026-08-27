import React, { useState, useEffect } from "react";
import { readAdminJson } from "../../auth/adminFetch";

interface TimeMachineHistoryStateProps {
  loading: boolean;
  loadError: string | null;
  hasHistory: boolean;
  children: React.ReactNode;
}

function TimeMachineHistoryState({
  loading,
  loadError,
  hasHistory,
  children,
}: Readonly<TimeMachineHistoryStateProps>) {
  if (loading) {
    return (
      <div className="text-center py-8 text-slate-400 animate-pulse flex-1 text-sm">
        Loading grouped commit logs...
      </div>
    );
  }
  if (loadError) {
    return (
      <div
        role="alert"
        className="text-center py-8 text-amber-300 flex-1 text-sm"
      >
        {loadError}
      </div>
    );
  }
  if (!hasHistory) {
    return (
      <div className="text-center py-8 text-slate-500 flex-1 text-sm">
        No logs found.
      </div>
    );
  }
  return children;
}

export default function TimeMachineCard() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCommit, setSelectedCommit] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [codeContent, setCodeContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const copyResetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let active = true;
    readAdminJson<{ success: boolean; history: any[] }>(
      "/api/system/time-machine/history",
    )
      .then((data) => {
        if (active && data.success && Array.isArray(data.history)) {
          setHistory(data.history);
        }
        if (active) setLoading(false);
      })
      .catch((error: Error) => {
        if (!active) return;
        setLoadError(
          error.name === "AdminFetchError"
            ? error.message
            : "Time Machine is currently unavailable.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // 🚀 হারানো লজিক ঠিক করা হলো: কমিট এবং নির্দিষ্ট ফাইল দুটোই ট্র্যাকিং
  const handleSelectFile = (commit: any, filePath: string) => {
    setSelectedCommit(commit);
    setSelectedFile(filePath);
    setLoading(true);
    setLoadError(null);
    readAdminJson<{ success: boolean; data: { content?: string } }>(
      `/api/system/time-machine/version?commitId=${commit.commitId}&filePath=${encodeURIComponent(filePath)}`,
    )
      .then((data) => {
        if (data.success && data.data?.content) {
          setCodeContent(data.data.content);
        } else {
          setCodeContent("// Version content not found");
        }
        setLoading(false);
      })
      .catch(() => {
        setCodeContent("// Failed to fetch version content");
        setLoading(false);
      });
  };

  // 🚀 স্মার্ট কপি লজিক (Markdown ট্যাগসহ)
  const handleCopy = () => {
    const lines = codeContent.split("\n");
    const isFailed = selectedCommit?.status === "FAILED";

    const markdownText = lines
      .map((line) => {
        if (
          isFailed &&
          (line.includes("Error") ||
            line.toLowerCase().includes("fail") ||
            line.includes("404"))
        ) {
          return `**[🚨 CRASH/ERROR]** *${line.trim()}*`;
        }
        if (line.trim().startsWith("+") || line.includes("NEWLY EDITED")) {
          return `**[🟢 NEW_ADDITION]** ${line.trim()}`;
        }
        if (line.trim().startsWith("-")) {
          return `~~[🔴 REMOVED] ${line.trim()}~~`;
        }
        return line;
      })
      .join("\n");

    const finalCopyText = `### 🕒 Time Machine Context: ${isFailed ? "❌ FAILED BUILD" : "✅ STABLE BUILD"} (Commit: ${selectedCommit?.commitId?.slice(0, 8) || "N/A"})\n\n\`\`\`javascript\n${markdownText}\n\`\`\``;

    navigator.clipboard.writeText(finalCopyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };

  const filteredHistory = history.filter(
    (commit) =>
      (commit.commitId || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (commit.files || []).some((f: any) =>
        (f.filePath || "").toLowerCase().includes(searchTerm.toLowerCase()),
      ),
  );

  const renderStatusBadge = (status: string) => {
    if (status === "FAILED") {
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

  // 🚀 ভিজ্যুয়াল ডিফারেন্স লজিক (রঙিন, মোটা ও ট্যারা টেক্সট)
  const renderDiffContent = (code: string) => {
    if (!code) return null;
    const lines = code.split("\n");
    const isFailed = selectedCommit?.status === "FAILED";

    return lines.map((line, idx) => {
      let lineStyle = "text-slate-200";
      let bgStyle = "hover:bg-slate-800/40";
      let icon = "";

      if (
        isFailed &&
        (line.includes("Error") ||
          line.toLowerCase().includes("fail") ||
          line.includes("404"))
      ) {
        lineStyle = "text-red-400 font-bold italic";
        bgStyle = "bg-red-950/60 border-l-4 border-red-500 pl-2";
        icon = "🚨 ";
      } else if (
        line.trim().startsWith("+") ||
        line.includes("NEWLY EDITED") ||
        line.includes("Fix:") ||
        line.includes("ALTER TABLE")
      ) {
        lineStyle = "text-emerald-400 font-bold italic";
        bgStyle = "bg-emerald-950/40 border-l-2 border-emerald-500 pl-1";
        icon = "✨ ";
      } else if (line.trim().startsWith("-") || line.includes("DELETE FROM")) {
        lineStyle = "text-rose-300 line-through opacity-70 font-semibold";
        bgStyle = "bg-rose-950/40 border-l-2 border-rose-500 pl-1";
        icon = "🗑️ ";
      }

      return (
        <div
          key={`line-${idx + 1}`}
          className={`py-0.5 px-2 font-mono text-[13.5px] leading-relaxed transition-colors ${lineStyle} ${bgStyle}`}
        >
          <span className="inline-block w-8 text-slate-600 select-none text-[11px] mr-2 text-right">
            {idx + 1}
          </span>
          <span>
            {icon}
            {line}
          </span>
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
                Commit-grouped snapshot and Smart AI Tracker.
              </p>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search by commit ID or file path..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-yellow-500 focus:border-yellow-500 block w-full pl-9 p-2.5 outline-none"
              />
            </div>
          </div>

          <TimeMachineHistoryState
            loading={loading}
            loadError={loadError}
            hasHistory={filteredHistory.length > 0}
          >
            <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar flex-1 max-h-[60vh]">
              {filteredHistory.map((commit) => (
                <div
                  key={commit.commitId || `commit-${commit.createdAt}`}
                  className="bg-slate-900/90 border border-slate-800 p-3 rounded-lg flex flex-col gap-2.5 shadow-md"
                >
                  <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-mono font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-500/20">
                        Commit:{" "}
                        {commit.commitId ? commit.commitId.slice(0, 8) : "N/A"}
                      </span>
                      {renderStatusBadge(commit.status)}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {commit.createdAt
                        ? new Date(commit.createdAt).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : ""}
                    </span>
                  </div>

                  {commit.status === "FAILED" && commit.errorMessage && (
                    <div className="text-[11px] font-mono bg-red-950/60 border border-red-800/60 text-red-300 p-2.5 rounded-lg whitespace-pre-wrap select-all">
                      ⚠️{" "}
                      <strong className="text-red-200">Failure Reason:</strong>{" "}
                      {commit.errorMessage}
                    </div>
                  )}

                  {/* 🚀 এখানে গ্রুপিং লজিক ফিরিয়ে আনা হয়েছে */}
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    <span className="text-[11px] text-slate-400 font-semibold">
                      Files Changed ({commit.files?.length || 0}):
                    </span>
                    <div className="space-y-1.5">
                      {commit.files?.map((file: any) => (
                        <button
                          type="button"
                          key={`${commit.commitId}-${file.filePath}`}
                          onClick={() =>
                            handleSelectFile(commit, file.filePath)
                          }
                          onKeyDown={(e) =>
                            handleKeyDown(e, () =>
                              handleSelectFile(commit, file.filePath),
                            )
                          }
                          className="flex w-full cursor-pointer justify-between items-center bg-slate-950 hover:border-yellow-500/50 border border-slate-800/80 p-2 rounded-md text-left transition group"
                        >
                          <span className="text-[12px] font-mono text-slate-300 truncate max-w-[210px] group-hover:text-yellow-400">
                            📂 {file.filePath}
                          </span>
                          <span className="text-[11px] bg-slate-800 hover:bg-yellow-500 hover:text-black text-slate-200 px-2.5 py-1 rounded transition font-medium">
                            View Code
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TimeMachineHistoryState>
        </div>
      ) : (
        <div className="flex flex-col h-full relative">
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
              className={`text-xs ${copied ? "bg-emerald-500 text-white" : "bg-yellow-500 text-black"} hover:opacity-90 font-bold px-3 py-1.5 rounded-lg transition shrink-0 shadow-md active:scale-95`}
            >
              {copied ? "✅ Smart Copied!" : "📋 Copy Code"}
            </button>
          </div>

          <div className="bg-[#0b1120] border border-slate-800 rounded-lg py-3 overflow-auto flex-1 max-h-[66vh] select-text custom-scrollbar">
            {loading ? (
              <div className="text-center py-8 text-slate-400 animate-pulse text-sm">
                Fetching version diff content...
              </div>
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
