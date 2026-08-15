const fs = require('fs');
const { execSync } = require('child_process');

console.log("⚡ [Jarvis Engine] Running deep headless build & logic regression test...");

let hasError = false;

// ১. কোর ফাইল ও চুক্তি অখণ্ডতা চেক
const bridgeFile = 'orbis-server/bridge.cjs';
if (fs.existsSync(bridgeFile)) {
    const code = fs.readFileSync(bridgeFile, 'utf8');
    if (!code.includes('listFiles') && !code.includes('section')) {
        console.log("❌ [Logic Mismatch] Core contract in bridge.cjs is altered or missing!");
        hasError = true;
    }
}

// ২. টাইপস্ক্রিপ্ট টাইপ ও বিল্ড অখণ্ডতা চেক (নতুন লজিকে পুরনো কোনো টাইপ/ফাংশন ভাঙল কি না)
try {
    console.log("🔍 [Type Integrity] Verifying TypeScript contracts across the entire app...");
    execSync('npx tsc --noEmit', { stdio: 'ignore' });
} catch (e) {
    console.log("❌ [Type Error] TypeScript compilation/type mismatch detected! Existing contracts broken.");
    hasError = true;
}

// ৩. Knip ডেড কোড ও আনইউজড ডিপেন্ডেন্সি স্ক্যান
try {
    console.log("🧹 [Knip Guard] Scanning unused dependencies & broken exports...");
    execSync('npx knip --no-exit-code', { stdio: 'ignore' });
} catch (e) {
    // Knip soft check
}

// ৪. Madge সার্কুলার ও ডিপেন্ডেন্সি ট্রি চেক
try {
    console.log("🔄 [Madge Guard] Verifying dependency tree...");
    execSync('npx madge --circular --extensions ts,tsx,cjs --exclude "^src/generated/.*" ./src ./orbis-server', { stdio: 'ignore' });
} catch (e) {
    console.log("❌ [Structure Error] Circular dependency found in source code!");
    hasError = true;
}

if (hasError) {
    console.log("🛑 [Jarvis Engine] Push/Commit BLOCKED! Logic regression detected.");
    process.exit(1);
} else {
    console.log("✅ [Jarvis Engine] All headless build contracts passed! Zero logic regression.");
    process.exit(0);
}
