const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const patterns = [
  ["OpenAI-style key", /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub classic token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["Hard-coded Sonar token", /\bSONAR_TOKEN\s*=\s*["'][^"'$\n]{16,}["']/g],
  ["Literal PostgreSQL password URL", /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s$"{]+@[^\s"']+/g],
];

const allowPath = (file) =>
  !file.startsWith("node_modules/") &&
  !file.startsWith("dist/") &&
  !file.startsWith("coverage/") &&
  !file.endsWith("package-lock.json") &&
  !file.includes("__snapshots__");

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter(allowPath);

const findings = [];
for (const file of files) {
  let stat;
  try { stat = fs.statSync(file); } catch { continue; }
  if (!stat.isFile() || stat.size > 1_000_000) continue;

  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
  if (text.includes("\u0000")) continue;

  for (const [name, pattern] of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const line = text.slice(0, match.index).split("\n").length;
      findings.push({ file, line, name });
    }
  }
}

if (findings.length) {
  console.error("SECRET GUARD: FAIL");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} — ${finding.name}`);
  }
  console.error("Secret values are intentionally not printed.");
  process.exit(1);
}

console.log(`SECRET GUARD: PASS (${files.length} tracked files inspected; secret values are never printed)`);
