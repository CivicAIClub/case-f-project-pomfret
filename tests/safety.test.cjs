const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? files(p) : [p];
  });
}

test('runtime has no network or AI calls and no embedded school emails', () => {
  const runtime = ['core','preview','apps-script','paste-into-apps-script'].flatMap(dir => files(path.join(root,dir))).filter(p => /\.(js|gs|html)$/.test(p));
  assert.ok(runtime.length >= 4, 'runtime must exist');
  for (const p of runtime) {
    const source = fs.readFileSync(p, 'utf8');
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|UrlFetchApp|GmailApp|MailApp)\s*(?:\(|\.)/, p);
    assert.doesNotMatch(source, /@pomfret\.org\b/i, p);
    assert.doesNotMatch(source, /(?:src|href)\s*=\s*["']https?:\/\//i, p);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(Object.keys(pkg.dependencies || {}).length,0);
});

test('catalog preserves source corrections and combined aliases', () => {
  const catalog = require('../core/catalog.js');
  assert.equal(catalog.length,27);
  assert.equal(catalog.filter(p => p.enabled).length,26);
  assert.equal(catalog.find(p => p.id === 'glass-fusing').length, 'Either');
  assert.equal(catalog.find(p => p.id === 'derelict-scultpure').enabled, false);
  assert.deepEqual(catalog.find(p => p.id === 'happiness-project').goals, []);
  assert.equal(catalog.filter(p => p.enabled && p.length === 'Major').length,15);
  assert.equal(catalog.filter(p => p.enabled && p.length === 'Minor').length,6);
  assert.equal(catalog.filter(p => p.enabled && p.length === 'Either').length,5);
  assert.equal(catalog.filter(p => p.name.includes(' / ')).length,6);
  for (const p of catalog) {
    assert.ok(p.types.every(t => ['hands','head','heart','feet'].includes(t)));
    assert.ok(p.goals.every(g => Number(g)>=1 && Number(g)<=17));
  }
});
