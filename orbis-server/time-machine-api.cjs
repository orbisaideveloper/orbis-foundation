const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function saveToTimeMachine(filePath, content, commitId) {
    try {
        const id = crypto.randomUUID();
        const cid = commitId || crypto.randomUUID();
        
        await pool.query(
            'INSERT INTO "FoundationTimeMachine" (id, "commitId", "filePath", "content") VALUES ($1, $2, $3, $4)',
            [id, cid, filePath, content]
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
        const { filePath, content, commitId } = req.body;
        if (!filePath || !content) {
            return res.status(400).json({ success: false, message: 'filePath and content are required' });
        }

        await saveToTimeMachine(filePath, content, commitId);
        res.json({ success: true, message: 'TimeMachine record synced successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/history', async (req, res) => {
    try {
        const filePath = req.query.path;
        let queryStr = 'SELECT "commitId", "filePath", "createdAt" FROM "FoundationTimeMachine" ORDER BY "createdAt" DESC LIMIT 150';
        let queryParams = [];

        if (filePath) {
            queryStr = 'SELECT "commitId", "filePath", "createdAt" FROM "FoundationTimeMachine" WHERE "filePath" = $1 ORDER BY "createdAt" DESC LIMIT 100';
            queryParams.push(filePath);
        }

        const { rows } = await pool.query(queryStr, queryParams);
        res.json({ success: true, history: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/version', async (req, res) => {
    try {
        const { commitId, filePath } = req.query;
        if (!commitId || !filePath) {
            return res.status(400).json({ success: false, message: 'commitId and filePath required' });
        }

        const { rows } = await pool.query(
            'SELECT content, "createdAt" FROM "FoundationTimeMachine" WHERE "commitId" = $1 AND "filePath" = $2',
            [commitId, filePath]
        );
        
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Version not found' });
        
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = { router, saveToTimeMachine };
