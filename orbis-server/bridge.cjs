const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');


// --- 🤖 OLLAMA AI INTEGRATION (Brain) ---
async function askOllama(prompt) {
    try {
        const response = await fetch("https://spokesman-waters-experience-greene.trycloudflare.com/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "tinyllama:latest",
                prompt: prompt,
                stream: false
            })
        });
        const data = await response.json();
        return data.response;
    } catch (err) {
        return "⚠️ AI Server Error: " + err.message + " (Ollama কি চালু আছে?)";
    }
}

const app = express();
app.use(cors());
app.use(express.json());

// --- ১. ডায়রেক্টরি ট্রি লজিক ---
function getDirectoryTree(dirPath, indent = '', changedFiles = []) {
    let result = '';
    if (!fs.existsSync(dirPath)) return 'Directory not found';
    const items = fs.readdirSync(dirPath);
    items.forEach(item => {
        if (item === 'node_modules' || item.startsWith('.') || item === 'dist') return;
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        const relPath = fullPath.replace(/\\/g, '/');
        const isChanged = changedFiles.some(f => relPath.endsWith(f));
        const marker = isChanged ? ' ✨ [NEWLY EDITED]' : '';

        if (stat.isDirectory()) {
            result += `${indent}📁 ${item}/${marker}\n`;
            result += getDirectoryTree(fullPath, indent + '  │  ', changedFiles);
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
        if (item === 'node_modules' || item.startsWith('.') || item === 'dist') continue;
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            searchCodeFiles(fullPath, keyword, fileList);
        } else if (item.endsWith('.ts') || item.endsWith('.tsx') || item.endsWith('.js')) {
            if (item.toLowerCase().includes(keyword.toLowerCase())) {
                fileList.push(fullPath);
            } else {
                const content = fs.readFileSync(fullPath, 'utf8');
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
        const content = fs.readFileSync(filePath, 'utf8');
        let report = `\n📄 ফাইল: ${path.basename(filePath)}\n`;

        const imports = content.match(/import.*from.*/g) || [];
        const exports = content.match(/export\s+(const|let|var|function|class|default|{).*/g) || [];

        report += `🔗 ইমপোর্টস (Imports):\n${imports.length > 0 ? imports.map(i => '  ' + i).join('\n') : '  কোনো ইম্পোর্ট নেই'}\n\n`;
        report += `📤 এক্সপোর্টস (Exports):\n${exports.length > 0 ? exports.map(e => '  ' + e).join('\n') : '  কোনো এক্সপোর্ট নেই'}\n`;

        let issueFound = false;
        report += `\n🛠️ ডায়াগনস্টিক রিপোর্ট:\n`;

        if (content.includes('alert(')) {
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

app.get('/api/system-stats', (req, res) => {
    const os = require('os');
    const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
    const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    const usedMem = (totalMem - freeMem).toFixed(2);
    const loadAvg = os.loadavg();

    const uptimeSeconds = os.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    let cpuModel = 'Unknown Processor';
    try { cpuModel = os.cpus()[0].model; } catch(e) {}

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
        status: 'ONLINE'
    });
});

app.post('/api/orbis-command', async (req, res) => {
    let rawCommand = req.body.command || "";
    // অদৃশ্য স্পেস বা ক্যারেক্টার ইগনোর করে AI: চেক করা (মাস্টার রাউটার)
    if (rawCommand.replace(/[^a-zA-Z:]/g, "").toLowerCase().startsWith("ai:")) {
        let cleanCommand = rawCommand.replace(/^.*?ai:\s*/i, "").trim();
        let aiResponse = await askOllama(cleanCommand);
        return res.json({ 
            result: "🧠 [BaaS AI Engine - TinyLlama]\n----------------------------------------\n" + aiResponse + "\n" 
        });
    }

    const { command } = req.body;
    let output = '';
    const rootPath = path.join(__dirname, '../');
    const srcPath = path.join(rootPath, 'src');
    const prismaPath = path.join(rootPath, 'prisma');

    // ==========================================
    // ১. লাইভ ডিপেন্ডেন্সি ট্রি এবং গিট লগ
    // ==========================================
    if (command.includes('ট্রি') || command.includes('ফোল্ডার') || command.includes('tree') || command.includes('সোর্স কোড')) {
        let changedFiles = [];
        let logBook = '\n\n========================================\n';
        logBook += ' 🕒 LIVE 20 ROLLING COMMIT TIME-SLOTS & AUDIT\n';
        logBook += '========================================\n';

        try {
            const { execSync } = require('child_process');
            const lastCommitFilesRaw = execSync('git show --name-only --format="" HEAD', { cwd: rootPath }).toString();
            changedFiles = lastCommitFilesRaw.split('\n').map(f => f.trim()).filter(Boolean);

            const logRaw = execSync(
                `git log -n 20 --pretty=format:"SPLIT_COMMIT|%h|%cd|%s" --date=format:'%d %b %Y, %I:%M:%S %p (IST)' --name-status`,
                { cwd: rootPath }
            ).toString();

            const commitBlocks = logRaw.split('SPLIT_COMMIT|').filter(Boolean);
            logBook += `\n📊 Showing Last ${commitBlocks.length} Commit Time-Slots (Rolling Window)\n\n`;

            commitBlocks.forEach((block, index) => {
                const lines = block.trim().split('\n');
                const [hash, timestamp, ...msgArr] = lines[0].split('|');
                const message = msgArr.join('|');
                const files = lines.slice(1).filter(Boolean);

                logBook += `========================================\n`;
                logBook += `📅 Time-Slot [${index + 1}]: ${timestamp}\n`;
                logBook += `💬 Commit (${hash}): ${message}\n`;
                logBook += `----------------------------------------\n`;

                if (files.length > 0) {
                    files.forEach(f => { logBook += `   📝 ${f.trim()}\n`; });
                } else {
                    logBook += `   ℹ️ No files modified\n`;
                }
                logBook += `\n`;
            });
        } catch (e) {
            logBook += '\n⚠️ Logbook tracking error: ' + e.message;
        }

        output += `--- LIVE SOURCE CODE DIRECTORY ---\n\n` + getDirectoryTree(rootPath, '', changedFiles) + logBook;
        return res.json({ result: output });
    }
    // ==========================================
    // ২. প্যাকেজ ডিপেন্ডেন্সি
    // ==========================================
    else if (command.includes('কানেকশন') || command.includes('ডিপেন্ডেন্সি')) {
        output += `--- DEPENDENCY MAP ---\n\n`;
        try {
            const pkgPath = path.join(rootPath, 'package.json');
            if(fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath));
                output += JSON.stringify(pkg.dependencies, null, 2);
            } else {
                output += 'package.json পাওয়া যায়নি।\n';
            }
        } catch (e) {
            output += `Error: ${e.message}\n`;
        }
        return res.json({ result: output });
    }
    // ==========================================
    // ৩. AST-ভিত্তিক ইন্টেলিজেন্ট ইঞ্জিন (Ready for Local AI/Ollama)
    // ==========================================
    else {
        const ts = require('typescript');
        const isStrictParser = command.includes('PARSER TEST') || command.includes('Return ONLY:');
        
        if (!isStrictParser) {
            output += `🗣️ আপনার প্রশ্ন: "${command}"\n\n`;
            output += `+-------------------------------------------------------------------------+\n`;
            output += `| 🧠 ORBIS AST ইঞ্জিন: স্মার্ট ডিপেন্ডেন্সি স্ক্যানার                       |\n`;
            output += `+-------------------------------------------------------------------------+\n\n`;
        }

        function getAllValidFiles(dir, fileList = []) {
            if (!fs.existsSync(dir)) return fileList;
            const items = fs.readdirSync(dir);
            for (const item of items) {
                if (item === 'node_modules' || item.startsWith('.') || item === 'dist') continue;
                const fullPath = path.join(dir, item);
                if (fs.statSync(fullPath).isDirectory()) {
                    getAllValidFiles(fullPath, fileList);
                } else if (item.match(/\.(tsx|ts|js|jsx)$/)) {
                    if (item.includes('.test.') && command.includes('Ignore *.test.tsx')) continue;
                    else if (item.includes('.test.') && !command.includes('.test.')) continue;
                    fileList.push(fullPath);
                }
            }
            return fileList;
        }

        const allSourceFiles = getAllValidFiles(srcPath);
        if (fs.existsSync(prismaPath)) getAllValidFiles(prismaPath, allSourceFiles);

        let targetFilePath = null;
        let targetFileName = null;
        
        const targetMatch = command.match(/Target file:\s*([a-zA-Z0-9_.-]+)/i) || command.match(/([a-zA-Z0-9_.-]+\.tsx?)/i);
        let searchWord = targetMatch ? targetMatch[1].trim() : null;

        if (!searchWord) {
            const words = command.split(/[\s,?.!"']+/);
            for (let word of words) {
                if (word.length >= 3 && allSourceFiles.some(f => path.basename(f).toLowerCase() === word.toLowerCase() || path.basename(f).replace(/\.[^/.]+$/, "").toLowerCase() === word.toLowerCase())) {
                    searchWord = word; break;
                }
            }
        }

        if (searchWord) {
            targetFilePath = allSourceFiles.find(f => path.basename(f).toLowerCase() === searchWord.toLowerCase() || path.basename(f).replace(/\.[^/.]+$/, "").toLowerCase() === searchWord.toLowerCase());
            if (targetFilePath) targetFileName = path.basename(targetFilePath);
        }

        if (!targetFilePath) {
            return res.json({ result: isStrictParser ? "ERROR: Target file not found." : output + "❌ টার্গেট ফাইল পাওয়া যায়নি" });
        }

        const content = fs.readFileSync(targetFilePath, 'utf8');
        const sourceFile = ts.createSourceFile(targetFileName, content, ts.ScriptTarget.Latest, true);
        
        const astImports = [];

        ts.forEachChild(sourceFile, node => {
            if (ts.isImportDeclaration(node)) {
                const moduleName = node.moduleSpecifier.text;
                const exactLine = content.substring(node.getFullStart(), node.getEnd()).trim();
                astImports.push({
                    module: moduleName,
                    statement: exactLine,
                    isLocal: moduleName.startsWith('.')
                });
            }
        });

        if (isStrictParser) {
            if (command.includes('first local file imported')) {
                const firstLocal = astImports.find(i => i.isLocal);
                if (firstLocal) {
                    output = `Target File: ${targetFileName}\nImported File: ${firstLocal.module}\nImport Statement: ${firstLocal.statement}`;
                } else {
                    output = "No local imports found.";
                }
            } else {
                output = "STRICT MODE: Query understood, but specific task handler not matched.";
            }
        } else {
            output += ` 📄 টার্গেট ফাইল:           ${targetFilePath.replace(rootPath, '')}\n\n`;
            output += ` 🔗 ইমপোর্টস (AST):\n`;
            astImports.forEach(imp => {
                output += `      - ${imp.isLocal ? 'লোকাল' : 'প্যাকেজ'}: ${imp.module}\n`;
            });
            output += `\n+-------------------------------------------------------------------------+\n`;
            output += `| [ স্ট্যাটাস ] ✅ AST পার্সিং সম্পন্ন (Ready for AI Integration)           |\n`;
            output += `+-------------------------------------------------------------------------+\n`;
        }

        return res.json({ result: output });
    }
});

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.get(/\/.*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`ORBIS Server running on port ${PORT}`));
