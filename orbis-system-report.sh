#!/bin/bash

echo -e "\n======================================================="
echo "🧠 ORBIS SYSTEM HEALTH & INTELLIGENCE REPORT 🧠"
echo "======================================================="

# ১. Ollama এবং সার্ভিস স্ট্যাটাস চেক
echo -e "\n🚀 [1] ACTIVE BACKGROUND SERVICES:"
if pgrep -x "ollama" > /dev/null; then 
    echo "  ✅ Ollama (Local AI Engine) ......... RUNNING (Active)"
else 
    echo "  ❌ Ollama (Local AI Engine) ......... STOPPED"
fi

# ২. মূল প্যাকেজগুলোর লিস্ট
echo -e "\n📦 [2] INSTALLED CORE PACKAGES (Key Components):"
echo "-------------------------------------------------------"
npm list --depth=0 | grep -E 'husky|vitest|madge|eslint|prettier|lint-staged|depcheck' || echo "  ⚠️ প্যাকেজগুলো খুঁজে পাওয়া যাচ্ছে না।"

# ৩. সিস্টেমের প্রতিটি টুলের কাজ ও তাদের বর্তমান অবস্থা
echo -e "\n🛠️ [3] SYSTEM INTELLIGENCE & THEIR ROLES:"
echo "-------------------------------------------------------"
echo "- Ollama (Qwen/Llama): আমাদের লোকাল এআই ব্রেইন। এটি এখন ব্যাকগ্রাউন্ডে কোড এনালাইসিস ও হিলিংয়ের জন্য তৈরি।"
echo "- Husky/Lint-staged: গিট কমিট গার্ড। কোড পুশ করার আগে লিন্টিং ও ফরম্যাটিং নিশ্চিত করে।"
echo "- Madge: সার্কুলার ডিপেন্ডেন্সি ডিটেক্টর। প্রজেক্টে কোনো অসীম লুপ (Circular Loop) থাকলে তা সাথে সাথেই ধরে ফেলে।"
echo "- Vitest: আমাদের টেস্টিং ও ১০০% কভারেজ নিশ্চিতকারী। কোড পুশ করার আগে টেস্ট রান করে।"
echo "- ESLint & Prettier: কোড কোয়ালিটি ও সিনট্যাক্স ঠিক রাখে।"
echo "- AI Healer Bridge: আমাদের কাস্টম ব্রিজ, যা এরর হলে Ollama-কে ডেকে সমাধান খুঁজে বের করে।"
echo -e "-------------------------------------------------------\n"

echo "🎉 আপনার সিস্টেম এখন পুরোপুরি ফুল-লোড এবং অটোমেটেড!"
