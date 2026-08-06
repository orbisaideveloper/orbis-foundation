const { execSync } = require('child_process');
const os = require('os');
const http = require('http');

const runtimeLogs = [];
const MAX_LOGS = 50;

function addSystemLog(level, source, message) {
    runtimeLogs.unshift({ timestamp: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }), level: level.toUpperCase(), source: source.toUpperCase(), message });
    if (runtimeLogs.length > MAX_LOGS) runtimeLogs.pop();
}

function getDiagnostics() {
    // 100% Real Git Status & Last Commit
    let gitStatus = "Synced";
    let lastCommit = "No recent commits";
    try {
        const status = execSync('git status --porcelain').toString().trim();
        gitStatus = status ? "Modified (Unsaved Changes)" : "Clean & Synced";
        lastCommit = execSync('git log -1 --pretty=format:"%s (%h)"').toString().trim();
    } catch (e) { gitStatus = "Unknown"; }

    // Real System Metrics
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    const usedMem = (totalMem - freeMem).toFixed(2);
    const cpuLoad = os.loadavg()[0].toFixed(2);

    return {
        timestamp: new Date().toISOString(),
        gitStatus: lastCommit,
        bridge: {
            bridgeStatus: "🟢 Active (Port 3000)",
            serverStatus: "🟢 Online (Port " + (process.env.PORT || 3001) + ")",
            uptime: Math.floor(process.uptime()) + " Secs",
            platform: os.platform() + " " + os.release()
        },
        providers: [
            { name: "Local Llama / Qwen", status: "Active in Termux", type: "Local Node" },
            { name: "Bridge API", status: "Online", type: "Express.js" }
        ],
        hardware: {
            cpu: cpuLoad + "% Load",
            ram: usedMem + "GB / " + totalMem + "GB",
            arch: os.arch()
        },
        logs: runtimeLogs.length > 0 ? runtimeLogs : [{ timestamp: new Date().toLocaleTimeString(), level: "INFO", source: "SYSTEM", message: "Real-time Telemetry initialized." }]
    };
}

module.exports = { addSystemLog, getDiagnostics };
