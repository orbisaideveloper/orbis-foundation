const { getDiagnostics, addSystemLog } = require('./telemetry-module.cjs');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const app = express();
app.use(cors());
app.use(express.json());

// Prisma-এর রিকোয়ারমেন্ট অনুযায়ী ডাটাবেস অ্যাডাপ্টার সেটআপ
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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
        console.error('❌ Error fetching metrics:', error);
        res.status(500).json({ error: 'Database connection failed' });
    }
});

const PORT = process.env.PORT || 3001;

// 🟢 System Diagnostic Route (Fixed & Clean)
app.get('/api/diagnostics', (req, res) => {
    res.json(getDiagnostics());
});

app.listen(PORT, () => {
    console.log(`\n🚀 Backend API Server is ready for Render!`);
});
