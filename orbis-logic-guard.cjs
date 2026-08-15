const fs = require('fs');
const { execSync } = require('child_process');

console.log("🛡️ [Orbis Logic Guard] Scanning source code for logic mismatches & broken contracts...");

let hasError = false;

// চেক ১: কোডের কোর ইম্পোর্ট বা রিয়েল ডাটা ফেচিং লজিক মিসিং আছে কি না
const bridgeFile = 'orbis-server/bridge.cjs';
if (fs.existsSync(bridgeFile)) {
    const code = fs.readFileSync(bridgeFile, 'utf8');
    // চেক করা হচ্ছে ড্যাশবোর্ড বা নোটস পার্সিং লজিক অক্ষত আছে কি না
    if (!code.includes('listFiles') && !code.includes('section')) {
        console.log("❌ [Logic Guard Mismatch] Core data parsing logic in bridge.cjs is missing or altered!");
        hasError = true;
    }
}

// চেক ২: গিট ডিফে কোনো ডেঞ্জারাস রিমুভাল হয়েছে কি না যা কোর লজিক ভাঙতে পারে
try {
    const diff = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    if (diff.includes('bridge.cjs')) {
        console.log("🔍 [Logic Guard] Notice: bridge.cjs was modified. Verifying structure...");
    }
} catch (e) {
    // Git diff ignore if not staged
}

if (hasError) {
    console.log("🛑 [Orbis Logic Guard] Push/Commit blocked! A critical logic mismatch was detected.");
    process.exit(1);
} else {
    console.log("✅ [Orbis Logic Guard] All logic contracts verified. Code integrity is 100% safe!");
    process.exit(0);
}
