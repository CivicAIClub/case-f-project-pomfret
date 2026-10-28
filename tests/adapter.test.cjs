'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {Sheet, newDataValidation} = require('./helpers/fake-spreadsheet.cjs');
const realEngine = require('../core/engine.js');
function fixture(useRealCore = false) {
  const sheets = new Map();
  const spreadsheet = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet: name => { const s = new Sheet(name); sheets.set(name, s); return s; },
    getSheets: () => [...sheets.values()]
  };
  const catalog = [
    { id: 'robotics', name: 'Robotics', length: 'Major', types: ['hands'], goals: ['9'], aliases: [], enabled: true },
    { id: 'cooking', name: 'Cooking', length: 'Minor', types: ['hands'], goals: ['3'], aliases: [], enabled: true },
    { id: 'fitness', name: 'Fitness', length: 'Minor', types: ['feet'], goals: ['3'], aliases: [], enabled: true }
  ];
  const defaults = { minSize: 8, targetSize: 11, maxSize: 14, projectCount: 23, minorProjects: 8, minorMin: 80, minorTarget: 88, minorMax: 96, allowMajorToMinor: true, checkedBeforeInferred: true };
  let checkedAssignments;
  const engine = {
    defaults, fingerprint: value => JSON.stringify(value), fit: () => ({ tier: 1 }),
    sort: students => ({
      assignments: students.map(s => ({ studentId: s.id, project1: 'robotics', project2: null, fit1: 1, fit2: null, reason: 'Checked project and matching type.', flags: [], status: 'placed' })),
      projects: [{ ...catalog[0], finalLength: 'Major' }], issues: [], checks: [], fingerprint: 'fixture-run',
      summary: { total: students.length, eligible: students.length, placed: students.length, excluded: 0, needsReview: 0, majorStudents: students.length, minorStudents: 0, projectCount: 1, minorProjectCount: 0 }
    }),
    check: (_students, _projects, assignments) => { checkedAssignments = assignments; return assignments.filter(a => a.project1 && a.project1 !== 'robotics').map(a => ({ code: 'unknown_project', severity: 'error', message: 'Unknown project.', studentId: a.studentId })); }
  };
  const parser = {
    parseProjects: () => ({ projects: catalog, issues: [] }),
    prepare: tables => ({ students: tables.flatMap(t => t.values.slice(1).map(r => ({ id: r[1], name: r[2], email: r[1], grade: t.grade, preference: 'Major', choices: ['robotics'], types: ['hands'], goals: ['9'], previous: [], status: 'eligible', gender: null, comments: r[3] || '', source: { sheet: t.name, row: 2 }, issues: [] }))), issues: [], stats: {} })
  };
  let released = 0;
  const context = vm.createContext({ module: { exports: {} }, PPParser: useRealCore ? require('../core/parser.js') : parser, PPEngine: useRealCore ? require('../core/engine.js') : engine, PPCatalog: useRealCore ? require('../core/catalog.js') : catalog,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, newDataValidation },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => released++ }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'teacher@example.org' }) }, Date, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Main.gs'), 'utf8'), context);
  const adapter = context.module.exports;
  function source() {
    sheets.set('Projects', new Sheet('Projects', [['Project', 'Length'], ['Robotics', 'Major']]));
    ['Senior', 'Junior', 'Sophomore'].forEach((name, i) => sheets.set(name, new Sheet(name, [['Timestamp', 'Email Address', 'Name', 'Comments'], ['2026-10-20', 'practice' + i + '@example.org', 'Practice Student ' + i, '=IMPORTXML("unsafe")']])));
  }
  return { adapter, sheets, catalog, context, source, engine, checked: () => checkedAssignments, released: () => released };
}
function saved(f) {
  const run = { students: new Map(), assignments: new Map(), projects: [] };
  for (const [kind, key, json] of f.sheets.get('PP Run snapshot').data.slice(1)) {
    const value = JSON.parse(json);
    if (kind === 'student') run.students.set(key, value);
    if (kind === 'assignment') run.assignments.set(key, value);
    if (kind === 'project') run.projects.push(value);
    if (kind === 'settings') run.settings = value;
    if (kind === 'choices') run.choices = value;
  }
  return run;
}
const GRADE_TABS = ['PP Senior', 'PP Junior', 'PP Sophomore'];
test('setup preserves existing source, settings and project decisions', () => {
  const f = fixture(); f.source(); f.adapter.setup();
  f.sheets.get('Settings').data[1][1] = 9;
  f.sheets.get('Project choices').data[1][2] = false;
  const before = JSON.stringify(f.sheets.get('Senior').data);
  f.adapter.setup();
  assert.equal(f.sheets.get('Settings').data[1][1], 9);
  assert.equal(f.sheets.get('Project choices').data[1][2], false);
  assert.equal(JSON.stringify(f.sheets.get('Senior').data), before);
});
test('practice generation is scratch-only and does not overwrite one populated cell', () => {
  const f = fixture(); f.sheets.set('My work', new Sheet('My work', [['Keep me']]));
  assert.throws(() => f.adapter.practice(), /completely empty scratch/);
  assert.deepEqual(f.sheets.get('My work').data, [['Keep me']]);
  assert.equal(f.sheets.size, 1);
});
test('safe output preserves numeric values and neutralizes formula-like text', () => {
  const { adapter } = fixture();
  assert.equal(adapter.safeCell(' =IMPORTXML("x")'), "' =IMPORTXML(\"x\")");
  assert.equal(adapter.safeCell('+1'), "'+1");
  assert.equal(adapter.safeCell('@name'), "'@name");
  assert.equal(adapter.safeCell(-4), -4);
  assert.equal(adapter.safeCell('plain'), 'plain');
});
test('settings reject over-capacity and missing setting rows', () => {
  const f = fixture(); f.adapter.setup();
  const rows = f.sheets.get('Settings').data;
  rows.find(r => r[0] === 'maxSize')[1] = 15;
  assert.throws(() => f.adapter.readSettings(), /maximum <= 14/);
  rows.find(r => r[0] === 'maxSize')[1] = 14;
  rows.splice(rows.findIndex(r => r[0] === 'minorTarget'), 1);
  assert.throws(() => f.adapter.readSettings(), /missing minorTarget/);
});
test('sort needs a reason before any sheet is created', () => {
  const f = fixture();
  assert.throws(() => f.adapter.sort(' '), /run reason is required/);
  assert.equal(f.sheets.size, 0);
});
test('sort creates roster outputs, keeps comments as text in PP Students and appends run log', () => {
  const f = fixture(); f.source(); f.adapter.sort('First practice run');
  const master = f.sheets.get('PP Senior').data, students = f.sheets.get('PP Students').data;
  assert.equal(master[1][2], 'MAJ-Robotics');
  assert.equal(master[1][3], 'MAJ-Robotics');
  assert.equal(master[0].length, 9);
  assert.equal(students[1][students[0].indexOf('Student comment')], "'=IMPORTXML(\"unsafe\")");
  assert.equal(f.sheets.get('PP Run log').data.length, 2);
  f.adapter.sort('Same settings reproducibility check');
  assert.equal(f.sheets.get('PP Run log').data.length, 3);
});
test('Check again reads edited master cells and evaluates them, not the baseline', () => {
  const f = fixture(); f.source(); f.adapter.sort('First practice run');
  f.sheets.get('PP Senior').data[1][2] = 'MIN-Unknown';
  const checks = f.adapter.checkAgain();
  assert.equal(f.checked()[0].project1, 'MIN-Unknown');
  assert.ok(checks.some(c => c.code === 'manual_edit'));
  assert.ok(checks.some(c => c.code === 'unknown_project_token'));
  assert.ok(checks.some(c => c.code === 'unknown_project'));
});
test('Check again flags changed source inputs while retaining saved run rules', () => {
  const f = fixture(); f.source(); f.adapter.sort('First practice run');
  f.sheets.get('Senior').data[1][2] = 'Changed practice name';
  assert.ok(f.adapter.checkAgain().some(c => c.code === 'stale_inputs'));
});
test('Check again retains source findings and project cuts without accumulating duplicates', () => {
  const f = fixture(true); f.adapter.practice();
  const settings = f.sheets.get('Settings').data;
  settings.find(r => r[0] === 'minSize')[1] = 12;
  settings.find(r => r[0] === 'targetSize')[1] = 12;
  f.adapter.sort('Synthetic small-group review');
  const before = f.sheets.get('PP Check').data.slice(1);
  assert.equal(before.filter(r => r[1] === 'OCT23_GLASS').length, 1);
  assert.equal(before.filter(r => r[1] === 'PROJECT_CUT').length, 3);
  const first = f.adapter.checkAgain();
  assert.equal(first.filter(c => c.code === 'OCT23_GLASS').length, 1);
  assert.equal(first.filter(c => c.code === 'PROJECT_CUT').length, 3);
  assert.equal(f.sheets.get('PP Check').data.length, before.length + 1);
  const second = f.adapter.checkAgain();
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)));
  // Saved findings still describe the reviewed run after current source changes.
  f.sheets.get('Senior').data[1][2] = 'Changed practice name';
  const stale = f.adapter.checkAgain();
  assert.ok(stale.some(c => c.code === 'stale_inputs'));
  assert.equal(stale.filter(c => c.code === 'OCT23_GLASS').length, 1);
  assert.equal(stale.filter(c => c.code === 'PROJECT_CUT').length, 3);
});
test('saved findings cannot be edited or removed without invalidating the run snapshot', () => {
  const f = fixture(true); f.adapter.practice(); f.adapter.sort('Synthetic finding integrity review');
  const rows = f.sheets.get('PP Run snapshot').data;
  const index = rows.findIndex(r => r[0] === 'input-issue');
  assert.ok(index > 0, 'source findings must be saved with the run');
  const saved = rows[index][2];
  rows[index][2] = JSON.stringify({ code: 'REPLACED', severity: 'info', message: 'Changed finding' });
  assert.throws(() => f.adapter.checkAgain(), /snapshot .* changed/);
  rows[index][2] = saved;
  rows.splice(index, 1);
  assert.throws(() => f.adapter.checkAgain(), /snapshot .* changed/);
});
test('legacy snapshots require a new sort instead of silently losing earlier findings', () => {
  const f = fixture(); f.source(); f.adapter.sort('Synthetic snapshot upgrade review');
  f.sheets.get('PP Run snapshot').data.find(r => r[0] === 'meta' && r[1] === 'version')[2] = '1';
  assert.throws(() => f.adapter.checkAgain(), /snapshot.*Run Sort/i);
});
test('fit-only master edits reach the independent engine check instead of being repaired', () => {
  const f = fixture(true); f.adapter.practice(); f.adapter.sort('Fit audit test');
  const row = f.sheets.get('PP Senior').data[1];
  row[5] = row[5] % 6 + 1;
  const checks = f.adapter.checkAgain();
  assert.ok(checks.some(c => c.code === 'STALE_FIT' && c.studentId === row[0]));
  assert.ok(checks.some(c => c.code === 'manual_edit' && c.studentId === row[0]));
});
test('nonnumeric displayed fits and fits without a project are explicit errors', () => {
  const f = fixture(); f.source(); f.adapter.sort('Fit audit test');
  const row = f.sheets.get('PP Senior').data[1];
  row[5] = 'not a fit'; row[6] = 3;
  const checks = f.adapter.checkAgain();
  assert.equal(checks.filter(c => c.code === 'invalid_fit_cell' && c.studentId === row[0]).length, 2);
  assert.equal(f.checked()[0].fit1, null);
});
test('reason-only master edits are flagged against the saved explanation', () => {
  const f = fixture(); f.source(); f.adapter.sort('Explanation audit test');
  const row = f.sheets.get('PP Senior').data[1];
  row[7] = 'A made-up explanation that does not describe the saved run.';
  const checks = f.adapter.checkAgain();
  assert.ok(checks.some(c => c.code === 'manual_edit' && c.studentId === row[0] && /reason/.test(c.message)));
});
test('name-only master edits are flagged against the source identity', () => {
  const f = fixture(); f.source(); f.adapter.sort('Identity audit test');
  const row = f.sheets.get('PP Senior').data[1]; row[1] = 'Different invented name';
  assert.ok(f.adapter.checkAgain().some(c => c.code === 'manual_edit' && c.studentId === row[0] && /Name/.test(c.message)));
});
test('snapshot damage cannot masquerade as a newly checked run', () => {
  const f = fixture(); f.source(); f.adapter.sort('First practice run');
  const row = f.sheets.get('PP Run snapshot').data.find(r => r[0] === 'student');
  const changed = JSON.parse(row[2]); changed.grade = 10; row[2] = JSON.stringify(changed);
  assert.throws(() => f.adapter.checkAgain(), /snapshot inputs changed/);
});
test('project choices reject unrecognized leaders and incompatible self-reference', () => {
  const f = fixture(); f.adapter.setup();
  const choices = f.sheets.get('Project choices').data;
  choices[1][5] = 'unknown@example.org';
  assert.throws(() => f.adapter.readChoices(f.catalog, []), /exactly one Student ID or email/);
  choices[1][5] = ''; choices[1][6] = 'robotics';
  assert.throws(() => f.adapter.readChoices(f.catalog, []), /invalid incompatible project/);
});
test('document lock is released after a failed action', () => {
  const f = fixture();
  assert.throws(() => f.context.PP_withLock(() => { throw new Error('expected'); }), /expected/);
  assert.equal(f.released(), 1);
});
test('student comments appear only in PP Students, never in grade, group or review tabs', () => {
  const f = fixture(true); f.adapter.practice(); f.adapter.sort('Comment placement check');
  const shared = [...f.sheets.keys()].filter(name => /^PP (Senior|Junior|Sophomore|Group \d{2} .+|Needs you)$/.test(name));
  assert.equal(shared.filter(name => name.startsWith('PP Group')).length, 23);
  for (const name of shared) {
    const data = f.sheets.get(name).data;
    assert.ok(!data[0].includes('Student comment'), name);
    assert.ok(!data.some(row => row.includes('Invented practice response.')), name);
  }
  const students = f.sheets.get('PP Students').data, column = students[0].indexOf('Student comment');
  assert.ok(column >= 0);
  assert.ok(students.slice(1).every(row => row[column] === 'Invented practice response.'));
});
test('a Major shows the same MAJ- label in both columns, and Check again accepts that or a blank Project #2', () => {
  const f = fixture(true); f.adapter.practice(); f.adapter.sort('Master list labels');
  const run = saved(f);
  let majors = 0, minors = 0;
  for (const tab of GRADE_TABS) for (const row of f.sheets.get(tab).data.slice(1)) {
    const a = run.assignments.get(row[0]);
    if (a.status !== 'placed') continue;
    if (a.project2) { minors++; assert.match(row[2], /^MIN-/); assert.match(row[3], /^MIN-/); assert.notEqual(row[2], row[3]); }
    else { majors++; assert.match(row[2], /^MAJ-/); assert.equal(row[3], row[2]); assert.equal(row[6], ''); }
  }
  // Every Not-sure practice student checked four Minors and four Majors, so they lean Minor and fill
  // the Minors to the maximum.
  assert.equal(majors, 144); assert.equal(minors, 96);
  let checks = f.adapter.checkAgain();
  assert.equal(checks.filter(c => c.severity === 'error').length, 0);
  assert.ok(!checks.some(c => c.code === 'manual_edit'));
  f.sheets.get('PP Junior').data.find(r => run.assignments.get(r[0])?.status === 'placed' && !run.assignments.get(r[0]).project2)[3] = '';
  checks = f.adapter.checkAgain();
  assert.equal(checks.filter(c => c.severity === 'error').length, 0);
  assert.ok(!checks.some(c => c.code === 'manual_edit'));
});
test('PP Input check lists every hand-typed merge and every student with no response', () => {
  const f = fixture(true); f.adapter.practice();
  f.sheets.get('Senior').data.push(['', '', 'Student 001, Practice', '', '', '', '', '', ''], ['', '', 'Example, Nobody', '', '', '', '', '', '']);
  const prepared = f.adapter.prepare(), nobody = prepared.students.find(s => s.name === 'Example, Nobody');
  assert.equal(prepared.students.length, 241);
  assert.equal(nobody.status, 'late');
  const rows = f.sheets.get('PP Input check').data;
  assert.ok(rows.some(r => r[0] === 'info' && r[1] === 'HAND_TYPED_MERGED' && r[3] === 'practice1@example.org' && r[6] === 'Senior:82'));
  assert.ok(rows.some(r => r[0] === 'warning' && r[1] === 'NO_RESPONSE' && r[3] === nobody.id && r[6] === 'Senior:83'));
  const result = f.adapter.sort('Hand-typed rows with invented students');
  assert.equal(result.assignments.find(a => a.studentId === nobody.id).status, 'placed');
});
test('real core integration: practice data prepares, counts, sorts and rechecks through the adapter', () => {
  const f = fixture(true);
  f.adapter.practice();
  const prepared = f.adapter.prepare();
  assert.equal(prepared.students.length, 240);
  assert.equal(prepared.students.filter(s => ['eligible', 'late'].includes(s.status)).length, 240);
  const interest = f.adapter.interest();
  assert.equal(interest.counts.length, 26);
  const result = f.adapter.sort('Integration test using invented students');
  assert.equal(result.assignments.length, 240);
  assert.equal(result.summary.placed, 240);
  assert.ok(f.sheets.get('PP Run snapshot').data.length > 500);
  const checks = f.adapter.checkAgain();
  assert.equal(checks.filter(c => c.code === 'stale_inputs').length, 0);
  assert.equal(checks.filter(c => c.code === 'manual_edit').length, 0);
});

