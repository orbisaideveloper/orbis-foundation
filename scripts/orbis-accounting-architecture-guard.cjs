const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const violations = [];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function importsOf(source) {
  const found = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) found.push(match[1]);
  }
  return found;
}

function check(file, predicate, message) {
  if (!fs.existsSync(path.join(root, file))) return;
  for (const specifier of importsOf(read(file))) {
    if (predicate(specifier)) violations.push(`${file}: ${message}: ${specifier}`);
  }
}

const serverAccounting = [
  "orbis-server/lottery-accounting-core.cjs",
  "orbis-server/lottery-accounting-service.cjs",
  "orbis-server/lottery-accounting-api.cjs",
];

for (const file of serverAccounting) {
  check(
    file,
    (specifier) => specifier.startsWith("../src") || specifier.startsWith("./src"),
    "server accounting must not import frontend source",
  );
}

check(
  "orbis-server/lottery-accounting-core.cjs",
  (specifier) =>
    specifier.includes("lottery-accounting-service") ||
    specifier.includes("lottery-accounting-api") ||
    specifier.includes("bridge") ||
    specifier.includes("prisma"),
  "pure accounting core must not depend on service/API/runtime persistence",
);

const frontendAccounting = [
  "src/admin/models/lotteryAccountingClient.ts",
  "src/admin/models/lotteryAccountingTypes.ts",
  "src/admin/dashboard/sections/LotteryAccountingWorkspace.tsx",
];

for (const file of frontendAccounting) {
  check(
    file,
    (specifier) => specifier.includes("orbis-server"),
    "frontend accounting must not import server implementation",
  );
}

check(
  "src/admin/models/lotteryAccountingClient.ts",
  (specifier) => specifier.includes("/dashboard/") || specifier.startsWith("../dashboard"),
  "model client must not depend on dashboard UI",
);

if (violations.length) {
  console.error("ACCOUNTING ARCHITECTURE GUARD: FAIL");
  for (const item of violations) console.error(`- ${item}`);
  process.exit(1);
}

console.log("ACCOUNTING ARCHITECTURE GUARD: PASS");
console.log("Checked server/core/frontend dependency direction for the Lottery Accounting boundary.");
