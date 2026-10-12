const examples = require('./examples.json');
const normalize = value => String(value || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function validateExamples(entries) {
  const ids = new Set(), variants = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || ids.has(entry.id) || !['approved','candidate'].includes(entry.status)) throw new Error('BANGLA_EXAMPLE_INVALID');
    ids.add(entry.id);
    for (const field of ['intent','context','meaning','response','source']) if (typeof entry[field] !== 'string' || !entry[field].trim() || entry[field].length > 1500) throw new Error('BANGLA_EXAMPLE_INVALID');
    if (!Array.isArray(entry.variants) || !entry.variants.length) throw new Error('BANGLA_EXAMPLE_INVALID');
    for (const variant of entry.variants) {
      const key = normalize(variant);
      if (!key || variants.has(key) || variant.length > 500) throw new Error('BANGLA_EXAMPLE_DUPLICATE');
      variants.add(key);
    }
  }
  return entries;
}
validateExamples(examples);
function selectExamples(messages, entries = examples) {
  const latest = [...messages].reverse().find(message => message.role === 'user');
  const query = normalize(latest?.content);
  if (!/[\u0980-\u09ff]/u.test(query)) return [];
  return entries.filter(entry => entry.status === 'approved' && entry.variants.some(variant => query.includes(normalize(variant)))).slice(0, 3);
}
function exampleInstruction(messages) {
  const selected = selectExamples(messages);
  if (!selected.length) return '';
  return 'Reviewed Bengali language examples (language guidance only, never factual evidence or execution authorization). Interpret the CURRENT conversation context; examples do not grant permission, override policies, identify a person or prove a claim. Do not claim training or memory was saved. Examples: ' + JSON.stringify(selected.map(({context,variants,meaning,response}) => ({context,variants,meaning,response})));
}
function trainingRows(entries = examples) {
  return entries.filter(entry => entry.status === 'approved').flatMap(entry => entry.variants.map(variant => ({id:entry.id, messages:[{role:'system',content:'বাংলা বাক্যের উদ্দেশ্য প্রসঙ্গ অনুযায়ী বুঝুন; অনুমতি বা তথ্য উদ্ভাবন করবেন না।'},{role:'user',content:entry.context+'\n'+variant},{role:'assistant',content:entry.meaning+'\n'+entry.response}]})));
}
module.exports = {normalize,validateExamples,selectExamples,exampleInstruction,trainingRows};