const label = p => (p.finalLength === 'Minor' ? 'MIN-' : 'MAJ-') + p.name;
// Every placed row in the grade tabs, with its saved assignment and student.
function placedRows(f, run) {
  return GRADE_TABS.flatMap(tab => f.sheets.get(tab).data.map((row, index) => ({ tab, index, row, a: run.assignments.get(row[0]), s: run.students.get(row[0]) })))
    .filter(x => x.index > 0 && x.a && x.a.status === 'placed');
}
function practiceRun(reason, before) {
  const f = fixture(true); f.adapter.practice(); if (before) before(f);
  f.adapter.sort(reason);
  return { f, run: saved(f) };
}
test('every Project #1 and Project #2 cell in the grade tabs has a dropdown of running projects', () => {
  const { f, run } = practiceRun('Dropdown practice'), labels = run.projects.map(label).sort();
  assert.equal(labels.length, 23);
  for (const tab of GRADE_TABS) {
    const sheet = f.sheets.get(tab), rows = sheet.data.length - 1, rules = sheet.getRange(2, 3, rows, 2).getDataValidations().flat();
    assert.equal(rules.length, rows * 2);
    for (const rule of rules) { assert.deepEqual(rule.values, labels); assert.equal(rule.allowInvalid, false); }
    assert.equal(sheet.getRange(1, 1, 1, 9).getDataValidations().flat().filter(Boolean).length, 0);
    assert.equal(sheet.getRange(2, 5, rows, 5).getDataValidations().flat().filter(Boolean).length, 0);
  }
});
test('moving a student to a project they checked updates their fit, reason and flags', () => {
  const { f, run } = practiceRun('Hand move practice');
  const pick = placedRows(f, run).filter(x => !x.a.project2).map(x => ({ ...x, to: run.projects.find(p => p.finalLength === 'Major' && p.id !== x.a.project1 && x.s.choices.includes(p.id) && realEngine.fit(x.s, p, run.settings).tier !== x.a.fit1) })).find(x => x.to);
  pick.row[2] = pick.row[3] = label(pick.to);
  const checks = f.adapter.checkAgain(), row = f.sheets.get(pick.tab).data[pick.index];
  const expected = realEngine.explain(pick.s, [pick.to.id], run.projects, run.settings, run.choices, true);
  assert.equal(row[4], 'placed');
  assert.equal(row[5], realEngine.fit(pick.s, pick.to, run.settings).tier); assert.notEqual(row[5], pick.a.fit1); assert.equal(row[6], '');
  assert.equal(row[7], 'Moved by hand. ' + expected.reason); assert.equal(row[8], expected.flags.join('; '));
  assert.ok(checks.some(c => c.code === 'moved_by_hand' && c.severity === 'info' && c.studentId === pick.row[0]));
  assert.ok(!checks.some(c => c.studentId === pick.row[0] && c.severity !== 'info'));
  // Check again a second time finds the same cells and changes nothing.
  const after = JSON.stringify(f.sheets.get(pick.tab).data); f.adapter.checkAgain();
  assert.equal(JSON.stringify(f.sheets.get(pick.tab).data), after);
});
test('a Major in one column and a Minor in the other is an error', () => {
  const { f, run } = practiceRun('Mixed columns practice');
  const pick = placedRows(f, run).find(x => !x.a.project2), minor = run.projects.find(p => p.finalLength === 'Minor');
  pick.row[3] = label(minor);
  assert.ok(f.adapter.checkAgain().some(c => c.code === 'MIXED_TRACKS' && c.severity === 'error' && c.studentId === pick.row[0]));
});
test('moving a Minor student to one Major in both columns is information only', () => {
  const { f, run } = practiceRun('Track change practice');
  const pick = placedRows(f, run).filter(x => x.a.project2).map(x => ({ ...x, to: run.projects.find(p => p.finalLength === 'Major' && x.s.choices.includes(p.id)) })).find(x => x.to);
  pick.row[2] = pick.row[3] = label(pick.to);
  const checks = f.adapter.checkAgain(), mine = checks.filter(c => c.studentId === pick.row[0]);
  assert.ok(mine.some(c => c.code === 'moved_by_hand' && /from two Minors to one Major/.test(c.message)));
  assert.ok(mine.every(c => c.severity === 'info'));
  assert.equal(checks.filter(c => c.severity === 'error').length, 0);
  const row = f.sheets.get(pick.tab).data[pick.index];
  assert.equal(row[6], ''); assert.match(row[7], /^Moved by hand\. /);
});
test('students who were not moved keep their cells when Check again writes a moved row', () => {
  const { f, run } = practiceRun('Unchanged rows practice');
  const pick = placedRows(f, run).filter(x => x.a.project2).map(x => ({ ...x, to: run.projects.find(p => p.finalLength === 'Major' && x.s.choices.includes(p.id)) })).find(x => x.to);
  pick.row[2] = pick.row[3] = label(pick.to);
  const others = () => GRADE_TABS.map(tab => JSON.stringify(f.sheets.get(tab).data.filter((_, i) => tab !== pick.tab || i !== pick.index)));
  const before = others(), movedBefore = JSON.stringify(pick.row);
  f.adapter.checkAgain();
  assert.deepEqual(others(), before);
  assert.notEqual(JSON.stringify(f.sheets.get(pick.tab).data[pick.index]), movedBefore);
});
test('Check again reports groups that hand moves push over the maximum or under the minimum', () => {
  const { f, run } = practiceRun('Group size practice'), rows = placedRows(f, run).filter(x => !x.a.project2);
  const [from, to] = run.projects.filter(p => p.finalLength === 'Major'), size = id => rows.filter(x => x.a.project1 === id).length;
  const count = Math.max(size(from.id) - run.settings.minSize + 1, run.settings.maxSize + 1 - size(to.id));
  const movers = rows.filter(x => x.a.project1 === from.id).slice(0, count);
  assert.equal(movers.length, count);
  movers.forEach(x => { x.row[2] = x.row[3] = label(to); });
  const checks = f.adapter.checkAgain();
  assert.ok(checks.some(c => c.code === 'OVER_CAPACITY' && c.severity === 'error' && c.projectId === to.id));
  assert.ok(checks.some(c => c.code === 'UNDER_MINIMUM' && c.severity === 'error' && c.projectId === from.id));
});
test('Check again reports a hand move into last year\'s project', () => {
  let { f, run } = practiceRun('Before the last-year answer');
  const first = placedRows(f, run).find(x => x.tab === 'PP Junior' && !x.a.project2), id = first.row[0];
  const to = run.projects.find(p => p.finalLength === 'Major' && p.id !== first.a.project1);
  f.sheets.get('Junior').data.find(r => r[1] === id)[3] = to.name;
  f.adapter.sort('After the last-year answer'); run = saved(f);
  assert.deepEqual([...run.students.get(id).previous], [to.id]);
  const pick = placedRows(f, run).find(x => x.row[0] === id);
  assert.notEqual(pick.a.project1, to.id);
  pick.row[2] = pick.row[3] = label(to);
  assert.ok(f.adapter.checkAgain().some(c => c.code === 'PREVIOUS_PROJECT' && c.severity === 'error' && c.studentId === id));
});
test('Check again reports a gender rule a hand move breaks when gender data exists', () => {
  const odd = 'practice1@example.org';
  const { f, run } = practiceRun('Gender practice', f => {
    const emails = ['Senior', 'Junior', 'Sophomore'].flatMap(tab => f.sheets.get(tab).data.slice(1).map(r => r[1]));
    f.sheets.get('Gender').data.push(...emails.map(email => [email, email === odd ? 'Male' : 'Female']));
  });
  const pick = placedRows(f, run).find(x => x.row[0] === odd);
  const to = run.projects.find(p => p.finalLength === 'Major' && p.id !== pick.a.project1 && p.id !== pick.a.project2);
  assert.ok(!f.adapter.checkAgain().some(c => c.code === 'GENDER_BALANCE' && c.projectId === to.id));
  pick.row[2] = pick.row[3] = label(to);
  assert.ok(f.adapter.checkAgain().some(c => c.code === 'GENDER_BALANCE' && c.severity === 'warning' && c.projectId === to.id));
});

