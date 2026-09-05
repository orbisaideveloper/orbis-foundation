#!/bin/bash
: "${SONAR_TOKEN:?SONAR_TOKEN environment variable is required}"
PROJECT_KEY="orbisaideveloper_orbis-foundation"

echo "📡 সোনারক্লাউড সার্ভারের সাথে কানেকশন টেস্ট করা হচ্ছে..."
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u "${SONAR_TOKEN}:" "https://sonarcloud.io/api/project_analyses/search?project=${PROJECT_KEY}")

if [ "$STATUS_CODE" -eq 200 ]; then
    echo "✅ দারুন খবর! সোনারক্লাউডের সাথে টার্মাক্সের কানেকশন ১০০% সফল (HTTP 200 OK)।"
    echo "🔍 প্রজেক্টের সর্বশেষ এনালাইসিস স্ট্যাটাস নিচে দেওয়া হলো:"
    curl -s -u "${SONAR_TOKEN}:" "https://sonarcloud.io/api/project_analyses/search?project=${PROJECT_KEY}&ps=1" | grep -o '"date":"[^"]*"'
else
    echo "❌ কানেকশন ফেইল করেছে। HTTP Status Code: $STATUS_CODE"
fi
