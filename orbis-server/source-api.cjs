const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

// আমাদের স্বাধীন টাইম মেশিন লিগো ব্লক ইমপোর্ট করা হলো
const { router: timeMachineRouter, saveToTimeMachine } = require('./time-machine-api.cjs');

const router = express.Router();

// টাইম মেশিনের স্বাধীন রাউট কানেক্ট করা হলো (যেমন: /api/source/time-machine/history)
router.use('/time-machine', timeMachineRouter);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

function getHash(content) {
    return crypto.createHash('md5').update(content, 'utf8').digest('hex');
}

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
                        fileMtime = new Date(dbRecord.updatedAt).getTime();
                    } else {
                        fileMtime = Date.now();
                        updatesToPerform.push({ filePath: relativePath, content: content, versionHash: hash, isNew: false, id: dbRecord.id });
                    }
                } else {
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

router.get('/tree', async (req, res) => {
    try {
        const rootPath = path.join(__dirname, '..');
        
        const { rows } = await pool.query('SELECT id, "filePath", "versionHash", "updatedAt" FROM "FoundationSourceCodeHistory"');

        const dbMap = {};
        for (const record of rows) {
            dbMap[record.filePath] = record;
        }

        const updatesToPerform = [];
        const tree = getDirTreeSync(rootPath, dbMap, updatesToPerform);

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

                        // 🚀 নতুন কোড চেঞ্জ হলেই সাথে সাথে টাইম মেশিনেও সেভ হবে!
                        await saveToTimeMachine(update.filePath, update.content);

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
