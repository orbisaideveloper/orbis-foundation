#!/bin/bash

# আপনার প্রোভাইড করা SonarCloud Access Token
SONAR_TOKEN="Ee7120c9b766c127339152f3c7abbf0177ad63ed"
ORG_KEY="orbis"
PROJECT_KEY="orbisaideveloper_orbis-foundation"

echo "🔍 সোনারক্লাউড সার্ভার থেকে লাইভ ইস্যুগুলো ফেচ করা হচ্ছে..."
RESPONSE=$(curl -s -u "${SONAR_TOKEN}:" "https://sonarcloud.io/api/issues/search?componentKeys=${PROJECT_KEY}&ps=5")

echo "$RESPONSE" | grep -o '"message":"[^"]*"' | head -n 10

if [ $? -ne 0 ]; then
    echo "⚠️ কোনো ইস্যু পাওয়া যায়নি অথবা কানেকশনে সমস্যা হয়েছে। রেসপন্স:"
    echo "$RESPONSE" | head -c 200
fi

echo -e "\n✅ স্ক্যান সম্পন্ন! ওপরে সোনারক্লাউডের সাম্প্রতিক ইস্যুগুলোর মেসেজ দেখানো হলো।"
