#!/data/data/com.termux/files/usr/bin/bash

# ORBIS Audit Report Generator
# Creates the next sequential audit report.
#
# Usage:
#   ./scripts/new-audit.sh
#
# Optional:
#   ./scripts/new-audit.sh "Gemini" "Task description"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AUDIT_DIR="$PROJECT_ROOT/docs/AUDIT_REPORTS"

mkdir -p "$AUDIT_DIR"

DATE="$(date '+%Y-%m-%d')"
TIME="$(date '+%H:%M:%S %Z')"

IMPLEMENTER="${1:-TBD}"
TASK="${2:-TBD}"

LAST_NUMBER="$(
    find "$AUDIT_DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9]_*.md' \
    -printf '%f\n' 2>/dev/null |
    sed -E 's/^([0-9]{3})_.*/\1/' |
    sort -n |
    tail -1
)"

if [ -z "$LAST_NUMBER" ]; then
    NEXT_NUMBER=1
else
    NEXT_NUMBER=$((10#$LAST_NUMBER + 1))
fi

AUDIT_ID="$(printf '%03d' "$NEXT_NUMBER")"
FILE="$AUDIT_DIR/${AUDIT_ID}_${DATE}.md"

if [ -e "$FILE" ]; then
    echo "ERROR: Audit file already exists:"
    echo "$FILE"
    echo "No file was created."
    exit 1
fi

cat > "$FILE" <<AUDIT_EOF
# ORBIS IMPLEMENTATION AUDIT — ${AUDIT_ID}

## Audit Information

- **Audit ID:** ${AUDIT_ID}
- **Date:** ${DATE}
- **Time:** ${TIME}
- **Implementer:** ${IMPLEMENTER}
- **Task:** ${TASK}
- **Status:** PLANNED

---

## 1. Objective

Describe what this task is intended to accomplish.

---

## 2. Scope

### In Scope

-

### Out of Scope

-

---

## 3. Implementation Summary

Describe what was actually implemented.

---

## 4. Files Added

-

---

## 5. Files Modified

-

---

## 6. Files Removed

- None

---

## 7. Architecture Impact

Describe architecture impact.

---

## 8. Database Impact

- None / Describe changes.

---

## 9. Security Impact

Describe security impact.

---

## 10. Tests Performed

### Unit Tests

-

### Integration Tests

-

### Build Verification

-

### Manual Verification

-

---

## 11. SonarCloud

- **Status:** NOT RUN / PASS / FAILED / NOT APPLICABLE
- **Result:**

---

## 12. Git Information

- **Branch:**
- **Commit SHA:**
- **Commit Message:**

---

## 13. Problems Found

-

---

## 14. Fixes Applied

-

---

## 15. Remaining Issues

-

---

## 16. Risks

-

---

## 17. Final Verification

- [ ] Scope verified
- [ ] Tests executed
- [ ] Build verified
- [ ] Security checked
- [ ] Documentation updated if required
- [ ] Git commit created
- [ ] GitHub push completed

---

## 18. Final Status

**PLANNED**

---

**END OF AUDIT ${AUDIT_ID}**
AUDIT_EOF

echo ""
echo "ORBIS AUDIT CREATED"
echo "-------------------"
echo "ID:   $AUDIT_ID"
echo "Date: $DATE"
echo "Time: $TIME"
echo "File: $FILE"
echo ""
