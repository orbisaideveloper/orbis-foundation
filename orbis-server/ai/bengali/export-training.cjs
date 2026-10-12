// Owner-operated offline export. No API calls and no model training.
const {writeFileSync,existsSync} = require('node:fs');
const {trainingRows} = require('./BengaliExamples.cjs');
const target = process.argv[2];
if (!target || existsSync(target)) throw new Error('Provide a new output filename; existing files are preserved');
writeFileSync(target, trainingRows().map(row=>JSON.stringify(row)).join('\n')+'\n', {mode:0o600,flag:'wx'});
console.log('Approved Bengali examples exported; training has not run.');