test('Setup adds the tieSeed setting and the Tie seed log column to an older sheet and keeps its values', () => {
  const f = fixture(true); f.adapter.practice();
  const settings = f.sheets.get('Settings').data, log = f.sheets.get('PP Run log').data;
  // Make the sheet look like one made before this round.
  settings.splice(settings.findIndex(r => r[0] === 'tieSeed'), 1);
  settings.find(r => r[0] === 'minSize')[1] = 9;
  log[0] = log[0].slice(0, 7);
  assert.equal(f.adapter.readSettings().tieSeed, 2026);
  f.adapter.setup();
  assert.equal(settings.find(r => r[0] === 'minSize')[1], 9);
  assert.deepEqual(settings.find(r => r[0] === 'tieSeed').slice(0, 2), ['tieSeed', 2026]);
  assert.ok(settings.find(r => r[0] === 'tieSeed')[2].length > 0);
  f.adapter.sort('Tie seed log check');
  assert.equal(log[0][7], 'Tie seed');
  assert.equal(f.sheets.get('PP Run log').data[1][7], 2026);
});

test('PP Summary shows each grade\'s placements, and PP Seniors to check lists seniors in a project they did not check', () => {
  // One invented senior checked only a cancelled project, so they can't get a project they checked.
  const { f, run } = practiceRun('Results summary practice', f => { f.sheets.get('Senior').data[1][7] = 'Derelict Sculpture'; });
  const rows = new Map(f.sheets.get('PP Summary').data.slice(1).map(r => [r[0], r[1]]));
  const parts = [' in a Major they checked', " in a Major they didn't check", ' in Minors, both weeks checked', ' in Minors, one week checked', ' in Minors, neither week checked'];
  for (const [who, grade] of [['Seniors', 12], ['Juniors', 11], ['Sophomores', 10]]) {
    assert.equal(parts.reduce((n, part) => n + rows.get(who + part), 0), rows.get(who + ' placed'), who);
    const placements = [...run.assignments.values()].filter(a => a.status === 'placed' && run.students.get(a.studentId).grade === grade).reduce((n, a) => n + (a.project2 ? 2 : 1), 0);
    assert.equal([1, 2, 3, 4, 5, 6].reduce((n, t) => n + rows.get(who + ' placements at fit ' + t), 0), placements, who);
  }
  assert.equal(rows.get('Seniors placed') + rows.get('Juniors placed') + rows.get('Sophomores placed'), rows.get('Placed'));
  const expected = [...run.assignments.values()].filter(a => {
    const s = run.students.get(a.studentId);
    return s.grade === 12 && a.status === 'placed' && [a.project1, a.project2].filter(Boolean).some(id => !s.choices.includes(id));
  }).map(a => run.students.get(a.studentId).email).sort();
  const listed = f.sheets.get('PP Seniors to check').data;
  assert.deepEqual(listed[0], ['Name', 'Email', 'Project #1', 'Project #2', 'Reason']);
  assert.ok(expected.includes('practice1@example.org'));
  assert.deepEqual(listed.slice(1).map(r => r[1]).sort(), expected);
});


