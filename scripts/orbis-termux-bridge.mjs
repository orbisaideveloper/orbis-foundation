import http from "node:http";

const HOST = "127.0.0.1";
const PORT = 8765;

const server = http.createServer((req, res) => {
  const allowedOrigins = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);

  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      runtime: "TermuxRuntime",
      version: "0.1.0",
      platform: "android-termux",
      execution: false,
      root: false,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false }));
});

server.listen(PORT, HOST, () => {
  console.log(`[ORBIS] REAL Termux bridge listening on http://${HOST}:${PORT}/health`);
});
