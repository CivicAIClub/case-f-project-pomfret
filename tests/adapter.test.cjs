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
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => released++ }) }, Date, console });
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
  assert.equal(majors, 152); assert.equal(minors, 88);
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
    f.sheets.get('Gender').data.push(...emails.map(email => [email, email === odd ? 'Group B' : 'Group A']));
  });
  const pick = placedRows(f, run).find(x => x.row[0] === odd);
  const to = run.projects.find(p => p.finalLength === 'Major' && p.id !== pick.a.project1 && p.id !== pick.a.project2);
  assert.ok(!f.adapter.checkAgain().some(c => c.code === 'GENDER_BALANCE' && c.projectId === to.id));
  pick.row[2] = pick.row[3] = label(to);
  assert.ok(f.adapter.checkAgain().some(c => c.code === 'GENDER_BALANCE' && c.severity === 'warning' && c.projectId === to.id));
});