const lockRows = f => f.sheets.get('Locked placements').data;
// Move a placed student to another running Major, the way Mr. Litowitz does in the grade tab.
function moveToMajor(f, run, pick) {
  const target = run.projects.find(p => p.finalLength === 'Major' && p.id !== pick.a.project1 && p.id !== pick.a.project2);
  pick.row[2] = pick.row[3] = label(target);
  return target;
}
test('Check again saves each move to Locked placements, and Sort keeps it there', () => {
  const { f, run } = practiceRun('Locks practice'), pick = placedRows(f, run).find(x => x.tab === 'PP Junior');
  const target = moveToMajor(f, run, pick), checks = f.adapter.checkAgain();
  assert.equal(checks.savedMoves, 1);
  assert.equal(f.adapter.savedMessage(1), "Saved 1 move. They'll stay put when you sort again.");
  const rows = lockRows(f);
  assert.deepEqual(rows[0], ['Email', 'Name', 'Project 1', 'Project 2', 'Locked by', 'When', 'Why']);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1].slice(0, 5), [pick.row[0], pick.s.name, label(target), label(target), 'teacher@example.org']);
  assert.ok(rows[1][5] instanceof Date); assert.equal(rows[1][6], 'Moved by hand');
  // Check again again finds nothing new to save.
  assert.equal(f.adapter.checkAgain().savedMoves, 0);
  const result = f.adapter.sort('Rerun after a move'), a = result.assignments.find(x => x.studentId === pick.row[0]);
  assert.equal(result.savedMoves, 0);
  assert.equal(a.project1, target.id); assert.match(a.reason, /^Locked in place: Moved by hand\. /);
  const log = f.sheets.get('PP Run log').data;
  assert.equal(log[log.length - 1][log[0].indexOf('Run by')], 'teacher@example.org');
});
test('Sort saves moves first, so a move is kept even without Check again', () => {
  const { f, run } = practiceRun('Locks practice'), pick = placedRows(f, run).find(x => x.a.project2);
  const target = moveToMajor(f, run, pick), result = f.adapter.sort('Rerun without Check again');
  assert.equal(result.savedMoves, 1);
  assert.equal(result.assignments.find(x => x.studentId === pick.row[0]).project1, target.id);
  assert.equal(lockRows(f).length, 2);
});
test('a locked student stays put when a better project appears, and moves once the lock is deleted', () => {
  let { f, run } = practiceRun('Before the lock'), pick = placedRows(f, run).find(x => x.tab === 'PP Senior' && !x.a.project2);
  const id = pick.row[0], locked = moveToMajor(f, run, pick);
  f.adapter.sort('Lock by hand');
  // The student now checks two other projects and matches the first one's Type and goal, so it fits far better.
  const better = run.projects.filter(p => p.finalLength === 'Major' && p.id !== locked.id && p.id !== pick.a.project1);
  const source = f.sheets.get('Senior').data.find(r => r[1] === id);
  source[7] = better[0].name + '; ' + better[1].name; source[5] = better[0].types[0]; source[4] = better[0].goals[0];
  let result = f.adapter.sort('Answers changed');
  assert.equal(result.assignments.find(x => x.studentId === id).project1, locked.id);
  const rows = lockRows(f); rows.splice(rows.findIndex(r => r[0] === id), 1);
  result = f.adapter.sort('Lock deleted');
  assert.notEqual(result.assignments.find(x => x.studentId === id).project1, locked.id);
  assert.ok(realEngine.fit(saved(f).students.get(id), run.projects.find(p => p.id === result.assignments.find(x => x.studentId === id).project1), run.settings).tier < 5);
});
test('a rerun with nothing changed gives identical groups', () => {
  const { f } = practiceRun('First run'), tabs = () => [...f.sheets.keys()].filter(n => /^PP (Senior|Junior|Sophomore|Group \d{2} .+)$/.test(n)).sort().map(n => JSON.stringify([n, f.sheets.get(n).data]));
  const before = tabs(), result = f.adapter.sort('Same inputs again');
  assert.deepEqual(tabs(), before);
  assert.equal(result.savedMoves, 0);
});
test('Check again rebuilds the group tabs, PP Summary and PP Needs you from the grade tabs without sorting', () => {
  const { f, run } = practiceRun('Rebuild practice'), pick = placedRows(f, run).find(x => x.a.project2);
  const target = moveToMajor(f, run, pick), registry = new Map(f.sheets.get('PP Project tabs').data.slice(1).map(r => [r[0], r[2]]));
  const summary = () => new Map(f.sheets.get('PP Summary').data.slice(1).map(r => [r[0], r[1]]));
  const majors = summary().get('Major students'), snapshot = JSON.stringify(f.sheets.get('PP Run snapshot').data);
  f.adapter.checkAgain();
  assert.ok(f.sheets.get(registry.get(target.id)).data.some(r => r[3] === pick.row[0] && r[0] === 'Both weeks'));
  assert.ok(!f.sheets.get(registry.get(pick.a.project1)).data.some(r => r[3] === pick.row[0]));
  assert.equal(summary().get('Major students'), majors + 1);
  assert.equal(summary().get('Review status'), 'Rebuilt by Check again from the grade tabs. Read PP Check before use.');
  assert.ok(f.sheets.get('PP Needs you').data.length > 1);
  assert.equal(JSON.stringify(f.sheets.get('PP Run snapshot').data), snapshot);
});
test('saving moves still works after Settings, Project choices or the forms change', () => {
  const { f, run } = practiceRun('Before the changes'), pick = placedRows(f, run).find(x => x.tab === 'PP Sophomore');
  f.sheets.get('Settings').data.find(r => r[0] === 'minSize')[1] = 7;
  f.sheets.get('Project choices').data[1][2] = false;
  f.sheets.get('Junior').data[1][2] = 'Changed practice name';
  moveToMajor(f, run, pick);
  const checks = f.adapter.checkAgain();
  assert.equal(checks.savedMoves, 1);
  assert.ok(checks.some(c => c.code === 'stale_inputs'));
  // A damaged snapshot still stops Check again, but the move is saved first.
  const g = practiceRun('Damaged snapshot'), other = placedRows(g.f, g.run)[0];
  moveToMajor(g.f, g.run, other);
  const row = g.f.sheets.get('PP Run snapshot').data.find(r => r[0] === 'student'), changed = JSON.parse(row[2]);
  changed.grade = 10; row[2] = JSON.stringify(changed);
  assert.throws(() => g.f.adapter.checkAgain(), /^Error: Saved 1 move\. .*snapshot inputs changed/);
  assert.equal(lockRows(g.f).length, 2);
});
test('there is nothing to save before the first Sort', () => {
  const f = fixture(true); f.adapter.practice();
  assert.equal(f.adapter.sort('First run').savedMoves, 0);
  assert.equal(lockRows(f).length, 1);
});
test('Setup keeps hand-typed rows in Locked placements; Sort uses them and reports names it cannot match', () => {
  const f = fixture(true); f.adapter.practice();
  const typed = [['Email', 'Name', 'Project 1', 'Project 2', 'Locked by', 'When', 'Why'],
    ['', 'Practice Student 001', 'Model UN', '', 'Mr. Litowitz', '', 'Asked to stay with his advisor'],
    ['PRACTICE2@example.org', '', 'model-un', 'model-un', 'Mr. Litowitz', '', ''],
    ['practice3@example.org', 'Practice Student 003', 'Underwater Basket Weaving', '', '', '', '']];
  f.sheets.set('Locked placements', new Sheet('Locked placements', typed.map(r => r.slice())));
  f.adapter.setup();
  assert.deepEqual(lockRows(f), typed);
  const result = f.adapter.sort('Hand-typed locks');
  const at = id => result.assignments.find(a => a.studentId === id);
  assert.ok(result.projects.some(p => p.id === 'model-un'));
  assert.equal(at('practice1@example.org').project1, 'model-un');
  assert.equal(at('practice2@example.org').project1, 'model-un');
  assert.ok(f.sheets.get('PP Check').data.some(r => r[0] === 'error' && r[1] === 'LOCK_UNKNOWN_PROJECT' && /Underwater Basket Weaving/.test(r[2])));
  // The reason gives the row's Why, and only Locked placements says who locked a student.
  assert.match(at('practice1@example.org').reason, /^Locked in place: Asked to stay with his advisor\. /);
  assert.match(at('practice2@example.org').reason, /^Locked in place by hand\. /);
  for (const [name, tab] of f.sheets) if (name !== 'Locked placements') assert.ok(!JSON.stringify(tab.data).includes('Litowitz'), name);
  assert.deepEqual(lockRows(f), typed);
});
test('a student moved into a fit 6 project gets no fit-6 flag or LOW_FIT warning, in Check again and after Sort', () => {
  const { f, run } = practiceRun('Fit 6 lock'), majors = run.projects.filter(p => p.finalLength === 'Major');
  const fit6 = x => majors.find(p => p.id !== x.a.project1 && realEngine.fit(x.s, p).tier === 6);
  const pick = placedRows(f, run).find(x => !x.a.project2 && fit6(x)), id = pick.row[0];
  pick.row[2] = pick.row[3] = label(fit6(pick));
  const lowFit = () => f.sheets.get('PP Check').data.some(r => r[1] === 'LOW_FIT' && r[3] === id);
  const flags = () => f.sheets.get(pick.tab).data.find(r => r[0] === id)[8];
  assert.equal(f.adapter.checkAgain().savedMoves, 1);
  assert.equal(lowFit(), false); assert.doesNotMatch(flags(), /Fit 6/);
  f.adapter.sort('Rerun with the lock');
  assert.equal(lowFit(), false); assert.doesNotMatch(flags(), /Fit 6/);
  // Check again after Sort still treats the student as locked.
  assert.equal(f.adapter.checkAgain().savedMoves, 0);
  assert.equal(lowFit(), false);
});

