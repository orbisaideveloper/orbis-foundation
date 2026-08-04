const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

function getDirectoryTree(dirPath, indent = '') {
    let result = '';
    const items = fs.readdirSync(dirPath);
    items.forEach(item => {
        if (item === 'node_modules' || item.startsWith('.')) return;
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            result += `${indent}📁 ${item}/\n`;
            result += getDirectoryTree(fullPath, indent + '  │  ');
        } else {
            result += `${indent}  📄 ${item}\n`;
        }
    });
    return result;
}

app.post('/api/orbis-command', (req, res) => {
    const { command } = req.body;
    let output = '';
    const rootPath = path.join(__dirname, '../');

    if (command.includes('ট্রি') || command.includes('ফোল্ডার') || command.includes('tree')) {
        output += `--- LIVE SOURCE CODE DIRECTORY ---\n\n` + getDirectoryTree(rootPath);
    } else if (command.includes('কানেকশন') || command.includes('ডিপেন্ডেন্সি')) {
        output += `--- DEPENDENCY MAP ---\n\n`;
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(rootPath, 'package.json')));
            output += JSON.stringify(pkg.dependencies, null, 2);
        } catch (e) {
            output += `Error: ${e.message}\n`;
        }
    } else {
        output += `Command Received: "${command}"\nTry asking: "সোর্স ট্রি দেখাও" or "ডিপেন্ডেন্সি দেখাও"`;
    }

    res.json({ result: output });
});

app.listen(3001, () => console.log(`ORBIS Local Bridge running on port 3001`));
