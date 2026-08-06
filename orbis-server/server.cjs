const { getDiagnostics, addSystemLog, setDbClient } = require('./telemetry-module.cjs');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const app = express();
app.use(cors());
app.use(express.json());

// 🟢 ডিপ ট্র্যাকিং সেন্সর (নাড়ি নক্ষত্র বের করার জন্য)
// যখনই কেউ কোনো রিকোয়েস্ট করবে, এটা সাথে সাথে লগে রেকর্ড করবে
app.use((req, res, next) => {
    // ডায়াগনস্টিক/হার্টবিটের রিকোয়েস্টগুলো লগ থেকে বাদ দিচ্ছি, নাহলে লগ ভরে যাবে
    if (!req.url.includes('/api/diagnostics') && !req.url.includes('/api/internal/log')) {
        console.log(`[NETWORK] ${req.method} Request incoming for route: ${req.url}`);
    }
    next();
});

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// 🟢 DB কানেকশন টেলিমেট্রি মডিউলে পাঠানো হচ্ছে
setDbClient(prisma);

app.post('/api/internal/log', (req, res) => {
    const { level, source, message } = req.body;
    if (message) addSystemLog(level, source, message);
    res.sendStatus(200);
});

app.get('/api/metrics', async (req, res) => {
    try {
        const latestMetric = await prisma.foundationAdminMetric.findFirst({
            orderBy: { recordedAt: 'desc' }
        });
        if (latestMetric) {
            res.json(latestMetric);
        } else {
            res.json({ ramUsageMb: 0, cpuLoad: 0, status: 'NO_DATA_YET' });
        }
    } catch (error) {
        console.error('[DB_ERROR] Failed to fetch metrics from Postgres');
        res.status(500).json({ error: 'Database connection failed' });
    }
});

const PORT = process.env.PORT || 3001;

app.get('/api/diagnostics', async (req, res) => {
    try {
        const diag = getDiagnostics();
        // সুপারবেস থেকে শেষ ১০০ লগ টানা হচ্ছে
        const dbLogs = await prisma.foundationSystemLog.findMany({
            take: 100,
            orderBy: { createdAt: 'desc' }
        });
        if (dbLogs && dbLogs.length > 0) {
            diag.logs = dbLogs.map(l => ({
                timestamp: l.timestamp,
                level: l.level,
                source: l.source,
                message: l.message
            }));
        }
        res.json(diag);
    } catch (error) {
        res.json(getDiagnostics()); // DB এরর দিলে র‍্যামের ব্যাকআপ লগ পাঠাবে
    }
});

app.listen(PORT, () => {
    console.log(`[LIFECYCLE] Backend API Server successfully booted on Port ${PORT}!`);
});
