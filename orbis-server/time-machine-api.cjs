const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function ensureSchema() {
    try {
        await pool.query(`
            ALTER TABLE "FoundationTimeMachine" 
            ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'SUCCESS',
            ADD COLUMN IF NOT EXISTS "errorMessage" TEXT DEFAULT '';
        `);
    } catch (e) {
        // Safe schema execution
    }
}
ensureSchema();

async function saveToTimeMachine(filePath, content, commitId, status, errorMessage) {
    try {
        const id = crypto.randomUUID();
        const cid = commitId || crypto.randomUUID();
        const buildStatus = status || 'SUCCESS';
        const buildErr = errorMessage || '';
        
        await pool.query(
            'INSERT INTO "FoundationTimeMachine" (id, "commitId", "filePath", "content", "status", "errorMessage") VALUES ($1, $2, $3, $4, $5, $6)',
            [id, cid, filePath, content, buildStatus, buildErr]
        );

        await pool.query(`
            DELETE FROM "FoundationTimeMachine"
            WHERE id IN (
                SELECT id FROM "FoundationTimeMachine"
                WHERE "filePath" = $1
                ORDER BY "createdAt" DESC
                OFFSET 100
            )
        `, [filePath]);
        
    } catch (err) {
        console.error('❌ [TimeMachine Module] Save Error:', err.message);
    }
}

router.post('/sync', async (req, res) => {
    try {
        const { filePath, content, commitId, status, errorMessage } = req.body;
        if (!filePath || !content) {
            return res.status(400).json({ success: false, message: 'filePath and content required' });
        }

        await saveToTimeMachine(filePath, content, commitId, status, errorMessage);
        res.json({ success: true, message: 'TimeMachine record synced successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/history', async (req, res) => {
    try {
        const queryStr = 'SELECT "commitId", "filePath", "createdAt", "status", "errorMessage" FROM "FoundationTimeMachine" ORDER BY "createdAt" DESC LIMIT 150';
        const { rows } = await pool.query(queryStr);
        res.json({ success: true, history: rows || [] });
    } catch (error) {
        try {
            const fallbackStr = 'SELECT "commitId", "filePath", "createdAt" FROM "FoundationTimeMachine" ORDER BY "createdAt" DESC LIMIT 150';
            const { rows } = await pool.query(fallbackStr);
            res.json({ success: true, history: rows || [] });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
});

router.get('/version', async (req, res) => {
    try {
        const { commitId, filePath } = req.query;
        if (!commitId || !filePath) {
            return res.status(400).json({ success: false, message: 'commitId and filePath required' });
        }

        const { rows } = await pool.query(
            'SELECT content, "createdAt", "status", "errorMessage" FROM "FoundationTimeMachine" WHERE "commitId" = $1 AND "filePath" = $2 LIMIT 1',
            [commitId, filePath]
        );
        
        if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Version not found' });
        
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = { router, saveToTimeMachine };
