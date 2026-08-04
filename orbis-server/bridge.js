const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// --- ১. আপনার পুরানো লজিক (১০০% অক্ষত) ---
function getDirectoryTree(dirPath, indent = '') {
    let result = '';
    const items = fs.readdirSync(dirPath);
    items.forEach(item => {
        if (item === 'node_modules' || item.startsWith('.')) return;
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            result += `${indent}📁 ${item}/\n`;
            result += getDirectoryTree(fullPath, indent + '  │  ');
        } else {
            result += `${indent}  📄 ${item}\n`;
        }
    });
    return result;
}

// --- ২. নতুন স্মার্ট ডায়াগনস্টিক লজিক ---
function searchCodeFiles(dir, keyword, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        if (item === 'node_modules' || item.startsWith('.')) continue;
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
            report += `- [VOICE] SpeechRecognition API ব্যবহার করা হয়েছে। সার্ভারে HTTPS না থাকলে ব্রাউজার মাইক্রোফোন ব্লক করে দেয়, যা কাজ না করার মূল কারণ হতে পারে।\n`;
            issueFound = true;
        }
        if (content.includes('alert(')) {
            report += `- [UI] alert() ফাংশন কোডের ফ্লো ব্লক করে দেয়।\n`;
            issueFound = true;
        }
        if (content.match(/catch\s*\(/)) {
            report += `- [LOGIC] try-catch এরর হ্যান্ডলিং আছে। Error console-এ চেক করুন।\n`;
            issueFound = true;
        }
        if (filePath.endsWith('.tsx') && !content.includes('useState')) {
             report += `- [STATE] এটি একটি স্ট্যাটিক কম্পোনেন্ট, কোনো লোকাল স্টেট (useState) নেই।\n`;
        }
        if (!issueFound) {
            report += `- কোনো বেসিক লজিক্যাল ত্রুটি চোখে পড়েনি। স্ট্রাকচার ঠিক আছে।\n`;
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

    // আপনার পুরোনো ট্রি কমান্ড
    if (command.includes('ট্রি') || command.includes('ফোল্ডার') || command.includes('tree')) {
        output += `--- LIVE SOURCE CODE DIRECTORY ---\n\n` + getDirectoryTree(rootPath);
    } 
    // আপনার পুরোনো ডিপেন্ডেন্সি কমান্ড
    else if (command.includes('কানেকশন') || command.includes('ডিপেন্ডেন্সি')) {
        output += `--- DEPENDENCY MAP ---\n\n`;
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(rootPath, 'package.json')));
            output += JSON.stringify(pkg.dependencies, null, 2);
        } catch (e) {
            output += `Error: ${e.message}\n`;
        }
    } 
    // --- নতুন ডায়াগনস্টিক কমান্ড ---
    else if (command.includes('কেন') || command.includes('কাজ') || command.includes('ফাইল') || command.includes('জড়িত') || command.includes('প্রবলেম') || command.includes('অসুবিধা') || command.includes('কিভাবে')) {
        output += `--- 🧠 ORBIS CODE DIAGNOSTIC ---\n\n`;
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
    // আপনার পুরোনো ডিফল্ট কমান্ড
    else {
        output += `Command Received: "${command}"\nTry asking: "সোর্স ট্রি দেখাও" or "ডিপেন্ডেন্সি দেখাও"`;
    }

    res.json({ result: output });
});

app.listen(3001, () => console.log(`ORBIS Local Bridge running on port 3001`));
