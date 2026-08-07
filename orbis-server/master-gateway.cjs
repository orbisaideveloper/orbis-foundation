const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 10000; 
const BRIDGE_PORT = 3002;
const SERVER_PORT = 3001;

console.log("🚀 Initializing ORBIS Master Gateway...");

// Server-এ লগ ফরওয়ার্ড করার ফাংশন
function forwardLogToServer(level, data) {
    const msg = data.toString().trim();
    if (!msg) return;
    const req = http.request({
        hostname: '127.0.0.1', port: SERVER_PORT, path: '/api/internal/log',
        method: 'POST', headers: { 'Content-Type': 'application/json' }
    });
    req.on('error', () => {}); // Server রেডি না থাকলে ক্র্যাশ করবে না
    req.write(JSON.stringify({ level, source: 'BRIDGE', message: msg }));
    req.end();
}

// ১. Bridge.cjs রান করানো (Output Capture মোডে)
const bridgeProcess = spawn('node', [path.join(__dirname, 'bridge.cjs')], { 
    env: { ...process.env, PORT: BRIDGE_PORT }, 
    stdio: ['inherit', 'pipe', 'pipe'] // <-- ম্যাজিকটা এখানে! 
});

// Bridge-এর আউটপুট ধরে Server-এ পাঠানো
bridgeProcess.stdout.on('data', (data) => {
    process.stdout.write(data);
    forwardLogToServer('INFO', data);
});
bridgeProcess.stderr.on('data', (data) => {
    process.stderr.write(data);
    forwardLogToServer('ERROR', data);
});

// ২. Server.cjs রান করানো
const serverProcess = spawn('node', [path.join(__dirname, 'server.cjs')], { 
    env: { ...process.env, PORT: SERVER_PORT }, 
    stdio: 'inherit' 
});

// ৩. Master "Door" (Gateway) 
const gateway = http.createServer((req, res) => {
    const isTelemetry = req.url.startsWith('/api/diagnostics') || req.url.startsWith('/api/metrics');
    const targetPort = isTelemetry ? SERVER_PORT : BRIDGE_PORT;

    const proxyReq = http.request({
        hostname: '127.0.0.1', port: targetPort, path: req.url, method: req.method, headers: req.headers
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    if (req.method === "GET" || req.method === "HEAD") { proxyReq.end(); } else { req.pipe(proxyReq, { end: true }); }
    proxyReq.on('error', (err) => {
        res.writeHead(502);
        res.end('ORBIS Gateway Error: ' + err.message);
    });
});

gateway.on('upgrade', (req, socket, head) => {
    const proxyReq = http.request({
        hostname: '127.0.0.1', port: BRIDGE_PORT, path: req.url, method: req.method, headers: req.headers
    });
    proxyReq.on('upgrade', (proxyRes, proxySocket) => {
        socket.write(`HTTP/${proxyRes.httpVersion} 101 Switching Protocols\r\n`);
        for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
            socket.write(`${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`);
        }
        socket.write('\r\n');
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
    });
    req.pipe(proxyReq);
    proxyReq.on('error', () => socket.end());
});

gateway.listen(PORT, () => {
    console.log(`\n===========================================`);
    console.log(`🚪 ORBIS MASTER GATEWAY LIVE ON PORT ${PORT}`);
    console.log(`===========================================\n`);
});

app.use('/api/system', require('./source-api.cjs'));
