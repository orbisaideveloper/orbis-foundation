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

        const imports = content.match(/import.*from.*/g) || [];
        report += `🔗 ফাইলের ডিপেন্ডেন্সি:\n${imports.length > 0 ? imports.join('\n') : 'কোনো ইম্পোর্ট নেই'}\n\n`;

        report += `🛠️ ডায়াগনস্টিক রিপোর্ট:\n`;
        let issueFound = false;

        if (content.includes('SpeechRecognition')) {
            report += `- [VOICE] SpeechRecognition API ব্যবহার করা হয়েছে। সার্ভারে HTTPS না থাকলে ব্রাউজার মাইক্রোফোন ব্লক করে দেয়।\n`;
            issueFound = true;
        }
        if (content.includes('alert(')) {
            report += `- [UI] alert() ফাংশন কোডের ফ্লো ব্লক করে দেয়।\n`;
            issueFound = true;
        }
        if (content.match(/catch\s*\(/)) {
            report += `- [LOGIC] try-catch এরর হ্যান্ডলিং আছে।\n`;
            issueFound = true;
        }
        if (filePath.endsWith('.tsx') && !content.includes('useState')) {
            report += `- [STATE] এটি একটি স্ট্যাটিক কম্পোনেন্ট, কোনো লোকাল স্টেট নেই।\n`;
        }
        if (!issueFound) {
            report += `- কোনো বেসিক লজিক্যাল ত্রুটি চোখে পড়েনি।\n`;
        }
        return report;
    } catch (e) {
        return `\n[ERROR] স্ক্যান করতে সমস্যা: ${e.message}\n`;
    }
}

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
    else if (command.includes('কেন') || command.includes('কাজ') || command.includes('ফাইল') || command.includes('জড়িত') || command.includes('প্রবলেম') || command.includes('অসুবিধা') || command.includes('কিভাবে')) {
        output += `--- 🧠 ORBIS CODE DIAGNOSIC ---\n\n`;
        let keyword = '';
        const cmdLower = command.toLowerCase();

        if (cmdLower.includes('ভয়েস') || cmdLower.includes('কমান্ড বার')) keyword = 'CommandBar';
        else if (cmdLower.includes('ড্যাশবোর্ড') || cmdLower.includes('মডেল')) keyword = 'Dashboard';
        else keyword = command.split(' ').find(w => w.length > 3) || 'App';

        output += `🔍 '${keyword}' মডিউলের জন্য সোর্স কোড স্ক্যান করা হচ্ছে...\n`;

        const foundFiles = searchCodeFiles(srcPath, keyword);
        const uniqueFiles = [...new Set(foundFiles)];

        if (uniqueFiles.length > 0) {
            output += `✅ ${uniqueFiles.length} টি সম্পর্কিত ফাইল পাওয়া গেছে।\n`;
            uniqueFiles.slice(0, 2).forEach(f => {
                output += analyzeFileLogic(f);
            });
            if (uniqueFiles.length > 2) {
                output += `\n... আরও ${uniqueFiles.length - 2} টি ফাইল জড়িত আছে।`;
            }
        } else {
            output += `❌ '${keyword}' সম্পর্কিত কোনো ফাইল বা লজিক পাওয়া যায়নি।`;
        }
    }
    else {
        output += `Command Received: "${command}"\nTry asking: "সোর্স ট্রি দেখাও" or "ডিপেন্ডেন্সি দেখাও"`;
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
