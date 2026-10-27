'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {loadBundle} = require('../tests/helpers/fake-spreadsheet.cjs');

function runPractice() {
  const workbook = loadBundle();
  workbook.adapter.practice();
  const sources = ['Projects', 'Senior', 'Junior', 'Sophomore'];
  const before = JSON.stringify(sources.map(name => workbook.sheets.get(name).data));
  workbook.adapter.prepare();
  workbook.adapter.interest();
  const result = workbook.adapter.sort('Practice run with invented students.');
  workbook.adapter.checkAgain();
  if (before !== JSON.stringify(sources.map(name => workbook.sheets.get(name).data))) {
    throw new Error('A source tab changed during the practice run.');
  }
  return {...workbook, result};
}

function csv(rows) {
  return rows.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n') + '\r\n';
}

function exportPractice(workbook, destination) {
  const outputs = [...workbook.sheets].filter(([name]) => name.startsWith('PP '));
  const names = outputs.map(([name]) => name + '.csv');
  if (fs.existsSync(destination)) {
    if (fs.lstatSync(destination).isSymbolicLink()) throw new Error('Demo output must not be a symlink.');
    for (const entry of fs.readdirSync(destination, {withFileTypes:true})) {
      if (!entry.isFile() || !names.includes(entry.name)) throw new Error('Unexpected demo output entry: ' + entry.name);
    }
  }
  fs.mkdirSync(destination, {recursive:true});
  for (const [name, sheet] of outputs) fs.writeFileSync(path.join(destination, name + '.csv'), csv(sheet.data));
  return names;
}

if (require.main === module) {
  const workbook = runPractice();
  const files = exportPractice(workbook, path.join(__dirname, '../demo-output'));
  console.log('Invented students only. This runs the committed Apps Script bundle in a local spreadsheet simulator.');
  console.log('\nPP Summary');
  workbook.sheets.get('PP Summary').data.forEach(row => console.log(row.join(': ')));
  const checks = workbook.sheets.get('PP Check').data;
  console.log('\nPP Check (' + (checks.length - 1) + ' findings; full table in demo-output/PP Check.csv)');
  checks.slice(0, 21).forEach(row => console.log(row.join(' | ')));
  console.log('\nWrote ' + files.length + ' PP tables to demo-output/. Source tabs stayed unchanged.');
}
module.exports = {runPractice, exportPractice};
