const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;

// --- 🤖 OLLAMA AI INTEGRATION (Brain with Streaming) ---
async function handleOllamaStream(prompt, res) {
  const tunnelUrl =
    process.env.OLLAMA_URL ||
    "https://range-lives-asking-ant.trycloudflare.com";
  try {
    const response = await fetch(`${tunnelUrl}/api/generate`, {
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
      return res.json({
        result:
          "⚠️ AI Server Error: " +
          err.message +
          " (Ollama বা টানেল কি চালু আছে?)",
      });
    }
    res.write("\n⚠️ AI Connection Interrupted.");
    res.end();
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// --- ১. ডায়রেক্টরি ট্রি লজিক ---
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

// --- ২. স্মার্ট ডায়াগনস্টিক লজিক ---
function searchCodeFiles(dir, keyword, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item === "node_modules" || item.startsWith(".") || item === "dist")
      continue;
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      searchCodeFiles(fullPath, keyword, fileList);
    } else if (
      item.endsWith(".ts") ||
      item.endsWith(".tsx") ||
      item.endsWith(".js")
    ) {
      if (item.toLowerCase().includes(keyword.toLowerCase())) {
        fileList.push(fullPath);
      } else {
        const content = fs.readFileSync(fullPath, "utf8");
        if (content.toLowerCase().includes(keyword.toLowerCase())) {
          fileList.push(fullPath);
        }
      }
    }
  }
  return fileList;
}

function analyzeFileLogic(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    let report = `\n📄 ফাইল: ${path.basename(filePath)}\n`;
    const imports = content.match(/import.*from.*/g) || [];
    const exports =
      content.match(/export\s+(const|let|var|function|class|default|{).*/g) ||
      [];

    report += `🔗 ইমপোর্টস (Imports):\n${imports.length > 0 ? imports.map((i) => "  " + i).join("\n") : "  কোনো ইম্পোর্ট নেই"}\n\n`;
    report += `📤 এক্সপোর্টস (Exports):\n${exports.length > 0 ? exports.map((e) => "  " + e).join("\n") : "  কোনো এক্সপোর্ট নেই"}\n`;

    let issueFound = false;
    report += `\n🛠️ ডায়াগনস্টিক রিপোর্ট:\n`;

    if (content.includes("alert(")) {
      report += `- [WARNING] alert() ফাংশন কোডের ফ্লো ব্লক করে দেয়।\n`;
      issueFound = true;
    }
    if (content.match(/catch\s*\(/)) {
      report += `- [LOGIC] try-catch এরর হ্যান্ডলিং আছে।\n`;
      issueFound = true;
    }
    if (!issueFound) {
      report += `- কোনো বেসিক লজিক্যাল ত্রুটি চোখে পড়েনি।\n`;
    }
    return report + `\n----------------------------------------\n`;
  } catch (e) {
    return `\n[ERROR] স্ক্যান করতে সমস্যা: ${e.message}\n`;
  }
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
    cpuModel: cpuModel,
    arch: os.arch(),
    platform: os.platform().toUpperCase(),
    release: os.release(),
    hostname: os.hostname(),
    load: loadAvg[0].toFixed(2),
    load5m: loadAvg[1].toFixed(2),
    load15m: loadAvg[2].toFixed(2),
    totalMem: totalMem,
    freeMem: freeMem,
    usedMem: usedMem,
    ramUsedPercent: ((usedMem / totalMem) * 100).toFixed(1),
    uptime: `${hours}h ${minutes}m`,
    processUptime: process.uptime().toFixed(0),
    heapUsed: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2),
    status: "ONLINE",
  });
});

