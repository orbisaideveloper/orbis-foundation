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
    let output = `🗣️ আপনার প্রশ্ন: "${command}"\n\n`;
    output += `--- 🧠 ORBIS INTELLIGENT ENGINE ---\n\n`;

    const rootPath = path.join(__dirname, '../');
    const srcPath = path.join(rootPath, 'src');
    const prismaPath = path.join(rootPath, 'prisma');

    // ১. ন্যাচারাল ল্যাঙ্গুয়েজ প্রসেসিং (NLP) স্টপ-ওয়ার্ড ফিল্টার
    const stopWords = ['আমাকে', 'একটু', 'মানে', 'কোথায়', 'কি', 'কী', 'কেন', 'কিভাবে', 'কীভাবে', 'দেখাও', 'করো', 'দাও', 'এর', 'মধ্যে', 'টুল', 'টি', 'যে', 'লিস্ট', 'ট্রি', 'গুলো', 'গুলা', 'সম্পর্কে', 'খুঁজে', 'বের', 'করে', 'কোন', 'কোনো', 'সাথে', 'জড়িত', 'আছে', 'একটা', 'আগে', 'নেমে', 'নামে', 'দিয়ে', 'দিয়া', 'ফোল্ডার', 'ফাইল', 'ফোল্ডারগুলোর', 'ফাইলের'];

    let words = command.toLowerCase().split(/[\s,?.!]+/);
    words = words.filter(w => !stopWords.includes(w) && w.length > 2);

    // ২. মূল ভেরিয়েবল এক্সট্র্যাকশন
    let keyword = words.length > 0 ? words.sort((a,b) => b.length - a.length)[0] : '';

    // Smart Dictionary (No hardcoded responses, just search mapping)
    const dictionary = {
        'ডাটাবেজ': 'prisma', 'ডাটাবেস': 'prisma', 'database': 'prisma',
        'ভয়েস': 'command', 'voice': 'command', 'মাইক্রোফোন': 'command',
        'ড্যাশবোর্ড': 'dashboard', 'লটারি': 'lottery', 'কানেকশন': 'package.json'
    };
    if (dictionary[keyword]) keyword = dictionary[keyword];

    // ৩. ডায়নামিক এক্সিকিউশন (No if-else blocks)
    if (!keyword || keyword === 'প্রজেক্ট' || keyword === 'project' || command.includes('সোর্স কোড')) {
        let changedFiles = [];
        try {
            const { execSync } = require('child_process');
            changedFiles = execSync('git show --name-only --format="" HEAD', { cwd: rootPath }).toString().split('\n').map(f => f.trim()).filter(Boolean);
        } catch(e) {}
        output += `🔍 পুরো প্রজেক্টের কোর ডিরেক্টরি স্ক্যান করা হচ্ছে...\n\n`;
        output += getDirectoryTree(rootPath, '', changedFiles);
    } else {
        output += `🔍 '${keyword}' লজিকের জন্য লাইভ সোর্স কোড স্ক্যান করা হচ্ছে...\n`;
        
        let foundFiles = [];
        if (fs.existsSync(srcPath)) foundFiles = foundFiles.concat(searchCodeFiles(srcPath, keyword));
        if (fs.existsSync(prismaPath)) foundFiles = foundFiles.concat(searchCodeFiles(prismaPath, keyword));
        
        const uniqueFiles = [...new Set(foundFiles)];

        if (uniqueFiles.length > 0) {
            output += `✅ ${uniqueFiles.length} টি সম্পর্কিত ফাইল পাওয়া গেছে।\n`;
            uniqueFiles.slice(0, 4).forEach(f => {
                output += analyzeFileLogic(f);
            });
            if (uniqueFiles.length > 4) {
                output += `\n... আরও ${uniqueFiles.length - 4} টি ফাইল জড়িত আছে।`;
            }
        } else {
            const pkgPath = path.join(rootPath, 'package.json');
            let foundInPkg = false;
            if(fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath));
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                const matchedDeps = Object.keys(deps).filter(d => d.includes(keyword) || keyword.includes(d));
                if (matchedDeps.length > 0) {
                    output += `✅ সোর্স কোডে ফাইল পাওয়া যায়নি, তবে package.json-এ ${matchedDeps.length} টি ডিপেন্ডেন্সি পাওয়া গেছে:\n`;
                    matchedDeps.forEach(d => output += `📦 ${d}: ${deps[d]}\n`);
                    foundInPkg = true;
                }
            }
            if (!foundInPkg) {
                output += `❌ '${keyword}' সম্পর্কিত কোনো লজিক, ফাইল বা ডিপেন্ডেন্সি সিস্টেমে পাওয়া যায়নি।`;
            }
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
