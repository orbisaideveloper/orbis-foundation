/**
 * ⚠️ DEPRECATED — RETIRED (TASK-017)
 *
 * This file's entire purpose was reconciling two separately-launched
 * processes (bridge.cjs + server.cjs) behind one port. Now that
 * orbis-server/bridge.cjs is the ONE canonical backend process (owning
 * every route directly, telemetry included), there is nothing left to
 * reconcile. Nothing in package.json, render.yaml, or vite.config.ts
 * starts this file anymore. It is kept on disk for historical reference
 * only — do NOT reintroduce it as a startup path.
 */
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const PORT = process.env.PORT || 10000;
const BRIDGE_PORT = 3002;
const SERVER_PORT = 3001;

console.log("🚀 Initializing ORBIS Master Gateway...");

// ১. Bridge.cjs রান করানো
const bridgeProcess = spawn("node", [path.join(__dirname, "bridge.cjs")], {
  env: { ...process.env, PORT: BRIDGE_PORT },
  stdio: "inherit",
});
bridgeProcess.on("exit", (code) => {
  console.error(`\n⚠️ [CRITICAL] Bridge process died with code ${code}\n`);
});

// ২. Server.cjs রান করানো
const serverProcess = spawn("node", [path.join(__dirname, "server.cjs")], {
  env: { ...process.env, PORT: SERVER_PORT },
  stdio: "inherit",
});
serverProcess.on("exit", (code) => {
  console.error(`\n⚠️ [CRITICAL] Server process died with code ${code}\n`);
});

// ৩. Master Gateway
const gateway = http.createServer((req, res) => {
  const isTelemetry =
    req.url.startsWith("/api/diagnostics") ||
    req.url.startsWith("/api/metrics") ||
    req.url.startsWith("/api/system");
  const targetPort = isTelemetry ? SERVER_PORT : BRIDGE_PORT;

  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    },
  );

  if (req.method === "GET" || req.method === "HEAD") {
    proxyReq.end();
  } else {
    req.pipe(proxyReq, { end: true });
  }

  proxyReq.on("error", (err) => {
    res.writeHead(502);
    res.end("ORBIS Gateway Error (Target Service is Down): " + err.message);
  });
});

gateway.on("upgrade", (req, socket) => {
  const proxyReq = http.request({
    hostname: "127.0.0.1",
    port: BRIDGE_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  });
  proxyReq.on("upgrade", (proxyRes, proxySocket) => {
    socket.write(`HTTP/${proxyRes.httpVersion} 101 Switching Protocols\r\n`);
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      socket.write(
        `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`,
      );
    }
    socket.write("\r\n");
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  req.pipe(proxyReq);
  proxyReq.on("error", () => socket.end());
});

gateway.listen(PORT, () => {
  console.log(`\n===========================================`);
  console.log(`🚪 ORBIS MASTER GATEWAY LIVE ON PORT ${PORT}`);
  console.log(`===========================================\n`);
});
