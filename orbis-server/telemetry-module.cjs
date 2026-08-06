const os = require('os');
const { execSync } = require('child_process');

// 🟢 রিয়েল-টাইম লগ রাখার লাইভ অ্যারে
const systemLogs = [];

function addSystemLog(level, source, message) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, timeZone: 'Asia/Kolkata' });
    // নতুন লগ অ্যারের শুরুতে যোগ হবে (Latest First)
    systemLogs.unshift({ timestamp, level, source, message: String(message) });
    
    // ২০ টার বেশি লগ জমলে শেষেরটা মুছে ফেলবে (যাতে র‍্যাম বেশি না খায়)
    if (systemLogs.length > 20) {
        systemLogs.pop();
    }
}

// 🔴 আসল ম্যাজিক: Node.js-এর ডিফল্ট console.log হ্যাক (Override) করা!
const originalLog = console.log;
const originalError = console.error;

console.log = function (...args) {
    addSystemLog('INFO', 'SERVER', args.join(' '));
    originalLog.apply(console, args); // টার্মিনালেও প্রিন্ট করবে
};

console.error = function (...args) {
    addSystemLog('ERROR', 'SERVER', args.join(' '));
    originalError.apply(console, args);
};

// প্রথম স্টার্টআপ লগ
console.log("Telemetry System Hooked and Listening for live events...");

// টেস্ট করার জন্য প্রতি ১০ সেকেন্ডে একটি লাইভ 'হার্টবিট' লগ জেনারেট করবে
setInterval(() => {
    const load = os.loadavg()[0].toFixed(2);
    const freeRam = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    console.log(`[System Heartbeat] CPU Load: ${load} | Free RAM: ${freeRam} GB`);
}, 10000);

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
        logs: systemLogs // 🟢 ডামি ডাটার বদলে এখন আসল লাইভ লগ যাবে!
    };
}

module.exports = { getDiagnostics, addSystemLog };
