'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {scenarios, withoutWhy, withNumbers} = require('./helpers/placement-scenarios.cjs');

// Round 3 changes what the sheet shows, not who goes where. The fixture was recorded on round 2's
// code (main at a46a9c0) from the same invented inputs.
test('round 3 changes no placement: the same invented inputs give round 2\'s assignments', () => {
  const before = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/round-2-placements.json'), 'utf8'));
  const now = scenarios();
  for (const name of Object.keys(before)) assert.deepEqual(now[name], before[name], name);
  assert.deepEqual(Object.keys(now), Object.keys(before));
});

test('only the new sentences are taken out of a reason before comparing', () => {
  const kept = 'Did not check this project; type match (hands); no UN goal match.';
  assert.equal(withoutWhy(kept + ' None of their picks are running: Cinderella, LARP. Cooking for Comfort was their project last year. Their other picks were full.'), kept);
  assert.equal(withoutWhy('Week 1: ' + kept + ' They checked no projects. Week 2: ' + kept), 'Week 1: ' + kept + ' Week 2: ' + kept);
  assert.equal(withoutWhy(kept + ' Their picks were full.'), kept + ' Their picks were full.');
});

test('goal names and capitalized types are turned back into round 2\'s numbers and lowercase before comparing', () => {
  assert.equal(withNumbers('Checked this project; type match (Head, Hands); UN goal match (Industry, Innovation and Infrastructure, Good Health and Well-Being).'),
    'Checked this project; type match (head, hands); UN goal match (9, 3).');
  assert.equal(withNumbers('Week 1: Did not check this project; type match (Feet); UN goal match (Peace, Justice and Strong Institutions). Week 2: Checked this project; no type match; UN goal match (Life on Land).'),
    'Week 1: Did not check this project; type match (feet); UN goal match (16). Week 2: Checked this project; no type match; UN goal match (15).');
  // Text outside those two kinds of brackets is left alone.
  assert.equal(withNumbers('Leading Climate Action Club, so placed there. no type match; no UN goal match.'), 'Leading Climate Action Club, so placed there. no type match; no UN goal match.');
});
