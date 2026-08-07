const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // ফাইলের কোড হ্যাশ করার জন্য
const { PrismaClient } = require('@prisma/client'); // ডাটাবেসের সাথে কানেকশনের জন্য

const router = express.Router();
const prisma = new PrismaClient();

// ফাইলের কোড থেকে ডিজিটাল ফিঙ্গারপ্রিন্ট (Hash) তৈরির ফাংশন
function getHash(content) {
    return crypto.createHash('md5').update(content, 'utf8').digest('hex');
}

// ফোল্ডার ট্রি স্ক্যান করার ফাংশন (Smart DB Logic সহ)
function getDirTreeSync(dirPath, dbMap, updatesToPerform) {
    const result = [];
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
            // অপ্রয়োজনীয় ফোল্ডারগুলো স্কিপ করা
            if (['node_modules', '.git', '.agents', '.claude', '.windsurf', 'dist', 'build'].includes(item.name)) continue;
            
            const fullPath = path.join(dirPath, item.name);
            const relativePath = path.relative(path.join(__dirname, '..'), fullPath).replace(/\\/g, '/');
            const stats = fs.statSync(fullPath);
            
            if (item.isDirectory()) {
                const children = getDirTreeSync(fullPath, dbMap, updatesToPerform);
                if (children.length > 0) {
                    result.push({ 
                        name: item.name, type: 'directory', path: relativePath, 
                        mtime: stats.mtimeMs, children 
                    });
                }
            } else {
                const content = fs.readFileSync(fullPath, 'utf8');
                const hash = getHash(content);
                let fileMtime = stats.mtimeMs;
                const dbRecord = dbMap[relativePath];

                if (dbRecord) {
                    if (dbRecord.versionHash === hash) {
                        // কোড চেঞ্জ হয়নি! সার্ভারের নতুন টাইমের বদলে ডাটাবেসের অরিজিনাল টাইম বসানো হলো
                        fileMtime = new Date(dbRecord.updatedAt).getTime();
                    } else {
                        // কোড চেঞ্জ হয়েছে! ডাটাবেস আপডেট করার জন্য লাইনে দাঁড় করানো হলো
                        fileMtime = Date.now();
                        updatesToPerform.push({ filePath: relativePath, content: content, versionHash: hash, isNew: false, id: dbRecord.id });
                    }
                } else {
                    // একদম নতুন ফাইল! ডাটাবেসে ঢোকানোর জন্য লাইনে দাঁড় করানো হলো
                    fileMtime = Date.now();
                    updatesToPerform.push({ filePath: relativePath, content: content, versionHash: hash, isNew: true });
                }

                result.push({ 
                    name: item.name, type: 'file', path: relativePath, 
                    mtime: fileMtime 
                });
            }
        }
    } catch (error) {
        console.error("Error reading directory:", error.message);
    }
    return result;
}

// 1. পুরো ফোল্ডার স্ট্রাকচার পাঠানোর API (With DB Sync)
router.get('/tree', async (req, res) => {
    try {
        const rootPath = path.join(__dirname, '..');
        
        // ১. ডাটাবেস থেকে পুরোনো ফাইলের হিস্ট্রি নিয়ে আসা
        const dbRecords = await prisma.foundationSourceCodeHistory.findMany({
            select: { id: true, filePath: true, versionHash: true, updatedAt: true }
        });

        const dbMap = {};
        for (const record of dbRecords) {
            dbMap[record.filePath] = record;
        }

        const updatesToPerform = [];
        
        // ২. ফোল্ডার ট্রি জেনারেট করা
        const tree = getDirTreeSync(rootPath, dbMap, updatesToPerform);

        // ৩. ব্যাকগ্রাউন্ডে ডাটাবেস আপডেট করা (ফ্রন্টএন্ডকে না দাঁড় করিয়ে)
        if (updatesToPerform.length > 0) {
            setTimeout(async () => {
                for (const update of updatesToPerform) {
                    try {
                        if (update.isNew) {
                            await prisma.foundationSourceCodeHistory.create({
                                data: { filePath: update.filePath, content: update.content, versionHash: update.versionHash }
                            });
                        } else {
                            await prisma.foundationSourceCodeHistory.update({
                                where: { id: update.id },
                                data: { content: update.content, versionHash: update.versionHash, updatedAt: new Date() }
                            });
                        }
                    } catch (e) {
                        console.error(`DB Sync Error for ${update.filePath}:`, e.message);
                    }
                }
            }, 100);
        }

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
