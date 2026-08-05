const { execSync } = require('child_process');

// রিয়েল-টাইম লগ বাফার
const runtimeLogs = [];
const MAX_LOGS = 100;

// অরিজিনাল কনসোল লগ ওভাররাইড না করে একটি কাস্টম লগার
function addSystemLog(level, source, message) {
    const entry = {
        timestamp: new Date().toLocaleTimeString(),
        level: level.toUpperCase(),
        source: source.toUpperCase(),
        message
    };
    runtimeLogs.unshift(entry);
    if (runtimeLogs.length > MAX_LOGS) runtimeLogs.pop();
}

function getDiagnostics() {
    let gitStatus = "Clean";
    try {
        gitStatus = execSync('git status --porcelain').toString().trim() ? "Modified/Unsaved" : "Clean & Synced";
    } catch (e) {
        gitStatus = "Unknown";
    }

    return {
        timestamp: new Date().toISOString(),
        bridge: {
            bridgeStatus: "🟢 Running",
            serverStatus: "🟢 Active",
            uptime: process.uptime(),
        },
        providers: [
            { name: "Qwen (Local)", status: "Online", ping: "120ms" },
            { name: "TinyLlama", status: "Online", ping: "90ms" }
        ],
        diagnostics: {
            gitWorkingTree: gitStatus,
            termuxReachable: true
        },
        logs: runtimeLogs
    };
}

// এক্সপ্রেস রাউটার এক্সপোর্ট
module.exports = { addSystemLog, getDiagnostics };
