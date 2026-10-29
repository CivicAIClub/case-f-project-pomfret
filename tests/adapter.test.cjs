'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {Sheet, newDataValidation, spreadsheetFor} = require('./helpers/fake-spreadsheet.cjs');
const realEngine = require('../core/engine.js');
function fixture(useRealCore = false) {
  const sheets = new Map(), spreadsheet = spreadsheetFor(sheets);
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
  return { adapter, sheets, spreadsheet, catalog, context, source, engine, checked: () => checkedAssignments, released: () => released };
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
const INPUT_TABS = { 12: 'Senior', 11: 'Junior', 10: 'Sophomore' };
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
test('Check again reports a hand move into last year\'s project as information', () => {
  let { f, run } = practiceRun('Before the last-year answer');
  const first = placedRows(f, run).find(x => x.tab === 'PP Junior' && !x.a.project2), id = first.row[0];
  const to = run.projects.find(p => p.finalLength === 'Major' && p.id !== first.a.project1);
  f.sheets.get('Junior').data.find(r => r[1] === id)[3] = to.name;
  f.adapter.sort('After the last-year answer'); run = saved(f);
  assert.deepEqual([...run.students.get(id).previous], [to.id]);
  const pick = placedRows(f, run).find(x => x.row[0] === id);
  assert.notEqual(pick.a.project1, to.id);
  pick.row[2] = pick.row[3] = label(to);
  const checks = [...f.adapter.checkAgain()].filter(c => c.code === 'PREVIOUS_PROJECT' && c.studentId === id);
  assert.deepEqual(checks.map(c => [c.severity, c.message]), [['info', "In last year's project because of a move by hand."]]);
  assert.ok(f.sheets.get('PP Check').data.some(r => r[0] === 'info' && r[1] === 'PREVIOUS_PROJECT' && r[3] === id));
  assert.ok(!f.sheets.get('PP Check').data.some(r => r[0] === 'error' && r[1] === 'PREVIOUS_PROJECT'));
  // The flag is information, so Review flags and PP Needs you leave it out.
  assert.doesNotMatch(f.sheets.get('PP Junior').data.find(r => r[0] === id)[8], /last year's project/);
  assert.ok(!f.sheets.get('PP Needs you').data.some(r => /last year's project/.test(r[5])));
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
  assert.ok(f.sheets.get(registry.get(target.id)).data.some(r => r[0] === pick.s.name && r[1] === pick.s.grade));
  assert.ok(!f.sheets.get(registry.get(pick.a.project1)).data.some(r => r[0] === pick.s.name));
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

// The blocks of a tab laid out for printing: each title or heading row, its header row, and the rows
// under it up to the next blank row.
function blocks(sheet, isTitle) {
  const out = [];
  sheet.data.forEach((row, i) => {
    if (isTitle(row[0])) out.push({ title: row[0], row: i + 1, header: sheet.data[i + 1], rows: [] });
    else if (out.length && i > out[out.length - 1].row && row.some(v => v !== '') && !out[out.length - 1].closed) out[out.length - 1].rows.push(row);
    else if (out.length && i > out[out.length - 1].row && row.every(v => v === '')) out[out.length - 1].closed = true;
  });
  return out;
}
const MASTER_LIST_HEADER = ['Name', 'Project #1', 'Project Faculty', 'Project #2', 'Project Faculty', 'Why'];
test('PP Master list has seniors, juniors and sophomores by last name, with both projects, their faculty and the reason; Check again rebuilds it', () => {
  const f = fixture(true); f.adapter.practice();
  // Invented names in both formats, and a senior on a trip.
  const senior = f.sheets.get('Senior').data;
  senior[1][2] = 'Zimmer, Ava'; senior[2][2] = 'Ben Adams'; senior[3][2] = 'Cy Young Jr.';
  f.sheets.get('Status changes').data.push([senior[4][1], '', 'trip', 'ExEd trip']);
  f.sheets.get('Project choices').data.slice(1).forEach(r => { r[8] = 'Faculty of ' + r[1]; });
  const result = f.adapter.sort('Master list'), run = saved(f), list = f.sheets.get('PP Master list');
  const sections = blocks(list, v => /^(SENIORS|JUNIORS|SOPHOMORES)$/.test(v));
  assert.deepEqual(sections.map(s => s.title), ['SENIORS', 'JUNIORS', 'SOPHOMORES']);
  for (const s of sections) { assert.ok(list.isBold(s.row), s.title); assert.deepEqual(s.header, MASTER_LIST_HEADER); assert.ok(!list.isBold(s.row + 2)); }
  // Last names: the practice names end in a number, which sorts before letters.
  const names = sections[0].rows.map(r => r[0]);
  assert.deepEqual(names.slice(-3), ['Ben Adams', 'Cy Young Jr.', 'Zimmer, Ava']);
  assert.deepEqual(names.slice(0, -3), names.slice(0, -3).slice().sort());
  assert.ok(!names.includes(senior[4][2]));
  assert.equal(sections.reduce((n, s) => n + s.rows.length, 0), result.summary.placed);
  const byName = new Map(sections.flatMap(s => s.rows).map(r => [r[0], r]));
  for (const [id, a] of run.assignments) {
    const s = run.students.get(id), row = byName.get(s.name);
    if (a.status !== 'placed') { assert.equal(row, undefined); continue; }
    const one = run.projects.find(p => p.id === a.project1), two = run.projects.find(p => p.id === (a.project2 || a.project1));
    assert.deepEqual(row, [s.name, label(one), 'Faculty of ' + one.name, label(two), 'Faculty of ' + two.name, a.reason]);
  }
  // A hand move shows up after Check again.
  const pick = placedRows(f, run).find(x => x.a.project2), target = moveToMajor(f, run, pick);
  f.adapter.checkAgain();
  const moved = blocks(f.sheets.get('PP Master list'), v => /^(SENIORS|JUNIORS|SOPHOMORES)$/.test(v)).flatMap(s => s.rows).find(r => r[0] === pick.s.name);
  assert.deepEqual(moved.slice(0, 5), [pick.s.name, label(target), 'Faculty of ' + target.name, label(target), 'Faculty of ' + target.name]);
  assert.match(moved[5], /^Moved by hand\. /);
});

const PROJECTS_HEADER = ['#', 'Project', 'Location', 'Faculty', 'Week 1', 'Week 2', 'Male', 'Female', 'Seniors', 'Juniors', 'Sophomores', 'Picked it', 'Flags'];
test('PP Projects has a row per running project with its sizes, genders, grades, how many picked it and plain flags; Check again rebuilds it', () => {
  const f = fixture(true); f.adapter.practice(); f.adapter.prepare();
  // Invented genders: every third student is Female.
  f.sheets.get('PP Students').data.slice(1).forEach((r, i) => f.sheets.get('Gender').data.push([r[2], i % 3 ? 'Male' : 'Female']));
  const plain = f.adapter.sort('Find the projects'), majors = plain.projects.filter(p => p.finalLength === 'Major').sort((a, b) => a.name.localeCompare(b.name));
  const [open, sized] = majors, choices = f.sheets.get('Project choices').data, choice = id => choices.find(r => r[0] === id);
  choice(sized.id)[7] = 14; choice(open.id)[8] = 'Ms. Rivera, Mr. Chen'; choice(open.id)[9] = 'Room 12';
  f.adapter.sort('Projects overview');
  const run = saved(f), tab = () => f.sheets.get('PP Projects').data;
  assert.deepEqual(tab()[0], PROJECTS_HEADER);
  const rows = tab().slice(1), order = run.projects.slice().sort((a, b) => (a.finalLength === 'Major' ? 0 : 1) - (b.finalLength === 'Major' ? 0 : 1) || a.name.localeCompare(b.name));
  assert.deepEqual(rows.map(r => r[1]), order.map(label));
  assert.deepEqual(rows.map(r => r[0]), order.map((_, i) => i + 1));
  const students = [...run.students.values()];
  for (const [i, p] of order.entries()) {
    const weeks = (p.finalLength === 'Minor' ? [0, 1] : [0]).map(w => [...run.assignments.values()].filter(a => a.status === 'placed' && (w ? a.project2 : a.project1) === p.id).map(a => run.students.get(a.studentId)));
    const count = test => weeks.map(g => g.filter(test).length), show = test => count(test).join(' / ');
    const flags = weeks.flatMap((g, w) => {
      const when = weeks.length === 2 ? ' in week ' + (w + 1) : '', male = g.filter(s => s.gender === 'Male').length, female = g.filter(s => s.gender === 'Female').length;
      return [...(p.id !== sized.id && g.length > 12 ? ['Over 12 students' + when] : []), ...(g.length < 8 ? ['Under 8 students' + when] : []), ...((male && male < 3) || (female && female < 3) ? ['Fewer than 3 of one gender' + when] : [])];
    });
    const sizes = weeks.map(g => g.length);
    assert.deepEqual(rows[i].slice(4), [sizes[0], sizes[sizes.length - 1], ...[s => s.gender === 'Male', s => s.gender === 'Female', s => s.grade === 12, s => s.grade === 11, s => s.grade === 10, s => s.choices.includes(p.id)].map(t => weeks.length === 2 ? show(t) : count(t)[0]), flags.join('; ')], p.name);
  }
  assert.deepEqual(rows.find(r => r[1] === label(open)).slice(2, 4), ['Room 12', 'Ms. Rivera, Mr. Chen']);
  assert.ok(students.length && rows.some(r => /Fewer than 3 of one gender/.test(r[12])));
  // Four Minor students moved by hand into each of two Majors: over 12 is flagged only without a Max size.
  const minors = placedRows(f, run).filter(x => x.a.project2);
  minors.slice(0, 4).forEach(x => { x.row[2] = x.row[3] = label(open); });
  minors.slice(4, 8).forEach(x => { x.row[2] = x.row[3] = label(sized); });
  f.adapter.checkAgain();
  const after = id => tab().find(r => r[1] === label(run.projects.find(p => p.id === id)));
  assert.ok(after(open.id)[4] > 12 && after(sized.id)[4] > 12);
  assert.match(after(open.id)[12], /^Over 12 students/);
  assert.doesNotMatch(after(sized.id)[12], /Over 12/);
});

test('each project tab is laid out like last year\'s roster: label, faculty, location, then students by grade and last name with a bold total; a Minor has a block for each week', () => {
  const f = fixture(true); f.adapter.practice(); f.adapter.setup();
  const plain = f.adapter.sort('Find the projects'), major = plain.projects.find(p => p.finalLength === 'Major'), minor = plain.projects.find(p => p.finalLength === 'Minor');
  const choice = f.sheets.get('Project choices').data.find(r => r[0] === major.id); choice[8] = 'Ms. Rivera,Mr. Chen'; choice[9] = 'Room 12';
  f.adapter.sort('Rosters');
  const run = saved(f), registry = new Map(f.sheets.get('PP Project tabs').data.slice(1).map(r => [r[0], r[2]]));
  const HEADER = ['Student', 'Grade', 'Celebration of Learning', 'Why'];
  const members = (p, w) => [...run.assignments.values()].filter(a => a.status === 'placed' && (w ? a.project2 : a.project1) === p.id).map(a => ({ s: run.students.get(a.studentId), a }));
  const order = list => list.slice().sort((x, y) => y.s.grade - x.s.grade || x.s.name.localeCompare(y.s.name)).map(x => [x.s.name, x.s.grade, x.s.celebration, x.a.reason]);
  // The Major: one block.
  let tab = f.sheets.get(registry.get(major.id)), group = members(major, 0);
  assert.deepEqual(tab.data.slice(0, 4).map(r => r[0]), [label(major), 'Faculty: Ms. Rivera, Mr. Chen', 'Location: Room 12', 'Student']);
  assert.deepEqual(tab.data[3], HEADER);
  assert.deepEqual(tab.data.slice(4, -1), order(group));
  assert.deepEqual(tab.data[tab.data.length - 1][0], 'TOTAL - ' + group.length + ' Students');
  assert.ok(tab.isBold(1) && tab.isBold(tab.data.length) && !tab.isBold(2) && !tab.isBold(5));
  // Practice answers show the kind of Celebration only, and no comment appears.
  assert.ok(group.length && tab.data.slice(4, -1).every(r => ['Project Fair', 'Presentation', 'Performance', 'Gallery Walk'].includes(r[2])));
  assert.ok(!tab.data.flat().some(v => /Invented practice response|Show what we made|A short scene/.test(String(v))));
  // The Minor: GROUP 1 and GROUP 2, each with its header and total. Blank faculty and location stay blank.
  tab = f.sheets.get(registry.get(minor.id));
  const one = members(minor, 0), two = members(minor, 1), expected = [[label(minor)], ['Faculty:'], ['Location:'],
    ['GROUP 1 (week 1)'], HEADER, ...order(one), ['GROUP 1 TOTAL - ' + one.length + ' Students'], [''],
    ['GROUP 2 (week 2)'], HEADER, ...order(two), ['GROUP 2 TOTAL - ' + two.length + ' Students']];
  assert.deepEqual(tab.data.map(r => r.slice(0, 4).join('|').replace(/\|+$/, '')), expected.map(r => r.join('|')));
  const bold = tab.data.map((_, i) => tab.isBold(i + 1));
  assert.deepEqual(tab.data.map((r, i) => bold[i] ? r[0] : null).filter(Boolean), [label(minor), 'GROUP 1 (week 1)', 'Student', 'GROUP 1 TOTAL - ' + one.length + ' Students', 'GROUP 2 (week 2)', 'Student', 'GROUP 2 TOTAL - ' + two.length + ' Students']);
  // Grades go seniors, juniors, then sophomores within each block.
  for (const g of [one, two]) assert.ok(order(g).every((r, i, all) => !i || all[i - 1][1] >= r[1]));
});

test('the sentence saying why a student didn\'t get a pick shows in PP Master list, the project tabs, PP Needs you and PP Seniors to check', () => {
  const f = fixture(true); f.adapter.practice(); f.adapter.setup();
  // The first senior checked only Glass Fusing, and it doesn't run.
  const senior = f.sheets.get('Senior').data, name = senior[1][2];
  senior[1][7] = 'Glass Fusing'; f.sheets.get('Project choices').data.find(r => r[0] === 'glass-fusing')[2] = false;
  f.adapter.sort('Missed picks');
  const run = saved(f), id = senior[1][1], a = run.assignments.get(id), reason = a.reason;
  assert.equal(a.status, 'placed'); assert.match(reason, / None of their picks are running: Glass Fusing\.$/);
  const registry = new Map(f.sheets.get('PP Project tabs').data.slice(1).map(r => [r[0], r[2]]));
  const rowFor = (tab, column) => f.sheets.get(tab).data.find(r => r[column] === name);
  assert.equal(rowFor('PP Master list', 0)[5], reason);
  assert.equal(rowFor(registry.get(a.project1), 0)[3], reason);
  assert.equal(rowFor('PP Seniors to check', 0)[4], reason);
  // PP Needs you shows each listed student's reason, and some of those say why they missed a pick.
  const needs = f.sheets.get('PP Needs you').data.slice(1);
  for (const r of needs) assert.equal(r[4], run.assignments.get(r[0]).reason);
  assert.ok(needs.some(r => / None of their picks are running: .*\.| Their other picks were full\./.test(r[4])));
  assert.equal(f.sheets.get('PP Senior').data.find(r => r[0] === id)[7], reason);
});

test('PP Not placed lists every student who isn\'t placed and why, with a trip\'s destination from the email column; an uncolored destination is a PP Input check warning', () => {
  const f = fixture(true); f.adapter.practice();
  const senior = f.sheets.get('Senior'), typed = (name, where) => ['', where, name, '', '', '', '', '', '', ''];
  // Hand-typed rows with a destination where the email goes: one blue, one not.
  senior.data.push(typed('Rivera, Sam', 'COSTA RICA'), typed('Chen, Lee', 'JAPAN'));
  senior.getRange(senior.data.length - 1, 3).setBackground('#00ffff');
  // A freshman leader (orange) and a student a person put in review.
  senior.getRange(3, 3).setBackground('#ff9900');
  f.sheets.get('Status changes').data.push([senior.data[3][1], '', 'review', 'Check this student']);
  const result = f.adapter.sort('Not placed'), rows = f.sheets.get('PP Not placed').data;
  assert.deepEqual(rows[0], ['Name', 'Grade', 'Status', 'Why']);
  const row = name => rows.find(r => r[0] === name);
  assert.deepEqual(row('Rivera, Sam'), ['Rivera, Sam', 12, 'Excluded', 'ExEd trip: Costa Rica']);
  assert.deepEqual(row(senior.data[2][2]), [senior.data[2][2], 12, 'Excluded', 'Freshman leader']);
  assert.deepEqual(row(senior.data[3][2]).slice(0, 3), [senior.data[3][2], 12, 'Needs review']);
  assert.match(row(senior.data[3][2])[3], /^Needs review: .*Status changed: Check this student/);
  assert.equal(rows.length - 1, result.summary.total - result.summary.placed);
  // The uncolored row has no form, so it is placed after everyone else, with a warning.
  assert.equal(row('Chen, Lee'), undefined);
  assert.ok(f.sheets.get('PP Input check').data.some(r => r[0] === 'warning' && r[1] === 'DESTINATION_NOT_TRIP' && /"Chen, Lee" has "Japan" in the email column but isn't colored blue/.test(r[2])));
  assert.ok(!f.sheets.get('PP Input check').data.some(r => r[1] === 'DESTINATION_NOT_TRIP' && /Rivera/.test(r[2])));
  assert.ok(!blocks(f.sheets.get('PP Master list'), v => /^(SENIORS|JUNIORS|SOPHOMORES)$/.test(v)).flatMap(s => s.rows).some(r => r[0] === 'Rivera, Sam'));
});

test('a Gender row saying Nonbinary reaches the sheet as written: counted as neither in PP Projects, two counts in PP Input check, and never "unknown"', () => {
  const f = fixture(true); f.adapter.practice(); f.adapter.prepare();
  const rows = f.sheets.get('PP Students').data.slice(1), gender = f.sheets.get('Gender').data;
  // Every student but the last has a row: the first says Nonbinary, the rest alternate.
  rows.slice(0, -1).forEach((r, i) => gender.push([r[2], i ? (i % 2 ? 'Female' : 'Male') : 'Nonbinary']));
  f.adapter.sort('Gender wording');
  const run = saved(f), first = rows[0][0], a = run.assignments.get(first);
  assert.equal(run.students.get(first).gender, 'Nonbinary');
  assert.equal(f.sheets.get('PP Students').data.find(r => r[0] === first)[10], 'Nonbinary');
  const input = f.sheets.get('PP Input check').data;
  assert.ok(input.some(r => r[1] === 'GENDER_NOT_COUNTED' && r[2] === 'Of the students who can be placed, 1 has no gender on file and 1 is not listed as Male or Female. Neither is counted as Male or Female in the groups.'));
  const p = run.projects.find(x => x.id === a.project1), row = f.sheets.get('PP Projects').data.find(r => r[1] === label(p));
  const split = v => String(v).split(' / ').map(Number), sizes = p.finalLength === 'Minor' ? [row[4], row[5]] : [row[4]];
  assert.equal(split(row[6])[0] + split(row[7])[0], sizes[0] - 1 - (run.assignments.get(rows[rows.length - 1][0]).project1 === p.id ? 1 : 0));
  for (const tab of ['PP Check', 'PP Input check']) assert.ok(!f.sheets.get(tab).data.some(r => /unknown/i.test(String(r[2]))), tab);
});

test('every flag is either information or needs a decision, and anything not on the information list needs a decision', () => {
  const f = fixture(true), decide = flag => f.adapter.needsDecision(flag);
  const information = ['Historical project not on current list; no renamed-project equivalence was assumed.', 'Latest timestamped submission retained; 1 older submission(s) removed.',
    'Green status: the app considered this student after everyone else.', 'Checked only one project, so placed after everyone else.', 'Checked no projects, so placed after everyone else.',
    'Only one current project was checked; there is no priority bonus for a narrow choice.', 'Leading Cinderella, so placed there.', 'Previous-project exception: named leader of Cinderella.',
    "In last year's project because of a lock.", "In last year's project because of a move by hand.", 'Moved to another group to balance the groups.',
    'Swapped with a student in another group to balance the groups.', 'Swapped into this group so classmates who asked to work together could, with no worse fit.'];
  const decisions = ["Said Major but placed in Minors they checked. Move them to a Major on their grade tab if you'd rather.", "Said Minor but placed in a Major they checked. Move them to two Minors on their grade tab if you'd rather.",
    'Said Major but checked no running Major.', 'Said Minor but checked fewer than two running Minors.', 'Fit 6: review the placement.',
    'Two students sent their forms from the same email. Check that both answers are right.', 'Valid email is missing; reconcile this roster entry.', 'No response: check.', 'No current running project was checked.',
    // Not on either list, so they need a decision.
    'This student asked for a Major but received Minors to reach the Minor student minimum.', 'Past project information is missing.', 'Moved because a classmate asked not to work with them.',
    'Moved to another group because of a "Not with" friend request. Fit dropped 2 steps.', "Couldn't match last year's project: Robotics club.", "No answer about last year's project.",
    'No recognized project Type.', 'No recognized UN goal.', "An older form from this email gave the name differently. Check it's the same student.", "Matched a hand-typed row by last name only. Check it's the same student.",
    'Status changed: Back from the trip', 'The Gender tab lists this student with different values, so they are not counted as Male or Female.'];
  assert.deepEqual(information.filter(decide), []);
  assert.deepEqual(decisions.filter(x => !decide(x)), []);
});

test('PP Needs you and Review flags show only flags that need a decision; PP Students and the snapshot keep every flag; Check again keeps it that way', () => {
  const f = fixture(true); f.adapter.practice();
  const first = f.adapter.sort('Find the students'), plain = saved(f), students = [...plain.students.values()];
  const clean = students.find(s => s.grade === 12 && !plain.assignments.get(s.id).flags.length && !s.issues.length);
  const fit6 = students.find(s => plain.assignments.get(s.id).flags.join() === 'Fit 6: review the placement.' && !s.issues.length);
  const review = students.find(s => s.grade === 11 && s !== fit6);
  // A retired project as last year's answer adds only the historical-project issue, and a leader gets
  // only the leader flag. A person puts a third student in review.
  for (const s of [clean, fit6]) f.sheets.get(INPUT_TABS[s.grade]).data.find(r => r[1] === s.id)[3] = 'Escape Room';
  // The leader leads a Major they checked, so the only new flag is the leader flag.
  const leader = students.find(s => s.grade === 10 && s !== fit6 && !plain.assignments.get(s.id).flags.length && !s.issues.length && first.projects.some(p => p.finalLength === 'Major' && s.choices.includes(p.id)));
  const led = first.projects.find(p => p.finalLength === 'Major' && leader.choices.includes(p.id));
  f.sheets.get('Project choices').data.find(r => r[0] === led.id)[5] = leader.id;
  f.sheets.get('Status changes').data.push([review.id, '', 'review', 'Check this student']);
  f.adapter.sort('Decisions only');
  const run = saved(f), needs = () => new Map(f.sheets.get('PP Needs you').data.slice(1).map(r => [r[0], r[5]]));
  const reviewFlags = s => f.sheets.get(['', '', '', '', '', '', '', '', '', '', 'PP Sophomore', 'PP Junior', 'PP Senior'][s.grade]).data.find(r => r[0] === s.id)[8];
  const historical = 'Historical project not on current list; no renamed-project equivalence was assumed.';
  const check = () => {
    const listed = needs();
    assert.ok(!listed.has(clean.id)); assert.equal(reviewFlags(clean), '');
    assert.equal(listed.get(fit6.id), 'Fit 6: review the placement.'); assert.equal(reviewFlags(fit6), 'Fit 6: review the placement.');
    assert.ok(!listed.has(leader.id)); assert.equal(reviewFlags(leader), '');
    assert.match(listed.get(review.id), /Status changed: Check this student/);
  };
  check();
  // Nothing is lost: PP Students has the issue, and the snapshot has the leader's flag.
  const issues = new Map(f.sheets.get('PP Students').data.slice(1).map(r => [r[0], r[12]]));
  assert.equal(issues.get(clean.id), historical); assert.equal(issues.get(fit6.id), historical);
  assert.deepEqual([...run.assignments.get(leader.id).flags], ['Leading ' + led.name + ', so placed there.']);
  assert.equal(run.assignments.get(review.id).status, 'review');
  // After someone else is moved by hand, Check again shows the same.
  const other = placedRows(f, run).find(x => x.a.project2 && ![clean.id, fit6.id, leader.id].includes(x.row[0]));
  moveToMajor(f, run, other); f.adapter.checkAgain();
  check();
});

test('a project tab name turns a slash into " - " and never has two spaces in a row; a tab with the old name is removed on the next Sort', () => {
  const f = fixture();
  assert.equal(f.adapter.groupTabName(0, 'A / B'), 'PP Group 01 A - B');
  assert.equal(f.adapter.groupTabName(1, 'Biomimicry / 3D Adaptive Tools'), 'PP Group 02 Biomimicry - 3D Adaptive Tools');
  assert.equal(f.adapter.groupTabName(16, 'The People v. The System: Class Actions and Social Change'), 'PP Group 17 The People v. The System Class Actions and Social Change');
  assert.equal(f.adapter.groupTabName(2, 'Trail Mix/Rock  Climbing'), 'PP Group 03 Trail Mix - Rock Climbing');
  // A sheet from round 2: its tab used the old name, and PP Project tabs listed it.
  f.source(); f.catalog[0].name = 'A / B';
  f.sheets.set('PP Group 01 A   B', new Sheet('PP Group 01 A   B', [['Session', 'Name', 'Grade', 'Student ID', 'Fit', 'Reason']]));
  f.sheets.set('PP Project tabs', new Sheet('PP Project tabs', [['Project ID', 'Project', 'Sheet', 'Length'], ['robotics', 'A / B', 'PP Group 01 A   B', 'Major']]));
  f.adapter.sort('New tab names');
  const groups = () => [...f.sheets.keys()].filter(n => n.startsWith('PP Group'));
  assert.deepEqual(groups(), ['PP Group 01 A - B']);
  assert.equal(f.sheets.get('PP Group 01 A - B').data[0][0], 'MAJ-A / B');
  assert.deepEqual(f.sheets.get('PP Project tabs').data.slice(1).map(r => r[2]), ['PP Group 01 A - B']);
  // Even when PP Project tabs no longer lists it, the old name goes.
  f.sheets.set('PP Group 01 A   B', new Sheet('PP Group 01 A   B'));
  f.sheets.get('PP Project tabs').data.splice(1);
  f.adapter.sort('Old tab without a list');
  assert.deepEqual(groups(), ['PP Group 01 A - B']);
  // A tab for a project that no longer runs is removed too.
  f.sheets.set('PP Group 02 Old project', new Sheet('PP Group 02 Old project'));
  f.sheets.get('PP Project tabs').data.push(['old', 'Old project', 'PP Group 02 Old project', 'Major']);
  f.adapter.sort('A project stopped running');
  assert.deepEqual(groups(), ['PP Group 01 A - B']);
});

// The widths Mr. Litowitz asked for, by header, written out here on their own.
const WIDTH_TABLE = { '#': 45, 'Grade': 70, 'Fit #1': 70, 'Fit #2': 70, 'Status': 90, 'Severity': 90, 'Preference': 90, 'Use': 90,
  'Week 1': 85, 'Week 2': 85, 'Male': 85, 'Female': 85, 'Seniors': 85, 'Juniors': 85, 'Sophomores': 85, 'Picked it': 85, 'Location': 130,
  'Faculty': 160, 'Project Faculty': 160, 'Celebration of Learning': 190, 'Name': 210, 'Student': 210, 'Classmate': 210,
  'Student ID': 230, 'Email': 230, 'Classmate email': 230, 'Code': 230, 'Project': 270, 'Project #1': 270, 'Project #2': 270, 'Project 1': 270, 'Project 2': 270,
  'Metric': 420, 'Value': 220, 'Why': 560, 'Reason': 560, 'Message': 560, 'Student comment': 560, 'Comment': 560, 'Issues': 560, 'Flags': 420, 'Review flags': 420 };
const ppTabs = f => [...f.sheets.values()].filter(s => s.name.startsWith('PP '));
const layoutTab = name => name === 'PP Master list' || name === 'PP Start here' || /^PP Group \d{2} /.test(name);
test('PP tabs get column widths from their headers and never auto-resize; the layout tabs use the widths their writers pass', () => {
  const { f, run } = practiceRun('Widths');
  const check = () => {
    for (const s of ppTabs(f)) {
      assert.equal(s.autoResized, 0, s.name);
      if (layoutTab(s.name)) continue;
      s.data[0].forEach((header, i) => assert.equal(s.getColumnWidth(i + 1), (s.name === 'PP Projects' && (header === 'Project' || header === 'Flags')) ? 300 : WIDTH_TABLE[header] ?? 140, s.name + ': ' + header));
    }
    const widths = (name, n) => Array.from({ length: n }, (_, i) => f.sheets.get(name).getColumnWidth(i + 1));
    assert.deepEqual(widths('PP Master list', 6), [220, 270, 150, 270, 150, 560]);
    const group = [...f.sheets.keys()].find(n => /^PP Group 01 /.test(n));
    assert.deepEqual(widths(group, 4), [220, 70, 190, 620]);
    assert.equal(f.sheets.get('PP Needs you').getColumnWidth(f.sheets.get('PP Needs you').data[0].indexOf('Reason') + 1), 560);
  };
  check();
  // A run of equal widths is one call: PP Projects takes six.
  assert.equal(f.sheets.get('PP Projects').widthCalls, 6);
  // Setup and Make practice data still size the tabs they create to their text.
  assert.ok(f.sheets.get('Settings').autoResized > 0);
  moveToMajor(f, run, placedRows(f, run).find(x => x.a.project2)); f.adapter.checkAgain();
  check();
});

test('every written cell is aligned to the top, long-text columns wrap, number columns are centered, and the right rows and columns are frozen', () => {
  const { f, run } = practiceRun('Text and alignment');
  const check = () => {
    for (const s of ppTabs(f)) {
      const width = Math.max(...s.data.map(r => r.length)), layout = layoutTab(s.name);
      // Every written cell, header included, is aligned to the top.
      for (let r = 1; r <= s.data.length; r++) for (let c = 1; c <= width; c++) assert.equal(s.formatOf('valign', r, c), 'top', s.name + ' ' + r + ',' + c);
      assert.deepEqual([s.getFrozenRows(), s.getFrozenColumns()], [layout ? 0 : 1, ['PP Needs you', 'PP Projects', 'PP Senior', 'PP Junior', 'PP Sophomore'].includes(s.name) ? 2 : 0], s.name);
      for (let c = 1; c <= width; c++) {
        const header = layout ? null : s.data[0][c - 1], last = s.data.length;
        assert.equal(s.formatOf('wrap', last, c) === true, s.getColumnWidth(c) >= 420, s.name + ' wrap ' + c);
        if (header !== null) assert.equal(s.formatOf('halign', last, c) === 'center', ['#', 'Grade', 'Fit #1', 'Fit #2', 'Week 1', 'Week 2', 'Male', 'Female', 'Seniors', 'Juniors', 'Sophomores', 'Picked it', 'Checked', 'Checked + Type or goal'].includes(header), s.name + ' center ' + header);
      }
      // The maroon header row, as before.
      if (!layout) for (let c = 1; c <= width; c++) { assert.ok(s.isBold(1, c)); assert.equal(s.colors.get('1,' + c), '#9e2132'); assert.equal(s.formatOf('fontColor', 1, c), '#ffffff'); }
    }
    // On a project tab only Grade is centered.
    const group = f.sheets.get([...f.sheets.keys()].find(n => /^PP Group 01 /.test(n)));
    assert.deepEqual([1, 2, 3, 4].map(c => group.formatOf('halign', 5, c) || ''), ['', 'center', '', '']);
  };
  check();
  // A fill left on a row from an earlier run is gone after the next write.
  f.sheets.get('PP Needs you').getRange(3, 1, 1, 6).setBackground('#00ff00');
  f.adapter.sort('Rerun');
  assert.equal(f.sheets.get('PP Needs you').colors.get('3,1'), undefined);
  moveToMajor(f, run, placedRows(f, saved(f)).find(x => x.a.project2)); f.adapter.checkAgain();
  check();
});

test('the grade tabs keep their dropdowns after Sort and after Check again', () => {
  const { f, run } = practiceRun('Dropdowns'), labels = run.projects.map(label).sort();
  const check = () => {
    for (const tab of GRADE_TABS) {
      const sheet = f.sheets.get(tab), rows = sheet.data.length - 1, rules = sheet.getRange(2, 3, rows, 2).getDataValidations().flat();
      assert.equal(rules.filter(Boolean).length, rows * 2, tab);
      for (const rule of rules) assert.deepEqual(rule.values, labels);
    }
  };
  check();
  moveToMajor(f, run, placedRows(f, run).find(x => x.a.project2)); f.adapter.checkAgain();
  check();
  f.adapter.sort('Sort again'); check();
});

test('layout tabs: shaded grade titles on PP Master list; a large label, gray Faculty and Location, shaded GROUP and TOTAL rows on the project tabs, each style in one call', () => {
  const { f, run } = practiceRun('Layout styles');
  const cells = (s, row, n) => Array.from({ length: n }, (_, i) => i + 1);
  const list = f.sheets.get('PP Master list');
  for (const [i, row] of list.data.entries()) {
    const title = /^(SENIORS|JUNIORS|SOPHOMORES)$/.test(row[0]);
    for (const c of cells(list, i + 1, 6)) {
      assert.equal(list.colors.get((i + 1) + ',' + c) === '#F4E4E6', title, 'fill ' + (i + 1));
      if (title) { assert.ok(list.isBold(i + 1, c)); assert.equal(list.formatOf('fontSize', i + 1, c), 12); }
    }
  }
  const registry = new Map(f.sheets.get('PP Project tabs').data.slice(1).map(r => [r[0], r[2]]));
  const minor = f.sheets.get(registry.get(run.projects.find(p => p.finalLength === 'Minor').id));
  const style = (s, row) => ({ bold: s.isBold(row), size: s.formatOf('fontSize', row) || null, fill: s.colors.get(row + ',1') || null, color: s.formatOf('fontColor', row) || null });
  assert.deepEqual(style(minor, 1), { bold: true, size: 14, fill: null, color: null });
  assert.deepEqual([style(minor, 2), style(minor, 3)], [{ bold: false, size: null, fill: null, color: '#666666' }, { bold: false, size: null, fill: null, color: '#666666' }]);
  for (const [i, row] of minor.data.entries()) {
    const kind = /^GROUP \d \(week \d\)$/.test(row[0]) ? 'group' : /TOTAL - \d+ Students?$/.test(row[0]) ? 'total' : null;
    if (!kind) continue;
    for (let c = 1; c <= 4; c++) { assert.ok(minor.isBold(i + 1, c)); assert.equal(minor.colors.get((i + 1) + ',' + c), kind === 'group' ? '#F4E4E6' : '#EEEEEE'); }
  }
  assert.equal(minor.data.filter(r => /^GROUP \d \(week \d\)$/.test(r[0])).length, 2);
  // Five styles on a Minor's tab (title, gray, GROUP, header, TOTAL): five calls, one per style.
  assert.equal(minor.rangeLists, 5);
});
