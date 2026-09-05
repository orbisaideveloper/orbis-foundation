const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { readFileSync, statSync } = require("node:fs");

const excludedPrefixes = [
  ".orbis-backup/",
  "coverage/",
  "test-results/",
  "playwright-report/",
  ".stryker-tmp/",
];

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

const hash = createHash("sha256");

for (const file of paths) {
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
