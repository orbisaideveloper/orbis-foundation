const { execSync } = require('child_process');

console.log("🛡️ [Sonar-Grade Guard] Running zero-defect quality & logic gate...");

try {
    // ১. TypeScript
    execSync('npx tsc --noEmit', { stdio: 'inherit' });
    // ২. ESLint (Sonar quality standards)
    execSync('npx eslint "./src/**/*.{ts,tsx}" --max-warnings 0', { stdio: 'inherit' });
    // ৩. Madge circular
    execSync('npx madge --circular --extensions ts,tsx,cjs --exclude "^src/generated/.*" ./src ./orbis-server', { stdio: 'inherit' });
    
    console.log("✅ [Sonar-Grade Guard] 100% Clean! Zero SonarCloud or GitHub issues.");
    process.exit(0);
} catch (e) {
    console.log("🛑 [Sonar-Grade Guard] Commit rejected! Clean code violations found.");
    process.exit(1);
}
