import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './src/generated/prisma/client.ts';
import * as dotenv from 'dotenv';

dotenv.config();

// Supabase কানেকশন স্ট্রিং দিয়ে পুল তৈরি করা
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// এডাপ্টার পাস করে প্রিজমা ক্লায়েন্ট ইনিশিয়ালাইজ করা
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Testing Database Connection with Driver Adapter...');

  // ১. ডাটাবেসে একটি ডেমো ডেটা সেভ করা
  const newMetric = await prisma.foundationAdminMetric.create({
    data: {
      ramUsageMb: 256.5,
      cpuLoad: 15.2,
      status: 'ONLINE',
    },
  });
  console.log('✅ Successfully inserted data:', newMetric);

  // ২. ডাটাবেস থেকে ডেটাগুলো পড়ে দেখানো
  const allMetrics = await prisma.foundationAdminMetric.findMany();
  console.log('✅ Fetched data from DB:', allMetrics);
}

main()
  .catch((e) => {
    console.error('❌ Error connecting to database:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
