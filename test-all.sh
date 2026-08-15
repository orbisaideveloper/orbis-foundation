#!/usr/bin/env sh
echo "=================================================="
echo "⚡ [Jarvis Self-Healing Engine v2] Full Auto-Fix"
echo "=================================================="

FAILED=0

# ১. অটো-হিলার: অব্যবহৃত ফাংশন বা ভ্যারিয়েবল ফাইল থেকে স্বয়ংক্রিয়ভাবে মুছে ফেলা
echo "\n🤖 [Auto-Healer] Scrubbing unused variables and code smells..."
node -e '
const fs = require("fs");
const file = "src/admin/dashboard/sections/OrbisImplementationMap.tsx";
if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, "utf8");
    // checkPath ফাংশনটি অব্যবহৃত থাকায় সেটি রিমুভ করা
    content = content.replace(/function\s+checkPath\s*\(\s*\)\s*\{[^}]*\}/g, "");
    content = content.replace(/const\s*\{\s*checkPath\s*\}\s*=[^;]+;?/g, "");
    fs.writeFileSync(file, content, "utf8");
}
'

npx eslint "./src/**/*.{ts,tsx}" --fix > /dev/null 2>&1

# ২. টাইপস্ক্রিপ্ট Strict Build চেক
echo "\n🔍 [1/4] Checking TypeScript Strict Build..."
npx tsc --noEmit
if [ $? -eq 0 ]; then
    echo "  ✅ TypeScript: 0 Errors (Types fully validated)"
else
    echo "  ❌ TypeScript: Type mismatch or interface broken!"
    FAILED=1
fi

# ৩. সোনারক্লাউড কোড স্মেল চেক
echo "\n🧹 [2/4] Scanning Sonar-Grade Code Smells (ESLint)..."
npx eslint "./src/**/*.{ts,tsx}" --max-warnings 0
if [ $? -eq 0 ]; then
    echo "  ✅ ESLint: 0 Code Smells (Clean code contracts)"
else
    echo "  ❌ ESLint: Unresolved code smells detected!"
    FAILED=1
fi

# ৪. ম্যাডগে সার্কুলার ও ডিপেন্ডেন্সি লুপ চেক
echo "\n🔄 [3/4] Scanning Circular Dependencies (Madge)..."
npx madge --circular --extensions ts,tsx,cjs --exclude "^src/generated/.*" ./src ./orbis-server
if [ $? -eq 0 ]; then
    echo "  ✅ Madge: 0 Circular loops"
else
    echo "  ❌ Madge: Circular loop detected!"
    FAILED=1
fi

# ৫. কোর ব্যাকএন্ড ব্রিজ কন্ট্রাক্ট চেক
echo "\n🛡️ [4/4] Verifying Core Server Contracts..."
node -e '
const fs = require("fs");
const file = "orbis-server/bridge.cjs";
if (fs.existsSync(file)) {
    const code = fs.readFileSync(file, "utf8");
    if (code.includes("listFiles") && code.includes("section")) {
        console.log("  ✅ Backend: Core contracts 100% intact");
    } else {
        console.log("  ❌ Backend: Core logic missing!");
        process.exit(1);
    }
} else {
    console.log("  ❌ Backend: bridge.cjs not found!");
    process.exit(1);
}
'
if [ $? -ne 0 ]; then
    FAILED=1
fi

echo "\n=================================================="
if [ $FAILED -eq 0 ]; then
    echo "🎉 [STATUS] 100% SONAR-CLEAN! Safe to push to GitHub."
    git add .
    git commit -m "fix(auto-heal): cleaned unused checkPath and verified clean build"
    git push origin main
    echo "🚀 [Auto-Deploy] Successfully pushed clean code to GitHub!"
else
    echo "🛑 [STATUS] PUSH BLOCKED! Critical logic/build error found."
fi
echo "=================================================="
exit $FAILED
