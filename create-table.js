const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Supabase-এর রিমোট কানেকশনের জন্য
});

const query = `
CREATE TABLE IF NOT EXISTS "FoundationSourceCodeHistory" (
    "id" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "versionHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoundationSourceCodeHistory_pkey" PRIMARY KEY ("id")
);
`;

client.connect()
  .then(() => {
    console.log('⏳ Connecting to Supabase PostgreSQL...');
    return client.query(query);
  })
  .then(() => {
    console.log('✅ Success! "FoundationSourceCodeHistory" table created directly via PG.');
    client.end();
  })
  .catch(err => {
    console.error('❌ Error executing SQL:', err.message);
    client.end();
  });
