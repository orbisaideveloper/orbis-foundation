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

    if (command.includes('ট্রি') || command.includes('ফোল্ডার') || command.includes('tree') || command.includes('সোর্স কোড')) {
        let changedFiles = [];
        let logBook = '\n\n========================================\n';
        logBook += ' 🕒 LIVE 20 ROLLING COMMIT TIME-SLOTS & AUDIT\n';
        logBook += '========================================\n';

        try {
            const { execSync } = require('child_process');

            // ১. লেটেস্ট কমিটের চেঞ্জ হওয়া ফাইল
            const lastCommitFilesRaw = execSync('git show --name-only --format="" HEAD', { cwd: rootPath }).toString();
            changedFiles = lastCommitFilesRaw.split('\n').map(f => f.trim()).filter(Boolean);

            // ২. সময় অনুসারে শেষ ২০টি কমিটের ক্রমানুসারে হিস্ট্রি
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
    }
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
    }
    else {
        output += `--- 🧠 ORBIS DYNAMIC DEPENDENCY TRACER ---\n\n`;
        
        // ন্যাচারাল ল্যাঙ্গুয়েজ প্রসেসিং (NLP) স্টপ-ওয়ার্ড ফিল্টার
        const stopWords = ['আমাকে', 'একটু', 'মানে', 'কোথায়', 'কি', 'কেন', 'কিভাবে', 'দেখাও', 'করো', 'দাও', 'এর', 'মধ্যে', 'টুল', 'টি', 'যে', 'লিস্ট', 'ট্রি', 'দাও', 'কী', 'কীভাবে'];
        
        // কমান্ড থেকে অপ্রয়োজনীয় শব্দ বাদ দিয়ে মূল ভেরিয়েবল (Target Module) বের করা
        const words = command.toLowerCase().split(/\s+/).filter(w => !stopWords.includes(w) && w.length > 2);
        
        // যদি নির্দিষ্ট কোনো শব্দ না পায়, তবে ডিফল্ট হিসেবে 'App' স্ক্যান করবে
        let keyword = words.length > 0 ? words.sort((a,b) => b.length - a.length)[0] : 'App';
        
        // বাংলিশ বা ইউজার ইনপুট নরমালাইজেশন
        if (keyword.includes('ড্যাশবোর্ড') || keyword.includes('dashboard')) keyword = 'Dashboard';
        else if (keyword.includes('লটারি') || keyword.includes('lottery')) keyword = 'lottery';
        else if (keyword.includes('ভয়েস') || keyword.includes('মাইক্রোফোন')) keyword = 'CommandBar';

        output += `🔍 '${keyword}' মডিউলের ইম্পোর্ট/এক্সপোর্ট ম্যাপ স্ক্যান করা হচ্ছে...\n`;

        const foundFiles = searchCodeFiles(srcPath, keyword);
        const uniqueFiles = [...new Set(foundFiles)];

        if (uniqueFiles.length > 0) {
            output += `✅ ${uniqueFiles.length} টি সম্পর্কিত ফাইল পাওয়া গেছে।\n`;
            
            // রেজাল্ট টার্মিনালে দেখানোর জন্য লুপ
            uniqueFiles.slice(0, 3).forEach(f => {
                output += analyzeFileLogic(f);
            });
            
            if (uniqueFiles.length > 3) {
                output += `\n... আরও ${uniqueFiles.length - 3} টি ফাইল জড়িত আছে। বিস্তারিত দেখতে নির্দিষ্ট ফাইলের নাম লিখুন।`;
            }
        } else {
            output += `❌ '${keyword}' সম্পর্কিত কোনো ফাইল বা ফোল্ডার সোর্স কোডে পাওয়া যায়নি।`;
        }
    }

    res.json({ result: output });
});

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.get(/\/.*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`ORBIS Server running on port ${PORT}`));
