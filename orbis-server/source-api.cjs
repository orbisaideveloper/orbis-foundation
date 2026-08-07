const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// ফোল্ডার ট্রি স্ক্যান করার ফাংশন (Modified Time বা mtime সহ)
function getDirTree(dirPath) {
    const result = [];
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            // অপ্রয়োজনীয় ফোল্ডারগুলো স্কিপ করা
            if (['node_modules', '.git', '.agents', '.claude', '.windsurf', 'dist', 'build'].includes(item.name)) continue;
            
            const fullPath = path.join(dirPath, item.name);
            const relativePath = path.relative(path.join(__dirname, '..'), fullPath);
            const stats = fs.statSync(fullPath);
            
            if (item.isDirectory()) {
                const children = getDirTree(fullPath);
                if (children.length > 0) {
                    result.push({ 
                        name: item.name, type: 'directory', path: relativePath, 
                        mtime: stats.mtimeMs, children 
                    });
                }
            } else {
                result.push({ 
                    name: item.name, type: 'file', path: relativePath, 
                    mtime: stats.mtimeMs 
                });
            }
        }
    } catch (error) {
        console.error("Error reading directory:", error.message);
    }
    return result;
}

// 1. পুরো ফোল্ডার স্ট্রাকচার পাঠানোর API
router.get('/tree', (req, res) => {
    try {
        const rootPath = path.join(__dirname, '..');
        const tree = getDirTree(rootPath);
        res.json({ success: true, tree });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. নির্দিষ্ট ফাইলের সোর্স কোড পাঠানোর API
router.get('/file', (req, res) => {
    try {
        const requestedPath = req.query.path;
        if (!requestedPath) return res.status(400).json({ success: false, message: 'File path is required' });
        
        const rootPath = path.join(__dirname, '..');
        const resolvedPath = path.join(rootPath, requestedPath);
        
        if (!resolvedPath.startsWith(rootPath) || !fs.existsSync(resolvedPath)) {
            return res.status(404).json({ success: false, message: 'File not found or access denied' });
        }
        
        const content = fs.readFileSync(resolvedPath, 'utf8');
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. রিয়েল এরর স্ট্যাটাস পাঠানোর API
router.get('/status', (req, res) => {
    try {
        const crashReportPath = path.join(__dirname, '..', 'crash-report.json');
        if (fs.existsSync(crashReportPath)) {
            const crashData = JSON.parse(fs.readFileSync(crashReportPath, 'utf8'));
            return res.json({ success: true, hasError: true, file: crashData.file, errorLine: crashData.line });
        }
        // কোনো এরর ফাইল না থাকলে ১০০% ক্লিন স্ট্যাটাস
        res.json({ success: true, hasError: false, file: null, errorLine: null });
    } catch (error) {
        res.json({ success: true, hasError: false }); // ফেইল করলেও ফ্রন্টএন্ড ক্র্যাশ করবে না
    }
});

module.exports = router;
