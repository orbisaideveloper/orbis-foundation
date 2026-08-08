#!/bin/bash

REPORT="orbis-reality-audit-$(date +%Y%m%d-%H%M%S).txt"

exec > >(tee "$REPORT") 2>&1

echo "======================================================="
echo "🧠 ORBIS REALITY AUDIT"
echo "======================================================="
echo "Time: $(date)"
echo "Project: $(pwd)"
echo

echo "========== 1. RUNTIME SERVICES =========="

if pgrep -x ollama >/dev/null; then
  echo "OLLAMA: REAL_RUNNING"
else
  echo "OLLAMA: NOT_RUNNING"
fi

if pgrep -x node >/dev/null; then
  echo "NODE: REAL_RUNNING"
else
  echo "NODE: NOT_RUNNING"
fi

echo
echo "========== 2. OLLAMA REAL TEST =========="

if command -v ollama >/dev/null 2>&1; then
  echo "OLLAMA_BINARY: AVAILABLE"
  ollama --version 2>&1
else
  echo "OLLAMA_BINARY: MISSING"
fi

if curl -sf http://127.0.0.1:11434/api/tags >/tmp/orbis-ollama.json 2>/dev/null; then
  echo "OLLAMA_API: REAL_RESPONDING"
  echo "MODELS:"
  cat /tmp/orbis-ollama.json
else
  echo "OLLAMA_API: NOT_RESPONDING"
fi

echo
echo "========== 3. NODE / NPM =========="

node --version 2>&1
npm --version 2>&1

echo
echo "========== 4. REQUIRED TOOLS =========="

for tool in git node npm npx ollama; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "$tool: AVAILABLE"
  else
    echo "$tool: MISSING"
  fi
done

echo
echo "========== 5. PROJECT PACKAGES =========="

for pkg in husky lint-staged eslint prettier vitest madge depcheck; do
  if npm list "$pkg" --depth=0 >/dev/null 2>&1; then
    echo "$pkg: INSTALLED"
  else
    echo "$pkg: NOT_INSTALLED"
  fi
done

echo
echo "========== 6. REAL PACKAGE VERSIONS =========="

npm list --depth=0 2>&1 | grep -E \
'husky|lint-staged|eslint|prettier|vitest|madge|depcheck|typescript'

echo
echo "========== 7. PACKAGE SCRIPTS =========="

node -e '
const p=require("./package.json");
console.log(JSON.stringify(p.scripts || {}, null, 2));
'

echo
echo "========== 8. GIT STATUS =========="

git status --short
echo
git branch --show-current
git log -1 --oneline

echo
echo "========== 9. HUSKY =========="

if [ -f .husky/pre-commit ]; then
  echo "HUSKY_PRE_COMMIT: EXISTS"
  sed -n '1,160p' .husky/pre-commit
else
  echo "HUSKY_PRE_COMMIT: MISSING"
fi

echo
echo "========== 10. REAL MADGE TEST =========="

if npm run check:circular; then
  echo "MADGE_RESULT: PASS"
else
  echo "MADGE_RESULT: FAIL"
fi

echo
echo "========== 11. REAL TYPE CHECK =========="

if npm run type-check; then
  echo "TYPECHECK_RESULT: PASS"
else
  echo "TYPECHECK_RESULT: FAIL"
fi

echo
echo "========== 12. REAL BUILD =========="

if npm run build; then
  echo "BUILD_RESULT: PASS"
else
  echo "BUILD_RESULT: FAIL"
fi

echo
echo "========== 13. REAL VITEST =========="

if npm run test:coverage; then
  echo "VITEST_RESULT: PASS"
else
  echo "VITEST_RESULT: FAIL"
fi

echo
echo "========== 14. AI HEALER REAL TEST =========="

if [ -f orbis-server/ai-healer.cjs ]; then
  echo "AI_HEALER_FILE: EXISTS"

  if curl -sf http://127.0.0.1:11434/api/tags >/dev/null; then
    echo "AI_HEALER_BACKEND: OLLAMA_AVAILABLE"
  else
    echo "AI_HEALER_BACKEND: OLLAMA_UNAVAILABLE"
  fi
else
  echo "AI_HEALER_FILE: MISSING"
fi

echo
echo "========== 15. TIME MACHINE FILES =========="

for f in \
  orbis-server/time-machine-api.cjs \
  src/admin/components/TimeMachine/TimeMachineCard.tsx \
  .github/workflows/orbis-ci.yml
do
  if [ -f "$f" ]; then
    echo "EXISTS: $f"
  else
    echo "MISSING: $f"
  fi
done

echo
echo "========== 16. SYSTEM TREE =========="

find src orbis-server -type f \
  ! -path '*/node_modules/*' \
  | sort | wc -l | xargs echo "SOURCE_FILE_COUNT:"

echo
echo "========== FINAL =========="
echo "REALITY_AUDIT_FILE: $REPORT"
echo "======================================================="
