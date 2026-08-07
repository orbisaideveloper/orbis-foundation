const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

client.connect()
  .then(() => {
    console.log('⏳ Fetching table list from Supabase...');
    // ডাটাবেসের পাবলিক স্কিমার সব টেবিলের নাম আনার SQL কমান্ড
    return client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;");
  })
  .then((res) => {
    console.log('\n📊 আপনার ডাটাবেসের (Supabase) বর্তমান টেবিলগুলোর তালিকা:\n');
    res.rows.forEach((row, index) => {
      console.log(`${index + 1}. 📁 ${row.table_name}`);
    });
    console.log('\n✅ ভেরিফিকেশন কমপ্লিট!');
    client.end();
  })
  .catch(err => {
    console.error('❌ Error executing SQL:', err.message);
    client.end();
  });
