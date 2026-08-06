const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// ফোল্ডার ট্রি স্ক্যান করার ফাংশন (node_modules এবং .git বাদ দিয়ে)
function getDirTree(dirPath) {
    const result = [];
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            if (item.name === 'node_modules' || item.name === '.git' || item.name === '.agents') continue;
            
            const fullPath = path.join(dirPath, item.name);
            const relativePath = path.relative(path.join(__dirname, '..'), fullPath);
            
            if (item.isDirectory()) {
                result.push({ 
                    name: item.name, 
                    type: 'directory', 
                    path: relativePath, 
                    children: getDirTree(fullPath) 
                });
            } else {
                result.push({ 
                    name: item.name, 
                    type: 'file', 
                    path: relativePath 
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
        const rootPath = path.join(__dirname, '..'); // প্রজেক্টের মেইন ফোল্ডার
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
        
        // সিকিউরিটি চেক (যাতে প্রজেক্টের বাইরের ফাইল কেউ পড়তে না পারে)
        if (!resolvedPath.startsWith(rootPath) || !fs.existsSync(resolvedPath)) {
            return res.status(404).json({ success: false, message: 'File not found or access denied' });
        }
        
        const content = fs.readFileSync(resolvedPath, 'utf8');
        res.json({ success: true, content });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
