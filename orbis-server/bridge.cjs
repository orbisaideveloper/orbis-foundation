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
// TERMUX / ANDROID / OFFLINE INTELLIGENCE OBSERVATORY
app.get("/api/termux-observatory", (req, res) => {
  try {
    const auditDir = path.join(__dirname, "../docs/AUDIT_REPORTS");
    const repoRoot = path.join(__dirname, "../");
    const readText = (p) =>
      fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    const files = fs.existsSync(auditDir)
      ? fs
          .readdirSync(auditDir)
          .filter((n) => /^\d+_.*\.md$/i.test(n))
          .sort()
      : [];
    const first = (t, ps, fallback = "UNKNOWN") => {
      for (const p of ps) {
        const m = t.match(p);
        if (m?.[1]) return m[1].trim();
      }
      return fallback;
    };
    const clean = (v) =>
      v
        .replace(/\*\*/g, "")
        .replace(/^#+\s*/, "")
        .trim();
    const section = (t, hs) => {
      for (const h of hs) {
        const e = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const m = t.match(
          new RegExp(
            `(?:^|\\n)#{1,4}\\s*(?:\\d+\\.\\s*)?${e}\\s*\\n([\\s\\S]*?)(?=\\n#{1,4}\\s|$)`,
            "i",
          ),
        );
        if (m?.[1]) return m[1].trim();
      }
      return "";
    };
    const listFiles = (t, hs) => {
      const b = section(t, hs);
      if (b) {
        let matches = [...b.matchAll(/^\s*[-*]\s+`?([^`\s]+)`?\s*$/gm)].map(
          (m) => m[1],
        );
        if (matches.length > 0) return matches;
      }
      // Universal Fallback: হেডিং না পেলে পুরো ফাইলের যেখানেই পাথ থাকুক, টেনে বের করবে!
      return [
        ...t.matchAll(/(?:src|docs|orbis-server)\/[a-zA-Z0-9_\.\/-]+/g),
      ].map((m) => m[0]);
    };

    const classify = (f) => {
      const p = f.replace(/\\/g, "/");
      if (
        p.startsWith("src/admin/") ||
        p.startsWith("src/ui/") ||
        p.endsWith(".tsx")
      )
        return "frontend";
      if (p.startsWith("orbis-server/")) return "backend";
      if (p.startsWith("src/core/")) return "core";
      if (/termux|android|runtime/i.test(p)) return "runtime";
      if (p.startsWith("docs/")) return "audit";
      return "other";
    };
    const resolveImport = (from, imp) => {
      if (!imp.startsWith(".")) return null;
      const base = path.resolve(path.dirname(from), imp);
      const cs = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.jsx`,
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
        path.join(base, "index.js"),
      ];
      const found = cs.find((p) => fs.existsSync(p));
      return found ? path.relative(repoRoot, found).replace(/\\/g, "/") : null;
    };
    const imports = (file) => {
      const abs = path.resolve(repoRoot, file);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return [];
      const out = [];
      const re = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
      for (const m of readText(abs).matchAll(re)) {
        const r = resolveImport(abs, m[1]);
        if (r) out.push(r);
      }
      return [...new Set(out)];
    };
    const tasks = files
      .map((file) => {
        const c = readText(path.join(auditDir, file));
        const taskMatch = file.match(/^0*(\d+)_.*\.md$/i);
        const task = taskMatch
          ? `TASK-${String(taskMatch[1]).padStart(3, "0")}`
          : "UNKNOWN";
        if (task === "UNKNOWN") return null;
        const status = clean(
          first(c, [
            /(?:\*\*)?Final Status(?:\*\*)?\s*:\s*([^\n]+)/i,
            /(?:\*\*)?Status(?:\*\*)?\s*:\s*([^\n]+)/i,
          ]),
        );
        const commitMatch = c.match(/Commit[^a-zA-Z0-9]*([0-9a-f]{7,40})/i);
        const commit = commitMatch ? commitMatch[1] : "UNKNOWN";
        const objective = clean(
          section(c, ["Objective"]) ||
            first(
              c,
              [/(?:\*\*)?Objective(?:\*\*)?\s*:\s*([^\n]+)/i],
              "Recorded implementation objective",
            ),
        );
        const changed = [
          ...new Set([
            ...listFiles(c, ["Files Added", "Files Added / Modified"]),
            ...listFiles(c, [
              "Files Modified",
              "Additional Files Modified",
              "Files Added / Modified",
            ]),
          ]),
        ];
        const field = (n, fb = "Recorded in audit") =>
          clean(
            first(
              c,
              [new RegExp(`(?:\\*\\*)?${n}(?:\\*\\*)?\\s*:\\s*([^\\n]+)`, "i")],
              fb,
            ),
          );
        const layers = {
          frontend: changed.filter((f) => classify(f) === "frontend"),
          backend: changed.filter((f) => classify(f) === "backend"),
          core: changed.filter((f) => classify(f) === "core"),
          runtime: changed.filter((f) => classify(f) === "runtime"),
          audit: [`docs/AUDIT_REPORTS/${file}`],
          other: changed.filter(
            (f) =>
              !["frontend", "backend", "core", "runtime"].includes(classify(f)),
          ),
        };
        const edges = [];
        for (const f of changed)
          for (const to of imports(f)) edges.push({ from: f, to });
        return {
          task,
          status,
          passed: /\bPASS\b/i.test(status),
          commit,
          objective,
          implementationSummary: clean(
            section(c, [
              "Implementation Summary",
              "Implementation Result",
              "Core Implementation Result",
              "Summary",
              "Architecture Impact",
            ]) || "Recorded in audit",
          ),
          changedFiles: changed,
          filesByLayer: layers,
          dependencies: [...new Set(edges.map((e) => `${e.from} -> ${e.to}`))],
          dependencyEdges: edges,
          tests: field("Tests"),
          coverage: field("Coverage"),
          build: field("Build"),
          typeCheck: field("Type-Check", field("Type Check")),
          security: field("Security Verification"),
          architectureImpact: clean(
            section(c, ["Architecture Impact"]) || "Recorded in audit",
          ),
          knownIssues: clean(
            section(c, ["Known Issues / Notes", "Known Issues"]) ||
              "None reported.",
          ),
          date: field("Date"),
          time: field("Time"),
          implementer: field("Implementer"),
          auditFile: `docs/AUDIT_REPORTS/${file}`,
        };
      })
      .filter(Boolean);
    tasks.sort(
      (a, b) =>
        Number(a.task.replace(/\D/g, "")) - Number(b.task.replace(/\D/g, "")),
    );
    const completed = tasks.filter((t) => t.passed).length,
      auditedTasks = tasks.length;
    const progress = auditedTasks
      ? Math.round((completed / auditedTasks) * 100)
      : 0;
    const last = tasks.length
      ? Math.max(...tasks.map((t) => Number(t.task.replace(/\D/g, ""))))
      : 0;
    const next = `TASK-${String(last + 1).padStart(3, "0")}`;
    res.json({
      initiative: "Termux / Android / Offline-AI",
      title: "TERMUX / ANDROID OBSERVATORY",
      purpose:
        "Repository-backed observation of the Termux/Android/Offline-AI implementation track: what was implemented, what evidence proves it, how the layers connect, and what the next real task is.",
      work: "Track controlled local-execution capability progress from abstraction and policy through lifecycle, authorization, and future concrete runtime/Android/offline-AI work.",
      currentPhase: `${last ? `TASK-${String(last).padStart(3, "0")} completed` : "NO TASK EVIDENCE"}; next evidence target ${next}`,
      currentResult: `${completed}/${auditedTasks} audited tasks accepted from repository evidence`,
      completed,
      auditedTasks,
      progress,
      tasks,
      next: `${next} will appear after its implementation audit is committed and discovered from the repository.`,
      systemMap: {
        frontend: ["src/admin/dashboard/sections/TermuxObservatory.tsx"],
        backend: ["orbis-server/bridge.cjs"],
        core: [...new Set(tasks.flatMap((t) => t.filesByLayer.core))],
        runtime: [...new Set(tasks.flatMap((t) => t.filesByLayer.runtime))],
        audit: [...new Set(tasks.flatMap((t) => t.filesByLayer.audit))],
        edges: imports(
          "src/admin/dashboard/sections/TermuxObservatory.tsx",
        ).map((to) => ({
          from: "src/admin/dashboard/sections/TermuxObservatory.tsx",
          to,
        })),
      },
      updatedAt: new Date().toISOString(),
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
