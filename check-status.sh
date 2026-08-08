#!/bin/bash
PROJECT_KEY="orbisaideveloper_orbis-foundation"

echo "🌐 সোনারক্লাউড থেকে প্রজেক্টের রিয়েল-টাইম স্ট্যাটাস ফেচ করা হচ্ছে..."
curl -s "https://sonarcloud.io/api/qualitygates/project_status?projectKey=${PROJECT_KEY}"
echo -e "\n\n✅ স্ট্যাটাস চেক সম্পন্ন!"
