'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {build,checkDirectory,files} = require('../scripts/build-public-demo.cjs');
const engine = require('../core/engine.js');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'case-f-public-test-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const result = build(dir);
  return {...result,read:file => fs.readFileSync(path.join(dir,file),'utf8')};
}
test('public bundle uses only invented records and all linked assets stay inside the bundle', t => {
  const f = fixture(t), context = {};
  vm.runInNewContext(f.read('assets/demo-data.js'),context);
  const data = context.PPAttachedData;
  assert.equal(data.mode,'demo');
  assert.equal(data.students.length,253);
  for (const student of data.students) {
    assert.match(student.name,/^Practice Student \d{3}$/);
    assert.match(student.id,/^practice-\d{3}$/);
    assert.ok(!student.email || /^student\d{3}@example\.org$/.test(student.email));
    assert.equal(student.source.file,'Invented demo responses');
    assert.equal(student.previousKnown,true);
  }
  assert.deepEqual(Object.keys(data.projects[0]).sort(),['aliases','enabled','goals','id','length','name','types']);
  for (const file of ['index.html','notes.html']) {
    for (const [,url] of f.read(file).matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (url === '/' || url.startsWith('#')) continue;
      assert.ok(files.includes(url),url);
    }
  }
  for (const file of files.filter(file => file !== '.vercelignore')) {
    assert.doesNotMatch(f.read(file),/case-f-private|attached-data|\/Users\/|@pomfret\.org|\.xlsx|\.docx|SOURCE-AUDIT\.md/);
  }
  assert.match(f.read('index.html'),/All students and responses are invented/);
  assert.match(f.read('walkthrough.js'),/public demo uses invented students/);
  assert.match(f.read('walkthrough.js'),/label: 'Export for review'/);
});
test('public fixture passes the actual app validator and produces deterministic draft placements', t => {
  const f = fixture(t), context = {};
  vm.runInNewContext(f.read('assets/demo-data.js'),context);
  const app = f.read('app.js');
  const start = app.indexOf('  function validateAttachedData('), end = app.indexOf('  function esc(',start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(app.slice(start,end) + '\nvar validation = validateAttachedData(PPAttachedData);',context);
  assert.equal(context.validation,'');
  const {students,projects} = JSON.parse(JSON.stringify(context.PPAttachedData));
  const a = engine.sort(students,projects), b = engine.sort(students,projects);
  assert.equal(a.fingerprint,b.fingerprint);
  assert.equal(a.assignments.filter(row => row.project1).length,240);
  assert.equal(a.projects.length,23);
  assert.ok(a.assignments.filter(row => row.project2).every(row => row.project1 !== row.project2));
  context.PPAttachedData.mode = 'attached';
  vm.runInNewContext('validation = validateAttachedData(PPAttachedData);',context);
  assert.notEqual(context.validation,'');
});
test('public build refuses unexpected files and symlinks before deployment', t => {
  const f = fixture(t);
  const extra = path.join(f.destination,'unlisted-records.json');
  fs.writeFileSync(extra,'{"name":"Invented sentinel"}');
  assert.throws(() => build(f.destination),/Unexpected public file/);
  fs.unlinkSync(extra);
  fs.symlinkSync(path.join(f.destination,'index.html'),path.join(f.destination,'unexpected-link'));
  assert.throws(() => checkDirectory(f.destination),/Unexpected symlink/);
});