// ============================================================
// ORBIS CHAT API
// Frontend contract: POST /api/chat
// Body: { messages: [{ role, content }] }
// Response: { message: { role: "assistant", content } }
// ============================================================
app.post("/api/chat", async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

    const validMessages = messages
      .filter(
        (m) =>
          (m?.role === "user" || m?.role === "assistant") &&
          typeof m?.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(-20);

    if (validMessages.length === 0) {
      return res.status(400).json({
        error: "No valid chat message supplied.",
      });
    }

    const conversation = validMessages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const prompt =
      "You are ORBIS AI, the intelligent assistant of ORBIS Foundation. " +
      "Answer clearly and helpfully. Preserve conversation context. " +
      "Reply in the same language as the user when practical.\n\n" +
      conversation +
      "\nAssistant:";

    const tunnelUrl =
      process.env.OLLAMA_URL ||
      "https://range-lives-asking-ant.trycloudflare.com";

    const response = await fetch(`${tunnelUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "tinyllama:latest",
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[CHAT_API] Ollama error:", response.status, text);

      return res.status(502).json({
        error: `AI backend unavailable (${response.status}).`,
      });
    }

    const data = await response.json();
    const content =
      typeof data?.response === "string" ? data.response.trim() : "";

    if (!content) {
      return res.status(502).json({
        error: "AI backend returned an empty response.",
      });
    }

    return res.json({
      message: {
        role: "assistant",
        content,
      },
    });
  } catch (error) {
    console.error("[CHAT_API] Request failed:", error);

    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Chat backend request failed.",
    });
  }
});

app.post("/api/orbis-command", async (req, res) => {
  let rawCommand = req.body.command || "";
  let cleanCommand = rawCommand.replace(/^.*?ai:\s*/i, "").trim();

  const isTreeCommand =
    cleanCommand.includes("ট্রি") ||
    cleanCommand.includes("ফোল্ডার") ||
    cleanCommand.includes("tree") ||
    cleanCommand.includes("সোর্স কোড");
  const isDepCommand =
    cleanCommand.includes("কানেকশন") || cleanCommand.includes("ডিপেন্ডেন্সি");

  const rootPath = path.join(__dirname, "../");
  const srcPath = path.join(rootPath, "src");
  const prismaPath = path.join(rootPath, "prisma");

  if (isTreeCommand) {
    let changedFiles = [];
    let logBook =
      "\n\n========================================\n 🕒 LIVE 20 ROLLING COMMIT TIME-SLOTS & AUDIT\n========================================\n";
    try {
      const { execSync } = require("node:child_process");
      changedFiles = execSync('git show --name-only --format="" HEAD', {
        cwd: rootPath,
      })
        .toString()
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);
      const logRaw = execSync(
        `git log -n 20 --pretty=format:"SPLIT_COMMIT|%h|%cd|%s" --date=format:'%d %b %Y, %I:%M:%S %p (IST)' --name-status`,
        { cwd: rootPath },
      ).toString();
      const commitBlocks = logRaw.split("SPLIT_COMMIT|").filter(Boolean);
      logBook += `\n📊 Showing Last ${commitBlocks.length} Commit Time-Slots (Rolling Window)\n\n`;
      commitBlocks.forEach((block, index) => {
        const lines = block.trim().split("\n");
        const [hash, timestamp, ...msgArr] = lines[0].split("|");
        const message = msgArr.join("|");
        const files = lines.slice(1).filter(Boolean);
        logBook += `========================================\n📅 Time-Slot [${index + 1}]: ${timestamp}\n💬 Commit (${hash}): ${message}\n----------------------------------------\n`;
        if (files.length > 0)
          files.forEach((f) => {
            logBook += `   📝 ${f.trim()}\n`;
          });
        else logBook += `   ℹ️ No files modified\n`;
        logBook += `\n`;
      });
    } catch (e) {
      logBook += "\n⚠️ Logbook tracking error: " + e.message;
    }
    let output =
      `--- LIVE SOURCE CODE DIRECTORY ---\n\n` +
      getDirectoryTree(rootPath, "", changedFiles) +
      logBook;
    return res.json({ result: output });
  } else if (isDepCommand) {
    let output = `--- DEPENDENCY MAP ---\n\n`;
    try {
      const pkgPath = path.join(rootPath, "package.json");
      if (fs.existsSync(pkgPath))
        output += JSON.stringify(
          JSON.parse(fs.readFileSync(pkgPath)).dependencies,
          null,
          2,
        );
      else output += "package.json পাওয়া যায়নি।\n";
    } catch (e) {
      output += `Error: ${e.message}\n`;
    }
    return res.json({ result: output });
  } else {
    // টার্গেট ফাইল বা AST চেক করা
    function getAllValidFiles(dir, fileList = []) {
      if (!fs.existsSync(dir)) return fileList;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (item === "node_modules" || item.startsWith(".") || item === "dist")
          continue;
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory())
          getAllValidFiles(fullPath, fileList);
        else if (item.match(/\.(tsx|ts|js|jsx)$/)) {
          if (
            item.includes(".test.") &&
            cleanCommand.includes("Ignore *.test.tsx")
          )
            continue;
          else if (item.includes(".test.") && !cleanCommand.includes(".test."))
            continue;
          fileList.push(fullPath);
        }
      }
      return fileList;
    }

    const allSourceFiles = getAllValidFiles(srcPath);
    if (fs.existsSync(prismaPath)) getAllValidFiles(prismaPath, allSourceFiles);

    const targetMatch =
      cleanCommand.match(/Target file:\s*([a-zA-Z0-9_.-]+)/i) ||
      cleanCommand.match(/([a-zA-Z0-9_.-]+\.tsx?)/i);
    let searchWord = targetMatch ? targetMatch[1].trim() : null;

    if (!searchWord) {
      const words = cleanCommand.split(/[\s,?.!"']+/);
      for (let word of words) {
        if (
          word.length >= 3 &&
          allSourceFiles.some(
            (f) =>
              path.basename(f).toLowerCase() === word.toLowerCase() ||
              path
                .basename(f)
                .replace(/\.[^/.]+$/, "")
                .toLowerCase() === word.toLowerCase(),
          )
        ) {
          searchWord = word;
          break;
        }
      }
    }

    let targetFilePath = null;
    if (searchWord) {
      targetFilePath = allSourceFiles.find(
        (f) =>
          path.basename(f).toLowerCase() === searchWord.toLowerCase() ||
          path
            .basename(f)
            .replace(/\.[^/.]+$/, "")
            .toLowerCase() === searchWord.toLowerCase(),
      );
    }

    // যদি বিশেষ কোনো কোড ফাইল স্ক্যান করতে না বলা হয়ে থাকে, তবে এটি সাধারণ প্রশ্ন এবং সরাসরি Ollama এআই-তে যাবে
    if (!targetFilePath) {
      return handleOllamaStream(cleanCommand, res);
    }

    // AST Parsing
    const ts = require("typescript");
    const targetFileName = path.basename(targetFilePath);
    const content = fs.readFileSync(targetFilePath, "utf8");
    const sourceFile = ts.createSourceFile(
      targetFileName,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    const astImports = [];
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isImportDeclaration(node)) {
        astImports.push({
          module: node.moduleSpecifier.text,
          statement: content
            .substring(node.getFullStart(), node.getEnd())
            .trim(),
          isLocal: node.moduleSpecifier.text.startsWith("."),
        });
      }
    });

    let output = `🗣️ আপনার প্রশ্ন: "${cleanCommand}"\n\n+-------------------------------------------------------------------------+\n| 🧠 ORBIS AST ইঞ্জিন: স্মার্ট ডিপেন্ডেন্সি স্ক্যানার                       |\n+-------------------------------------------------------------------------+\n\n`;
    output += ` 📄 টার্গেট ফাইল:           ${targetFilePath.replace(rootPath, "")}\n\n 🔗 ইমপোর্টস (AST):\n`;
    astImports.forEach((imp) => {
      output += `      - ${imp.isLocal ? "লোকাল" : "প্যাকেজ"}: ${imp.module}\n`;
    });
    output += `\n+-------------------------------------------------------------------------+\n| [ স্ট্যাটাস ] ✅ AST পার্সিং সম্পন্ন (Ready for AI Integration)           |\n+-------------------------------------------------------------------------+\n`;
    return res.json({ result: output });
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

// Multi-model co-existence active: TinyLlama & Qwen 2.5 Bridge Routing

// --- Multi-Agent Collaboration (TinyLlama + Qwen 2.5 MoA Router) ---
function getActiveAiModel(prompt) {
  // ছোট বা দ্রুত উত্তরের জন্য TinyLlama, আর ডিপ লজিকের জন্য Qwen 2.5 1.5B রাউট করা
  if (prompt && prompt.length < 50) {
    return "tinyllama";
  }
  return "qwen2.5:1.5b";
}
