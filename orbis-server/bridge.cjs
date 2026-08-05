const express = require('express');
const cors = require('cors');               
const fs = require('fs');                   
const path = require('path');               
                                            
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
        
        // ডাইনামিক ইম্পোর্ট এবং এক্সপোর্ট ফাইন্ডার
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

app.post('/api/orbis-command', (req, res) => {
    const { command } = req.body;
    let output = '';
    const rootPath = path.join(__dirname, '../');
    const srcPath = path.join(rootPath, 'src');
    const prismaPath = path.join(rootPath, 'prisma');

    // ==========================================
    // ১. পুরানো লজিক (অক্ষত): লাইভ ডিপেন্ডেন্সি ট্রি এবং গিট লগ
    // ==========================================
    if (command.includes('ট্রি') || command.includes('ফোল্ডার') || command.includes('tree') || command.includes('সোর্স কোড')) {
        let changedFiles = [];
        let logBook = '\n\n========================================\n';
        logBook += ' 🕒 LIVE 20 ROLLING COMMIT TIME-SLOTS & AUDIT\n';
        logBook += '========================================\n';

        try {
            const { execSync } = require('child_process');

            // লেটেস্ট কমিটের চেঞ্জ হওয়া ফাইল
            const lastCommitFilesRaw = execSync('git show --name-only --format="" HEAD', { cwd: rootPath }).toString();
            changedFiles = lastCommitFilesRaw.split('\n').map(f => f.trim()).filter(Boolean);

            // ২০টি কমিটের ক্রমানুসারে হিস্ট্রি
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
                    files.forEach(f => {
                        logBook += `   📝 ${f.trim()}\n`;
                    });
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
    // ২. পুরানো লজিক (অক্ষত): প্যাকেজ ডিপেন্ডেন্সি
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
    // ৩. নতুন ইন্টেলিজেন্ট ইঞ্জিন (শুধুমাত্র ভয়েস/ডায়াগনস্টিকের জন্য)
    // ==========================================
    else {
        let output = `🗣️ আপনার প্রশ্ন: "${command}"\n\n`;
        output += `+-------------------------------------------------------------------------+\n`;
        output += `| 🔍 ORBIS ইন্টেলিজেন্ট স্ক্যানার: ডিপেন্ডেন্সি ম্যাপ                      |\n`;
        output += `+-------------------------------------------------------------------------+\n\n`;

        // ডাইনামিক রিকার্সিভ ফাইল ফাইন্ডার (কোনো হার্ডকোড নেই)
        function getAllValidFiles(dir, fileList = []) {
            if (!fs.existsSync(dir)) return fileList;
            const items = fs.readdirSync(dir);
            for (const item of items) {
                if (item === 'node_modules' || item.startsWith('.') || item === 'dist') continue;
                const fullPath = path.join(dir, item);
                if (fs.statSync(fullPath).isDirectory()) {
                    getAllValidFiles(fullPath, fileList);
                } else if (item.match(/\.(tsx|ts|js|jsx)$/)) {
                    // .test.tsx ইগনোর করবে যদি না ইউজার explicitly বলে
                    if (item.includes('.test.') && !command.includes('.test.')) continue;
                    fileList.push(fullPath);
                }
            }
            return fileList;
        }

        const allSourceFiles = getAllValidFiles(srcPath);
        if (fs.existsSync(prismaPath)) getAllValidFiles(prismaPath, allSourceFiles);

        let targetFilePath = null;
        let targetFileName = null;
        let targetBaseName = null;

        // কমান্ড থেকে লাইভ সোর্স ফাইলের নাম ম্যাচিং (Zero Hardcode Guessing)
        const words = command.split(/[\s,?.!"']+/);
        for (let word of words) {
            word = word.trim();
            if (word.length < 3) continue;
            
            const matchedFile = allSourceFiles.find(f => {
                const basename = path.basename(f);
                const nameWithoutExt = basename.replace(/\.[^/.]+$/, "");
                return basename.toLowerCase() === word.toLowerCase() || nameWithoutExt.toLowerCase() === word.toLowerCase();
            });

            if (matchedFile) {
                targetFilePath = matchedFile;
                targetFileName = path.basename(matchedFile);
                targetBaseName = targetFileName.replace(/\.[^/.]+$/, "");
                break;
            }
        }

        if (!targetFilePath) {
            output += `+-------------------------------------------------------------------------+\n`;
            output += `| [ স্ট্যাটাস ] ❌ টার্গেট ফাইল পাওয়া যায়নি                                  |\n`;
            output += `+-------------------------------------------------------------------------+\n`;
        } else {
            const content = fs.readFileSync(targetFilePath, 'utf8');
            
            // ইমপোর্টস এবং এক্সপোর্টস এক্সট্র্যাকশন
            const importsRaw = content.match(/import.*from\s+['"].*['"]/g) || [];
            const imports = importsRaw.map(i => i.split('from')[1].replace(/['";]/g, '').trim());
            
            const exportsRaw = content.match(/export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type)\s+([a-zA-Z0-9_]+)/g) || [];
            const exportedSymbols = exportsRaw.map(e => e.split(/\s+/).pop());
            const exportsList = content.match(/export\s+(default\s+[a-zA-Z0-9_]+|\{[^}]+\})/g) || [];

            // রিভার্স ডিপেন্ডেন্সি (কারা এই ফাইলটিকে ইমপোর্ট করেছে)
            const importedBy = [];
            allSourceFiles.forEach(f => {
                if (f === targetFilePath) return;
                const fContent = fs.readFileSync(f, 'utf8');
                if (fContent.includes(`/${targetBaseName}`) || fContent.includes(`'${targetBaseName}'`) || fContent.includes(`"${targetBaseName}"`)) {
                    importedBy.push(f.replace(rootPath, '').replace(/^\//, ''));
                }
            });

            const relativeTargetPath = targetFilePath.replace(rootPath, '').replace(/^\//, '');
            const depCount = imports.length + exportedSymbols.length + importedBy.length;

            output += ` 📄 টার্গেট ফাইল:           ${relativeTargetPath}\n\n`;
            output += ` 🔗 ইমপোর্টস:               ${imports.length > 0 ? '- ' + imports.join('\n                            - ') : 'নেই'}\n\n`;
            output += ` 📤 এক্সপোর্টস:             ${exportsList.length > 0 ? '- ' + exportsList.map(e => e.replace('export ', '')).join('\n                            - ') : 'নেই'}\n\n`;
            output += ` 📥 যারা ইমপোর্ট করেছে:     ${importedBy.length > 0 ? '- ' + importedBy.join('\n                            - ') : 'কেউ ইমপোর্ট করেনি'}\n\n`;
            output += ` 🧩 এক্সপোর্টেড সিম্বল:      ${exportedSymbols.length > 0 ? exportedSymbols.join(', ') : 'নেই'}\n\n`;
            output += ` 📊 লোকাল ডিপেন্ডেন্সি সংখ্যা: ${depCount}\n\n`;
            output += `+-------------------------------------------------------------------------+\n`;
            output += `| [ স্ট্যাটাস ] ✅ লাইভ সোর্স ভেরিফাইড                                       |\n`;
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
