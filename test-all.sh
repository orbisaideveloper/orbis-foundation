#!/usr/bin/env sh

# প্রিজমা ফোল্ডার বাদ দিয়ে শুধু ./src ফোল্ডারে লুপ চেক করা
CIRCULAR_OUTPUT=$(./node_modules/.bin/madge --circular --extensions ts,tsx,cjs --exclude "generated" ./src 2>&1)

if echo "$CIRCULAR_OUTPUT" | grep -q "No circular dependency found"; then
    git add . > /dev/null 2>&1
    git commit -m "chore(auto): silent high-tech check passed" > /dev/null 2>&1
    git push origin main > /dev/null 2>&1
    echo "⚡ [Success]: Clean check & silently pushed to GitHub!"
else
    echo "⚠️ [Loop Detected in Code]:"
    echo "$CIRCULAR_OUTPUT"
    exit 1
fi
