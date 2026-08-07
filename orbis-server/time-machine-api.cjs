const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const router = express.Router();

// স্বাধীন ডাটাবেস কানেকশন
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ১. টাইম মেশিনে ডেটা সেভ করা এবং ১০০ লিমিট ক্রস করলে পুরনোটা ডিলিট করার লজিক
async function saveToTimeMachine(filePath, content) {
    try {
        const id = crypto.randomUUID();
        const commitId = crypto.randomUUID(); // নির্দিষ্ট আপডেটের ট্র্যাকিং আইডি
        
        // নতুন ভার্সনটি ইনসার্ট করা হচ্ছে
        await pool.query(
            'INSERT INTO "FoundationTimeMachine" (id, "commitId", "filePath", "content") VALUES ($1, $2, $3, $4)',
            [id, commitId, filePath, content]
        );

        // ১০০টির বেশি ভার্সন হয়ে গেলে অটো-ডিলিট (Garbage Collection)
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
        console.error('❌ Time Machine Save Error:', err.message);
    }
}

// ২. ফ্রন্টএন্ডের জন্য হিস্ট্রি বা টাইমলাইন পাঠানোর API
router.get('/history', async (req, res) => {
    try {
        const filePath = req.query.path;
        let queryStr = 'SELECT "commitId", "filePath", "createdAt" FROM "FoundationTimeMachine" ORDER BY "createdAt" DESC LIMIT 150';
        let queryParams = [];

        // যদি নির্দিষ্ট কোনো ফাইলের হিস্ট্রি চায়
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

// ৩. ফ্রন্টএন্ডে নির্দিষ্ট পুরনো ভার্সনের কোড পাঠানোর API (Diff-এর জন্য)
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

// মেইন সার্ভারে জোড়ার জন্য এক্সপোর্ট করা হচ্ছে
module.exports = { router, saveToTimeMachine };
