const fs = require('fs');
const path = './src/admin/dashboard/AdminDashboard.tsx';
let data = fs.readFileSync(path, 'utf8');

const targetComment = '{/* 7th Card: Dependency Tree (Full Width) */}';
const startIndex = data.indexOf(targetComment);

if (startIndex !== -1) {
  const lineStart = data.lastIndexOf('\n', startIndex);
  let currentIndex = startIndex + targetComment.length;
  let divCount = 0;
  let started = false;
  let endIndex = -1;

  for (let i = currentIndex; i < data.length; i++) {
    if (data.substring(i, i + 4) === '<div') {
      divCount++;
      started = true;
    } else if (data.substring(i, i + 6) === '</div>') {
      divCount--;
    }

    if (started && divCount === 0) {
      endIndex = data.indexOf('>', i) + 1;
      break;
    }
  }

  if (endIndex !== -1) {
    const newData = data.substring(0, lineStart !== -1 ? lineStart : startIndex) + data.substring(endIndex);
    fs.writeFileSync(path, newData, 'utf8');
    console.log('\n✅ "Dependency Tree" card perfectly removed from AdminDashboard.tsx!');
  } else {
    console.log('\n❌ Could not safely find the end of the card.');
    process.exit(1);
  }
} else {
  console.log('\n⚠️ Target comment not found. Already removed?');
  process.exit(1);
}
