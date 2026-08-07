const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg'); 

const router = express.Router();

// প্রিজমার বদলে সরাসরি PG Pool ব্যবহার করা হচ্ছে
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ফাইলের কোড থেকে ডিজিটাল ফিঙ্গারপ্রিন্ট (Hash) তৈরির ফাংশন
function getHash(content) {
    return crypto.createHash('md5').update(content, 'utf8').digest('hex');
}

// ফোল্ডার ট্রি স্ক্যান করার ফাংশন 
function getDirTreeSync(dirPath, dbMap, updatesToPerform) {
    const result = [];
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const item of items) {
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
                        // কোড চেঞ্জ হয়নি! ডাটাবেসের অরিজিনাল টাইম বসানো হলো
                        fileMtime = new Date(dbRecord.updatedAt).getTime();
                    } else {
                        // কোড চেঞ্জ হয়েছে! ডাটাবেস আপডেট করার জন্য লাইনে দাঁড় করানো হলো
                        fileMtime = Date.now();
                        updatesToPerform.push({ filePath: relativePath, content: content, versionHash: hash, isNew: false, id: dbRecord.id });
                    }
                } else {
                    // একদম নতুন ফাইল!
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

// 1. পুরো ফোল্ডার স্ট্রাকচার পাঠানোর API 
router.get('/tree', async (req, res) => {
    try {
        const rootPath = path.join(__dirname, '..');
        
        // ১. PG দিয়ে ডাটাবেস থেকে পুরোনো ফাইলের হিস্ট্রি নিয়ে আসা
        const { rows } = await pool.query('SELECT id, "filePath", "versionHash", "updatedAt" FROM "FoundationSourceCodeHistory"');

        const dbMap = {};
        for (const record of rows) {
            dbMap[record.filePath] = record;
        }

        const updatesToPerform = [];
        
        // ২. ফোল্ডার ট্রি জেনারেট করা
        const tree = getDirTreeSync(rootPath, dbMap, updatesToPerform);

        // ৩. ব্যাকগ্রাউন্ডে ডাটাবেস আপডেট করা (Raw SQL দিয়ে)
        if (updatesToPerform.length > 0) {
            setTimeout(async () => {
                for (const update of updatesToPerform) {
                    try {
                        if (update.isNew) {
                            await pool.query(
                                'INSERT INTO "FoundationSourceCodeHistory" (id, "filePath", "content", "versionHash") VALUES ($1, $2, $3, $4)',
                                [crypto.randomUUID(), update.filePath, update.content, update.versionHash]
                            );
                        } else {
                            await pool.query(
                                'UPDATE "FoundationSourceCodeHistory" SET content = $1, "versionHash" = $2, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $3',
                                [update.content, update.versionHash, update.id]
                            );
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
        res.json({ success: true, hasError: false, file: null, errorLine: null });
    } catch (error) {
        res.json({ success: true, hasError: false });
    }
});

module.exports = router;
