'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {scenarios, withoutWhy} = require('./helpers/placement-scenarios.cjs');

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