const FRIEND_HEADERS = ['Name', 'Grade', 'Request', 'Classmate', 'Classmate grade', 'Named each other', 'Match', 'Note', 'Use', 'Comment', 'Email', 'Classmate email'];
test('Setup creates Friend requests and the useFriendRequests setting, keeping what is already there', () => {
  const f = fixture(true); f.adapter.practice();
  assert.deepEqual(f.sheets.get('Friend requests').data, [FRIEND_HEADERS]);
  assert.deepEqual(f.sheets.get('Settings').data.find(r => r[0] === 'useFriendRequests').slice(0, 2), ['useFriendRequests', false]);
  // A reviewed tab already in the sheet keeps its columns and rows.
  const reviewed = [FRIEND_HEADERS, ['Practice Student 001', 12, 'With', 'Practice Student 002', 12, true, 'Yes', '', true, 'Invented comment', 'practice1@example.org', 'practice2@example.org']];
  f.sheets.set('Friend requests', new Sheet('Friend requests', reviewed.map(r => r.slice())));
  const settings = f.sheets.get('Settings').data; settings.splice(settings.findIndex(r => r[0] === 'useFriendRequests'), 1);
  assert.equal(f.adapter.readSettings().useFriendRequests, false);
  f.adapter.setup();
  assert.deepEqual(f.sheets.get('Friend requests').data, reviewed);
});
test('friend requests are read by header name, use only rows marked Use, and fill PP Friend check and PP Summary', () => {
  const f = fixture(true); f.adapter.practice();
  // Columns in a different order; the Comment column holds text that must never matter.
  const order = ['Email', 'Classmate email', 'Use', 'Request', 'Name', 'Classmate', 'Comment', 'Named each other', 'Grade', 'Classmate grade', 'Match', 'Note'];
  const row = values => order.map(h => values[h] === undefined ? '' : values[h]);
  f.sheets.set('Friend requests', new Sheet('Friend requests', [order,
    row({ Email: 'practice1@example.org', 'Classmate email': ' PRACTICE2@example.org', Use: true, Request: 'With', Name: 'Practice Student 001', Classmate: 'Practice Student 002', Comment: '=IMPORTXML("ignored")' }),
    row({ Email: 'practice3@example.org', 'Classmate email': 'practice4@example.org', Use: false, Request: 'Not with', Name: 'Practice Student 003', Classmate: 'Practice Student 004' }),
    row({ Email: '', 'Classmate email': 'practice6@example.org', Use: true, Request: 'With', Name: 'Practice Student 005', Classmate: 'Practice Student 006' })]));
  f.sheets.get('Settings').data.find(r => r[0] === 'useFriendRequests')[1] = true;
  f.adapter.sort('Friend requests practice');
  const check = f.sheets.get('PP Friend check').data;
  assert.deepEqual(check[0], ['Name', 'Classmate', 'Request', 'Result', 'Why']);
  assert.deepEqual(check.slice(2).map(r => [r[3], r[4]]), [['Not applied', 'Use is not checked'], ['Not applied', 'Email or classmate email is blank']]);
  assert.ok(['Together', 'Not together'].includes(check[1][3]) && check[1][4]);
  const summary = new Map(f.sheets.get('PP Summary').data.slice(1).map(r => [r[0], r[1]]));
  assert.equal(summary.get('Friend requests'), 'Used');
  assert.equal(summary.get('"With" requests met') + summary.get('"With" requests not met'), 1);
  // Turned off, the groups match a run without the tab, and every request says so.
  const plain = practiceRun('Without friend requests'), off = fixture(true); off.adapter.practice();
  off.sheets.set('Friend requests', new Sheet('Friend requests', f.sheets.get('Friend requests').data.map(r => r.slice())));
  off.adapter.sort('Friend requests off');
  for (const tab of GRADE_TABS) assert.deepEqual(off.sheets.get(tab).data, plain.f.sheets.get(tab).data);
  assert.ok(off.sheets.get('PP Friend check').data.slice(1).every(r => r[3] === 'Not applied' && r[4] === 'Friend requests are turned off in Settings'));
});
test('Check again reports a "Not with" pair put together by hand and rebuilds PP Friend check', () => {
  const { f, run } = practiceRun('Not with practice', f => {
    f.sheets.get('Settings').data.find(r => r[0] === 'useFriendRequests')[1] = true;
    f.sheets.get('Friend requests').data.push(['Practice Student 001', 12, 'Not with', 'Practice Student 002', 12, false, '', '', true, '', 'practice1@example.org', 'practice2@example.org']);
  });
  const one = placedRows(f, run).find(x => x.row[0] === 'practice1@example.org'), two = placedRows(f, run).find(x => x.row[0] === 'practice2@example.org');
  assert.ok(!f.sheets.get('PP Check').data.some(r => r[1] === 'NOT_WITH_TOGETHER'));
  two.row[2] = one.row[2]; two.row[3] = one.row[3];
  const checks = f.adapter.checkAgain();
  assert.ok(checks.some(c => c.code === 'NOT_WITH_TOGETHER' && c.severity === 'error'));
  assert.deepEqual(f.sheets.get('PP Friend check').data[1].slice(3), ['Together', 'In the same group']);
});

