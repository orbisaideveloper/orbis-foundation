const fs = require('fs');
const { execSync } = require('child_process');

console.log("🛡️ [Orbis Pro Guard] Leveraging internal project parsers for deep logic verification...");

let hasError = false;

const bridgeFile = 'orbis-server/bridge.cjs';
if (fs.existsSync(bridgeFile)) {
    const code = fs.readFileSync(bridgeFile, 'utf8');
    if (!code.includes('listFiles') && !code.includes('section')) {
        console.log("❌ [Logic Mismatch] Core contract in bridge.cjs is altered or missing!");
        hasError = true;
    }
}

try {
    execSync('npx madge --circular --extensions ts,tsx,cjs --exclude "^src/generated/.*" ./src ./orbis-server', { stdio: 'ignore' });
} catch (e) {
    console.log("❌ [Parser Error] Structural logic or circular dependency detected in source code!");
    hasError = true;
}

if (hasError) {
    console.log("🛑 [Orbis Pro Guard] Commit blocked due to logic or structure mismatch.");
    process.exit(1);
} else {
    process.exit(0);
}
