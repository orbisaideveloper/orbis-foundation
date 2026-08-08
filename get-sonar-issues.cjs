const https = require('https');

const token = process.env.SONAR_TOKEN;
const projectKey = 'orbisaideveloper_orbis-foundation';

if (!token) {
  console.error('❌ SONAR_TOKEN পাওয়া যায়নি!');
  process.exit(1);
}

const options = {
  hostname: 'sonarcloud.io',
  path: `/api/issues/search?componentKeys=${projectKey}&ps=100&statuses=OPEN,REOPENED`,
  method: 'GET',
  headers: {
    'Authorization': 'Basic ' + Buffer.from(token + ':').toString('base64')
  }
};

console.log('🔄 সোনারক্লাউডের লাইভ সার্ভার থেকে ইস্যুগুলো আনছি...\n');

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.errors) {
        console.error('❌ এরর:', response.errors[0].msg);
        return;
      }

      const issues = response.issues || [];
      console.log(`📌 সোনারক্লাউডে মোট ওপেন ইস্যু পাওয়া গেছে: ${issues.length} টি\n`);
      console.log('--------------------------------------------------');

      issues.forEach((issue, index) => {
        const file = issue.component.replace(`${projectKey}:`, '');
        console.log(`${index + 1}. [${issue.severity}] ${issue.message}`);
        console.log(`   📂 ফাইল: ${file} (লাইন: ${issue.line || 'N/A'})`);
        console.log(`   🏷️  টাইপ: ${issue.type} | কী: ${issue.key}`);
        console.log('--------------------------------------------------');
      });
    } catch (e) {
      console.error('❌ রেসপন্স প্রসেস করতে সমস্যা হয়েছে:', e.message);
    }
  });
});

req.on('error', (e) => console.error('❌ নেটওয়ার্ক এরর:', e.message));
req.end();