test('Setup adds followChecksOverTrack and keeps its value; PP Needs you and PP Summary list students whose answer and checks disagree, also after Check again', () => {
  const f = fixture(true); f.adapter.practice();
  const settings = f.sheets.get('Settings').data, setting = () => settings.find(r => r[0] === 'followChecksOverTrack');
  assert.deepEqual(setting(), ['followChecksOverTrack', false, "TRUE: a student whose Major or Minor answer doesn't match the projects they checked is placed by what they checked."]);
  // A sheet from before this setting uses FALSE, and Setup adds the row. A value already there stays.
  settings.splice(settings.indexOf(setting()), 1);
  assert.equal(f.adapter.readSettings().followChecksOverTrack, false);
  f.adapter.setup(); assert.equal(setting()[1], false);
  setting()[1] = true; f.adapter.setup(); assert.equal(setting()[1], true);
  setting()[1] = false;
  // Practice Student 001 said Major. Now they checked only two Minors.
  f.sheets.get('Senior').data[1][7] = 'Cooking for Comfort; Culture and Cuisine';
  const id = 'practice1@example.org', needs = () => (f.sheets.get('PP Needs you').data.find(r => r[0] === id) || [])[5] || '';
  const count = () => new Map(f.sheets.get('PP Summary').data.slice(1).map(r => [r[0], r[1]])).get('Students whose Major or Minor answer and checks disagree');
  const grade = () => f.sheets.get('PP Senior').data.find(r => r[0] === id);
  let result = f.adapter.sort('Answer and checks disagree');
  assert.ok(['cooking-for-comfort', 'culture-and-cuisine'].every(p => result.projects.some(x => x.id === p && x.finalLength === 'Minor')));
  for (const run of [() => {}, () => f.adapter.checkAgain()]) {
    run();
    assert.match(grade()[2], /^MAJ-/); assert.match(needs(), /Said Major but checked no running Major\./); assert.equal(count(), '1 (followChecksOverTrack is off)');
  }
  setting()[1] = true;
  result = f.adapter.sort('Follow what they checked');
  for (const run of [() => {}, () => f.adapter.checkAgain()]) {
    run();
    assert.deepEqual([grade()[2], grade()[3]].sort(), ['MIN-Cooking for Comfort', 'MIN-Culture and Cuisine']);
    assert.match(grade()[7], / Said Major but checked only Minor projects, so placed by what they checked\.$/);
    assert.match(needs(), /Said Major but placed in Minors they checked\. Move them to a Major on their grade tab if you'd rather\./);
    assert.equal(count(), '1 (followChecksOverTrack is on)');
  }
  // Moved back to a Major by hand, the student is locked, so the row and the count go.
  const major = saved(f).projects.find(p => p.finalLength === 'Major'); grade()[2] = grade()[3] = label(major);
  f.adapter.checkAgain();
  assert.doesNotMatch(needs(), /Said Major/); assert.equal(count(), '0 (followChecksOverTrack is on)');
});

test('Setup adds Max size to an older Project choices tab and keeps its values; a Max size reaches the sort and PP Summary', () => {
  const f = fixture(true); f.adapter.practice();
  const choices = f.sheets.get('Project choices').data;
  assert.equal(choices[0][7], 'Max size');
  // Make it look like a tab from before round 2, with a decision in it.
  choices.forEach(r => r.splice(7)); choices[1][2] = true;
  const before = JSON.stringify(choices);
  f.adapter.setup();
  assert.equal(choices[0][7], 'Max size');
  assert.equal(JSON.stringify(choices.map(r => r.slice(0, 7))), before);
  const plain = f.adapter.sort('No Max size');
  const popular = plain.projects.filter(p => p.finalLength === 'Major').map(p => p.id)[0];
  const sizeOf = r => r.assignments.filter(a => a.project1 === popular).length;
  choices.find(r => r[0] === popular)[7] = 14;
  const big = f.adapter.sort('Max size 14');
  assert.ok(sizeOf(big) >= sizeOf(plain) && sizeOf(big) <= 14);
  const summary = new Map(f.sheets.get('PP Summary').data.slice(1).map(r => [r[0], r[1]]));
  assert.equal(summary.get('Group size: ' + big.projects.find(p => p.id === popular).name), sizeOf(big));
  assert.match(String(summary.get('Group size: ' + big.projects.find(p => p.finalLength === 'Minor').name)), /^Week 1: \d+, week 2: \d+$/);
  choices.find(r => r[0] === popular)[7] = 15;
  assert.throws(() => f.adapter.sort('Too big'), /Max size must be a whole number from 1 to 14/);
});

test('Setup adds Faculty and Location to an older Project choices tab and keeps every value; Faculty can list several names', () => {
  const f = fixture(true); f.adapter.practice();
  const choices = f.sheets.get('Project choices').data;
  assert.deepEqual(choices[0].slice(7), ['Max size', 'Faculty', 'Location']);
  // A tab from round 2, with decisions in it.
  choices.forEach(r => r.splice(8)); choices[1][2] = true; choices[2][7] = 12;
  const before = JSON.stringify(choices);
  f.adapter.setup();
  assert.deepEqual(choices[0].slice(7), ['Max size', 'Faculty', 'Location']);
  assert.equal(JSON.stringify(choices.map(r => r.slice(0, 8))), before);
  choices[1][8] = 'Ms. Rivera,Mr. Chen ,  '; choices[1][9] = 'Room 12';
  f.adapter.setup();
  assert.deepEqual([choices[1][8], choices[1][9]], ['Ms. Rivera,Mr. Chen ,  ', 'Room 12']);
  const details = f.adapter.readDetails();
  assert.deepEqual({ ...details[choices[1][0]] }, { faculty: 'Ms. Rivera, Mr. Chen', location: 'Room 12' });
  assert.deepEqual({ ...details[choices[3][0]] }, { faculty: '', location: '' });
  // The sort never reads them: the same groups with or without.
  const withNames = f.adapter.sort('With faculty').assignments.map(a => [a.studentId, a.project1, a.project2]);
  choices.forEach((r, i) => { if (i) r[8] = r[9] = ''; });
  assert.deepEqual(f.adapter.sort('Without faculty').assignments.map(a => [a.studentId, a.project1, a.project2]), withNames);
});
