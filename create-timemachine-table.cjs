const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const query = `
CREATE TABLE IF NOT EXISTS "FoundationTimeMachine" (
    "id" TEXT NOT NULL,
    "commitId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoundationTimeMachine_pkey" PRIMARY KEY ("id")
);
`;

client.connect()
  .then(() => {
    console.log('⏳ Creating independent FoundationTimeMachine table...');
    return client.query(query);
  })
  .then(() => {
    console.log('✅ Success! "FoundationTimeMachine" table created.');
    client.end();
  })
  .catch(err => {
    console.error('❌ Error executing SQL:', err.message);
    client.end();
  });
