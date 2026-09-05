#!/usr/bin/env bash
set -Eeuo pipefail

: "${SONAR_TOKEN:?SONAR_TOKEN is required in the environment.}"

ORG_KEY="orbis"
PROJECT_KEY="orbisaideveloper_orbis-foundation"

echo "🔍 Fetching live SonarCloud issues for ${PROJECT_KEY}..."
RESPONSE="$(
  curl --fail --silent --show-error     -u "${SONAR_TOKEN}:"     "https://sonarcloud.io/api/issues/search?componentKeys=${PROJECT_KEY}&ps=100&statuses=OPEN,REOPENED"
)"

node -e '
const input = require("fs").readFileSync(0, "utf8");
const response = JSON.parse(input);
const issues = response.issues || [];
console.log(`Open issues returned: ${issues.length}`);
for (const [index, issue] of issues.entries()) {
  const file = String(issue.component || "").replace(/^orbisaideveloper_orbis-foundation:/, "");
  console.log(`${index + 1}. [${issue.severity || "UNKNOWN"}] ${issue.message}`);
  console.log(`   ${file}${issue.line ? `:${issue.line}` : ""}`);
}
' <<<"$RESPONSE"

echo "✅ SonarCloud live issue fetch completed."
