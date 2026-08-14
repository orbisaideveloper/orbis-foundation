const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");

const aiChatService = require("./ai/AIChatService.cjs");
const providerManager = require("./ai/AIProviderManager.cjs");
const sourceApi = require("./source-api.cjs");

const PORT = process.env.PORT || 3000;

async function handleOllamaStream(prompt, res) {
  const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tinyllama:latest",
        prompt: prompt,
        stream: true,
      }),
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ result: `⚠️ AI Server Error: Status ${response.status}` });
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.response) {
            res.write(parsed.response);
          }
        } catch (e) {
          res.write(text);
        }
      }
    }
    res.end();
  } catch (err) {
    console.error("AI Error:", err);
    if (!res.headersSent) {
      return res.json({ result: "⚠️ AI Server Error: " + err.message });
    }
    res.write("\n⚠️ AI Connection Interrupted.");
    res.end();
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// ORBIS LEGACY DISPLAY RESTORE:
// Source Explorer + Time Machine remain real backend APIs.
app.use("/api/system", sourceApi);

function getDirectoryTree(dirPath, indent = "", changedFiles = []) {
  let result = "";
  if (!fs.existsSync(dirPath)) return "Directory not found";
  const items = fs.readdirSync(dirPath);
  items.forEach((item) => {
    if (item === "node_modules" || item.startsWith(".") || item === "dist")
      return;
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    const relPath = fullPath.replace(/\\/g, "/");
    const isChanged = changedFiles.some((f) => relPath.endsWith(f));
    const marker = isChanged ? " ✨ [NEWLY EDITED]" : "";

    if (stat.isDirectory()) {
      result += `${indent}📁 ${item}/${marker}\n`;
      result += getDirectoryTree(fullPath, indent + "  │  ", changedFiles);
    } else {
      result += `${indent}  📄 ${item}${marker}\n`;
    }
  });
  return result;
}

app.get("/api/system-stats", (req, res) => {
  const os = require("node:os");
  const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
  const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
  const usedMem = (totalMem - freeMem).toFixed(2);
  const loadAvg = os.loadavg();
  const uptimeSeconds = os.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  let cpuModel = "Unknown Processor";
  try {
    cpuModel = os.cpus()[0].model;
  } catch (e) {}

  res.json({
    cpuCores: os.cpus().length,
    cpuModel,
    arch: os.arch(),
    platform: os.platform().toUpperCase(),
    release: os.release(),
    hostname: os.hostname(),
    load: loadAvg[0].toFixed(2),
    load5m: loadAvg[1].toFixed(2),
    load15m: loadAvg[2].toFixed(2),
    totalMem,
    freeMem,
    usedMem,
    ramUsedPercent: ((usedMem / totalMem) * 100).toFixed(1),
    uptime: `${hours}h ${minutes}m`,
    processUptime: process.uptime().toFixed(0),
    heapUsed: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2),
    status: "ONLINE",
  });
});

// ============================================================
// NEW: Admin AI Providers Status API
// ============================================================
app.get("/api/ai/providers/status", (req, res) => {
  try {
    const active = providerManager.getActiveProvider();
    res.json({
      activeProvider: active.getMetadata(),
      allProviders: Array.from(providerManager.providers.values()).map((p) =>
        p.getMetadata(),
      ),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ORBIS CHAT API
// ============================================================
app.post("/api/chat", async (req, res) => {
  try {
    const rawMessages = req.body?.messages;
    const responsePayload = await aiChatService.processChatRequest(rawMessages);
    return res.json(responsePayload);
  } catch (error) {
    console.error("[CHAT_API] Request failed:", error.message);
    const status =
      error.message.includes("authentication") ||
      error.message.includes("unavailable")
        ? 502
        : 500;
    return res
      .status(status)
      .json({ error: error.message || "Chat backend request failed." });
  }
});

// TERMUX / ANDROID / OFFLINE INTELLIGENCE OBSERVATORY
app.get("/api/termux-observatory", (req, res) => {
  try {
    const auditDir = path.join(__dirname, "../docs/AUDIT_REPORTS");
    const files = fs.existsSync(auditDir)
      ? fs
          .readdirSync(auditDir)
          .filter((n) => /^\d+_.*\.md$/.test(n))
          .sort()
      : [];
    const tasks = files.map((file) => {
      const c = fs.readFileSync(path.join(auditDir, file), "utf8");
      const task =
        c.match(/Task ID\s*:\s*(TASK-\d+)/i)?.[1] ||
        c.match(/\*\*Task ID:\*\*\s*(TASK-\d+)/i)?.[1] ||
        "UNKNOWN";
      const status =
        c.match(/(?:Final )?Status\s*:\s*([^\n]+)/i)?.[1]?.trim() || "UNKNOWN";
      const commit =
        c.match(/Implementation Commit\s*:\s*([0-9a-f]+)/i)?.[1] || "UNKNOWN";
      const objective =
        c.match(/Objective\s*:\s*([^\n]+)/i)?.[1]?.trim() ||
        "Recorded implementation objective";
      const tests =
        c.match(/Tests?\s*:\s*([^\n]+)/i)?.[1]?.trim() || "Recorded in audit";
      return { task, status, commit, objective, tests, auditFile: file };
    });
    const completed = tasks.filter((t) => /PASS/i.test(t.status)).length;
    res.json({
      initiative: "Termux + Android + Offline Intelligence",
      description:
        "Repository-backed observability for the controlled local-execution capability track.",
      updatedAt: new Date().toISOString(),
      completed,
      auditedTasks: tasks.length,
      progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
      tasks,
      next: "Future tasks appear after their implementation audit is committed.",
    });
  } catch (e) {
    console.error("[OBSERVATORY]", e);
    res.status(500).json({ error: "Observatory data unavailable" });
  }
});

app.post("/api/orbis-command", async (req, res) => {
  let rawCommand = req.body.command || "";
  let cleanCommand = rawCommand.replace(/^.*?ai:\s*/i, "").trim();

  // (Keeping existing command logic intact...)
  if (cleanCommand.includes("ট্রি") || cleanCommand.includes("tree")) {
    const rootPath = path.join(__dirname, "../");
    return res.json({
      result:
        `--- LIVE SOURCE CODE DIRECTORY ---\n\n` + getDirectoryTree(rootPath),
    });
  } else {
    return handleOllamaStream(cleanCommand, res);
  }
});

const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));

app.get(/\/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Orbis Server running on port ${PORT}`);
});
