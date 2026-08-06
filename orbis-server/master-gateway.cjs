const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

// Render-এর মেইন পোর্ট
const PORT = process.env.PORT || 10000; 
const BRIDGE_PORT = 3002; // Bridge-এর জন্য ইন্টারনাল পোর্ট
const SERVER_PORT = 3001; // Server-এর জন্য ইন্টারনাল পোর্ট

console.log("🚀 Initializing ORBIS Master Gateway...");

// ১. Bridge.cjs রান করানো (Background Process)
const bridgeProcess = spawn('node', [path.join(__dirname, 'bridge.cjs')], { 
    env: { ...process.env, PORT: BRIDGE_PORT }, 
    stdio: 'inherit' 
});

// ২. Server.cjs রান করানো (Background Process)
const serverProcess = spawn('node', [path.join(__dirname, 'server.cjs')], { 
    env: { ...process.env, PORT: SERVER_PORT }, 
    stdio: 'inherit' 
});

// ৩. Master "Door" (Gateway) তৈরি করা
const gateway = http.createServer((req, res) => {
    // ডায়াগনস্টিক বা মেট্রিক্স রিকোয়েস্ট হলে server.cjs-এ যাবে, নাহলে bridge.cjs-এ
    const isTelemetry = req.url.startsWith('/api/diagnostics') || req.url.startsWith('/api/metrics');
    const targetPort = isTelemetry ? SERVER_PORT : BRIDGE_PORT;

    const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: req.headers
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    req.pipe(proxyReq, { end: true });

    proxyReq.on('error', (err) => {
        res.writeHead(502);
        res.end('ORBIS Gateway Error: ' + err.message);
    });
});

// WebSocket সাপোর্ট (যাতে Bridge-এর কোনো রিয়েল-টাইম কাজ ব্রেক না করে)
gateway.on('upgrade', (req, socket, head) => {
    const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: BRIDGE_PORT,
        path: req.url,
        method: req.method,
        headers: req.headers
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
