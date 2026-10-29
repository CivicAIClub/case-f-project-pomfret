'use strict';
// Invented inputs that touch every placement rule, run through the committed bundle: the practice
// data as it is, and the practice data with genders, gender balancing, friend requests, a Max size,
// leaders and locks. tests/placements.test.cjs compares the result with
// tests/fixtures/round-2-placements.json, which was recorded on round 2's code before round 3.
const crypto = require('node:crypto');
const catalog = require('../../core/catalog.js');
const {loadBundle} = require('./fake-spreadsheet.cjs');

const tab = (f, name) => f.sheets.get(name).data;
const hash = value => crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
function practice() { const f = loadBundle(); f.adapter.practice(); return f; }
function everyRule() {
  const f = practice(), plain = f.adapter.sort('Find the running projects');
  const students = tab(f, 'PP Students').slice(1), email = i => students[i][2];
  const majors = plain.projects.filter(p => p.finalLength === 'Major'), minors = plain.projects.filter(p => p.finalLength === 'Minor');
  const label = p => (p.finalLength === 'Minor' ? 'MIN-' : 'MAJ-') + p.name;
  // Genders from a hash of each email, and one student listed as neither.
  students.forEach((r, i) => tab(f, 'Gender').push([r[2], i === 7 ? 'Nonbinary' : crypto.createHash('sha1').update(String(r[2])).digest()[0] % 2 ? 'Female' : 'Male']));
  const settings = tab(f, 'Settings');
  settings.find(r => r[0] === 'balanceGender')[1] = true;
  settings.find(r => r[0] === 'useFriendRequests')[1] = true;
  const choice = id => tab(f, 'Project choices').find(r => r[0] === id);
  choice(majors[0].id)[7] = 14;
  choice(majors[1].id)[5] = email(3);
  choice(minors[0].id)[5] = email(100);
  tab(f, 'Locked placements').push([email(10), '', label(minors[1]), label(minors[2]), 'Practice', '', 'Invented lock'], [email(11), '', label(majors[2]), '', 'Practice', '', '']);
  // Two students who share a Major are asked apart; two in different Majors ask for each other.
  const before = f.adapter.sort('Every rule but friend requests');
  const inMajor = before.assignments.filter(a => a.status === 'placed' && !a.project2 && !a.locked);
  const together = inMajor.filter(a => a.project1 === inMajor[0].project1), apart = inMajor.find(a => a.project1 !== inMajor[0].project1);
  const friend = (a, b, request) => ['', '', request, '', '', false, '', '', true, '', a, b];
  tab(f, 'Friend requests').push(friend(together[0].studentId, together[1].studentId, 'Not with'), friend(together[2].studentId, apart.studentId, 'With'), friend(apart.studentId, together[2].studentId, 'With'));
  return f.adapter.sort('Every rule').assignments;
}
// Round 3 only adds sentences to the reason saying why a student didn't get a project they checked,
// so the comparison takes those out first.
const name = '(?:' + catalog.map(p => p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
const names = name + '(?:(?:, | and )' + name + ')*';
const added = new RegExp(' (?:None of their picks are running: ' + names + '\\.|' + names + ' (?:was their project|were their projects) last year\\.|Their other picks were full\\.|Their other picks run as (?:Majors|Minors)\\.|Their other pick is their week [12] project\\.|They checked no projects\\.)', 'g');
function withoutWhy(reason) { return String(reason || '').replace(added, ''); }
// Round 4 names each UN goal and capitalizes types, so this turns them back into round 2's wording:
// goal names into their numbers, longest name first, and types into lowercase.
const goalNumbers = require('../../core/parser.js').goals.map((goal, i) => [goal, String(i + 1)]).sort((a, b) => b[0].length - a[0].length);
function withNumbers(reason) {
  return String(reason || '')
    .replace(/UN goal match \(([^)]*)\)/g, (_, list) => 'UN goal match (' + goalNumbers.reduce((text, [goal, n]) => text.split(goal).join(n), list) + ')')
    .replace(/type match \(([^)]*)\)/g, (_, list) => 'type match (' + list.toLowerCase() + ')');
}
// Array.from, because the bundle's arrays come from another realm.
function record(assignments) {
  return Array.from(assignments, a =>[a.studentId, a.status, a.project1, a.project2, a.fit1, a.fit2, a.locked === true, (a.flags || []).join('; '), hash(withNumbers(withoutWhy(a.reason)))]);
}
function scenarios() { return { practice: record(practice().adapter.sort('Practice run').assignments), everyRule: record(everyRule()) }; }
module.exports = { scenarios, withoutWhy, withNumbers };
