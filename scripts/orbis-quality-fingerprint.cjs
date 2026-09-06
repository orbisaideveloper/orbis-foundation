const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { readFileSync, statSync } = require("node:fs");

const excludedPrefixes = [
  ".orbis-backup/",
  ".orbis-backups/",
  "coverage/",
  "test-results/",
  "playwright-report/",
  ".stryker-tmp/",
];

const UBUNTU_STAGES = [
  "preflight",
  "knip",
  "jscpd",
  "playwright-smoke",
  "playwright-visual",
];

const TERMUX_STAGES = [
  "preflight",
  "secrets",
  "architecture",
  "accounting",
  "circular",
  "lint",
  "type",
  "audit",
  "build",
  "mutation",
  "db-drift",
  "coverage",
];

function usage() {
  console.error(
    "Usage: node scripts/orbis-quality-fingerprint.cjs [--stage PIPELINE STAGE]",
  );
  process.exit(2);
}

const args = process.argv.slice(2);
let scope = null;

if (args.length === 0) {
  scope = null;
} else if (args.length === 3 && args[0] === "--stage") {
  const pipeline = args[1];
  const stage = args[2];
  const stages =
    pipeline === "UBUNTU"
      ? UBUNTU_STAGES
      : pipeline === "TERMUX"
        ? TERMUX_STAGES
        : null;
  if (!stages || !stages.includes(stage)) usage();
  scope = { pipeline, stage };
} else {
  usage();
}

const output = execFileSync(
  "git",
  ["ls-files", "-co", "--exclude-standard", "-z"],
  { encoding: "buffer" },
);

const paths = output
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .filter((file) => !excludedPrefixes.some((prefix) => file.startsWith(prefix)))
  .sort();

const isPackageInput = (file) =>
  file === "package.json" || file === "package-lock.json";

const isRunnerInput = (file) =>
  file.startsWith("scripts/orbis-quality-") ||
  file === "scripts/orbis-report-run.sh";

const isSource = (file) =>
  file.startsWith("src/") || file.startsWith("orbis-server/");

const isTest = (file) =>
  file.startsWith("tests/") || file.includes("/__tests__/");

const isCodeLike = (file) =>
  /\.(?:[cm]?[jt]sx?|css|scss|html|json|mjs|cjs|sh|sql|prisma|ya?ml)$/.test(
    file,
  );

function stageIncludes(file, { pipeline, stage }) {
  if (pipeline === "UBUNTU") {
    switch (stage) {
      case "preflight":
        return (
          isPackageInput(file) ||
          file === "scripts/orbis-quality-ubuntu.sh" ||
          file === "scripts/orbis-quality-ubuntu-setup.sh" ||
          file === "scripts/orbis-quality-fingerprint.cjs" ||
          file === "scripts/orbis-quality-state.sh"
        );
      case "knip":
        return true;
      case "jscpd":
        return (
          file === ".jscpd.json" ||
          file.startsWith("src/") ||
          file.startsWith("orbis-server/")
        );
      case "playwright-smoke":
      case "playwright-visual":
        return (
          isPackageInput(file) ||
          isSource(file) ||
          file.startsWith("tests/e2e/") ||
          file === "playwright.mobile.config.ts" ||
          file === "vite.config.ts" ||
          file === "tailwind.config.js" ||
          file === "postcss.config.js" ||
          file === "index.html"
        );
      default:
        return false;
    }
  }

  switch (stage) {
    case "preflight":
      return isPackageInput(file) || isRunnerInput(file);
    case "secrets":
      return isCodeLike(file) || file === ".env.example";
    case "architecture":
      return (
        isPackageInput(file) ||
        isSource(file) ||
        file === "scripts/orbis-accounting-architecture-guard.cjs"
      );
    case "accounting":
      return (
        isPackageInput(file) ||
        isSource(file) ||
        isTest(file) ||
        file === "vitest.config.ts" ||
        file === "stryker.accounting.config.mjs"
      );
    case "circular":
      return isPackageInput(file) || isSource(file);
    case "lint":
      return (
        isPackageInput(file) ||
        isSource(file) ||
        isTest(file) ||
        file.startsWith("scripts/") ||
        file === ".eslintrc.json" ||
        file === ".eslintignore"
      );
    case "type":
      return (
        isPackageInput(file) ||
        /\.(?:ts|tsx|mts|cts)$/.test(file) ||
        file.startsWith("tsconfig")
      );
    case "audit":
      return isPackageInput(file);
    case "build":
      return (
        isPackageInput(file) ||
        isSource(file) ||
        file === "vite.config.ts" ||
        file === "tailwind.config.js" ||
        file === "postcss.config.js" ||
        file === "index.html"
      );
    case "mutation":
      return (
        isPackageInput(file) ||
        isSource(file) ||
        isTest(file) ||
        file === "stryker.accounting.config.mjs" ||
        file === "vitest.config.ts"
      );
    case "db-drift":
      return (
        isPackageInput(file) ||
        file.startsWith("prisma/") ||
        file === "prisma.config.ts" ||
        file === "scripts/orbis-db-drift-check.sh"
      );
    case "coverage":
      return (
        isPackageInput(file) ||
        isSource(file) ||
        isTest(file) ||
        file === "vitest.config.ts"
      );
    default:
      return false;
  }
}

const selected = scope ? paths.filter((file) => stageIncludes(file, scope)) : paths;

const hash = createHash("sha256");

if (scope) {
  hash.update(`ORBIS_STAGE_SCOPE_V2\0${scope.pipeline}\0${scope.stage}\0`);
}

for (const file of selected) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    continue;
  }
  if (!stat.isFile()) continue;
  hash.update(file);
  hash.update("\0");
  hash.update(readFileSync(file));
  hash.update("\0");
}

process.stdout.write(hash.digest("hex"));
