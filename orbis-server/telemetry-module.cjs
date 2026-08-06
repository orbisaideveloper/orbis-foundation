const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

// 🟢 লগ লিমিট বাড়িয়ে ১০০ করা হলো
const systemLogs = [];
let dbClient = null;

function setDbClient(client) {
    dbClient = client;
}

function addSystemLog(level, source, message) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, timeZone: 'Asia/Kolkata' });
    systemLogs.unshift({ timestamp, level, source, message: String(message) });
    
    // ১০০ টার বেশি লগ জমলে শেষেরটা মুছবে
    if (systemLogs.length > 100) {
        systemLogs.pop();
    }

    if (dbClient) {
        dbClient.foundationSystemLog.create({
            data: { id: crypto.randomUUID(), level: String(level || 'INFO'), source: String(source || 'SYSTEM'), message: String(message || 'Empty Log'), timestamp: String(timestamp), createdAt: new Date() }
        }).catch((err) => { originalError.call(console, "[DB_SAVE_ERROR]", err.stack || err.message); });
    }
}

// 🔴 আসল ম্যাজিক: Node.js-এর ডিফল্ট console.log হ্যাক
const originalLog = console.log;
const originalError = console.error;

console.log = function (...args) {
    addSystemLog('INFO', 'SYSTEM', args.join(' '));
    originalLog.apply(console, args); 
};

console.error = function (...args) {
    addSystemLog('ERROR', 'SYSTEM', args.join(' '));
    originalError.apply(console, args);
};

// স্টার্টআপ মেসেজ
console.log("[INIT] Orbis Foundation Deep Telemetry Activated. Tracking core events...");

function getDiagnostics() {
    let gitStatus = "Unknown";
    try {
        gitStatus = execSync('git log -1 --pretty=format:"%s (%h)"').toString().trim();
    } catch(e) {}

    const totalRam = os.totalmem() / (1024 ** 3);
    const freeRam = os.freemem() / (1024 ** 3);
    const usedRam = totalRam - freeRam;
    
    const cpus = os.cpus();
    const load = cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        return acc + ((total - idle) / total);
    }, 0) / cpus.length;

    return {
        timestamp: new Date().toISOString(),
        gitStatus,
        bridge: {
            bridgeStatus: "🟢 Active (Port 3000)",
            serverStatus: "🟢 Online (Port 3001)",
            uptime: `${Math.floor(process.uptime())} Secs`,
            platform: `${os.platform()} ${os.release()}`
        },
        providers: [
            { name: "Local Llama / Qwen", status: "Active in Termux", type: "Local Node" },
            { name: "Bridge API", status: "Online", type: "Express.js" }
        ],
        hardware: {
            cpu: `${(load * 100).toFixed(2)}% Load`,
            ram: `${usedRam.toFixed(2)}GB / ${totalRam.toFixed(2)}GB`,
            arch: os.arch()
        },
        logs: systemLogs 
    };
}

module.exports = { setDbClient,  getDiagnostics, addSystemLog };
