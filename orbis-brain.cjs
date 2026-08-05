const http = require('http');
const fs = require('fs');

const prompt = process.argv[2];
const targetFile = process.argv[3];
const modelName = process.argv[4] || 'llama3';

if (!prompt) {
    console.log("⚠️ ব্যবহারবিধি: node orbis-brain.cjs 'আপনার প্রশ্ন' 'ফাইলের-নাম (ঐচ্ছিক)' 'মডেল-নাম (ঐচ্ছিক)'");
    process.exit(1);
}

let context = '';
if (targetFile && fs.existsSync(targetFile)) {
    context = `\n\n--- ${targetFile} ফাইলের কোড ---\n` + fs.readFileSync(targetFile, 'utf8');
}

const fullPrompt = prompt + context;

const options = {
    hostname: 'localhost',
    port: 11434,
    path: '/api/generate',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
};

const req = http.request(options, (res) => {
    res.setEncoding('utf8');
    process.stdout.write("🧠 ORBIS Brain: ");
    res.on('data', (chunk) => {
        try {
            const parsed = JSON.parse(chunk);
            if (parsed.response) process.stdout.write(parsed.response);
        } catch(e) {}
    });
    res.on('end', () => console.log('\n\n✅ [কমান্ড সম্পূর্ণ হয়েছে]'));
});

req.on('error', (e) => {
    console.error(`\n❌ Ollama-র সাথে কানেক্ট করা যাচ্ছে না!`);
    console.error(`Error: ${e.message}`);
});

req.write(JSON.stringify({
    model: modelName,
    prompt: fullPrompt,
    stream: true
}));
req.end();
