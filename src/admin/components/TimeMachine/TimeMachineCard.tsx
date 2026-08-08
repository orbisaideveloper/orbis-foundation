import React, { useState, useEffect } from "react";

export default function TimeMachineCard() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [codeContent, setCodeContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetch("/api/system/time-machine/history")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.history)) {
          setHistory(data.history);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Time Machine Fetch Error:", err);
        setLoading(false);
      });
  }, []);

  const handleSelectVersion = (item: any) => {
    setSelectedVersion(item);
    setLoading(true);
    fetch(
      `/api/system/time-machine/version?commitId=${item.commitId}&filePath=${encodeURIComponent(item.filePath)}`,
    )
      .then((res) => res.json())
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

  // 🚀 স্মার্ট কপি লজিক: কপি করলে AI-এর বোঝার জন্য ট্যাগ ও মার্কডাউন যোগ হয়ে যাবে!
  const handleCopy = () => {
    const lines = codeContent.split("\n");
    const isFailed = selectedVersion?.status === "FAILED";

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

    const finalCopyText = `### 🕒 Time Machine Context: ${isFailed ? "❌ FAILED BUILD" : "✅ STABLE BUILD"} (Commit: ${selectedVersion?.commitId?.slice(0, 8) || "N/A"})\n\n\`\`\`javascript\n${markdownText}\n\`\`\``;

    navigator.clipboard.writeText(finalCopyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredHistory = history.filter(
    (item) =>
      (item?.filePath || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item?.commitId || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // 🚀 ভিজ্যুয়াল রেন্ডার লজিক: UI-তে মোটা (Bold) এবং ট্যারা (Italic) স্টাইল
  const renderDiffContent = (code: string, status: string) => {
    const lines = code.split("\n");
    const isFailed = status === "FAILED";

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
        lineStyle = "text-red-400 font-bold italic"; // লাল, মোটা ও ট্যারা
        bgStyle = "bg-red-950/60 border-l-4 border-red-500 pl-2";
        icon = "🚨 ";
      } else if (
        line.trim().startsWith("+") ||
        line.includes("NEWLY EDITED") ||
        line.includes("Fix:")
      ) {
        lineStyle = "text-emerald-400 font-bold italic"; // সবুজ, মোটা ও ট্যারা
        bgStyle = "bg-emerald-950/40 border-l-2 border-emerald-500 pl-1";
        icon = "✨ ";
      } else if (line.trim().startsWith("-")) {
        lineStyle = "text-rose-300 line-through opacity-70";
        bgStyle = "bg-rose-950/40 border-l-2 border-rose-500 pl-1";
        icon = "🗑️ ";
      }

      return (
        <div
          key={idx}
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
      {!selectedVersion ? (
        <div className="flex flex-col h-full">
          <div className="mb-4 flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-bold text-yellow-400 flex items-center gap-2">
                ⏳ Source Time Machine
              </h2>
              <p className="text-[12px] text-slate-400 mt-1">
                Smart AI Code Tracker & Status Snapshot.
              </p>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search by file path or commit..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-yellow-500 focus:border-yellow-500 block w-full pl-9 p-2.5 outline-none"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-slate-400 animate-pulse flex-1 text-sm">
              Loading time machine logs...
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-8 text-slate-500 flex-1 text-sm">
              No logs found yet.
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto pr-1 custom-scrollbar flex-1 max-h-[60vh]">
              {filteredHistory.map((item, index) => (
                <div
                  key={index}
                  onClick={() => handleSelectVersion(item)}
                  className="bg-slate-900/90 border border-slate-800 hover:border-yellow-500/50 p-3 rounded-lg flex justify-between items-center cursor-pointer transition group"
                >
                  <div className="overflow-hidden pr-2">
                    <div className="text-[12px] font-mono text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-500/20 truncate max-w-[200px]">
                      📂 {item.filePath}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[11px] font-mono text-slate-400">
                        Commit:{" "}
                        {item.commitId ? item.commitId.slice(0, 8) : "N/A"}
                      </span>
                      {item.status === "FAILED" ? (
                        <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/40 px-1.5 py-0.5 rounded font-bold">
                          ❌ FAILED
                        </span>
                      ) : (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1.5 py-0.5 rounded font-bold">
                          ✅ PASSED
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right min-w-[90px]">
                    <span className="text-[10px] text-slate-400 block mb-1">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : ""}
                    </span>
                    <span className="text-[11px] bg-slate-800 text-slate-200 px-2.5 py-1 rounded group-hover:bg-yellow-500 group-hover:text-black transition-colors block text-center font-medium">
                      View Code
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col h-full relative">
          <div className="sticky top-0 z-30 backdrop-blur-md bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-lg mb-2 flex flex-row items-center justify-between gap-2 shadow-lg">
            <button
              onClick={() => setSelectedVersion(null)}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg transition font-medium shrink-0"
            >
              ← Back
            </button>
            <span className="text-[12px] font-mono text-yellow-400 truncate max-w-[160px] sm:max-w-[300px] text-center">
              📂 {selectedVersion.filePath}
            </span>
            <button
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
                {renderDiffContent(codeContent, selectedVersion.status)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
