'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Range {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
  getValues() { return Array.from({ length: this.rows }, (_, i) => Array.from({ length: this.cols }, (_, j) => this.sheet.data[this.row + i - 1]?.[this.col + j - 1] ?? '')); }
  getBackgrounds() { return this.getValues().map(row => row.map(() => '#ffffff')); }
  setValues(values) { values.forEach((row, i) => row.forEach((v, j) => { const r = this.row + i - 1; this.sheet.data[r] ??= []; this.sheet.data[r][this.col + j - 1] = v; })); return this; }
  setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; } setWrap() { return this; }
}
class Sheet {
  constructor(name, data = []) { Object.assign(this, { name, data, rows: 1000, cols: 26 }); }
  getLastRow() { return this.data.length; }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.data.length), Math.max(1, ...this.data.map(row => row.length))); }
  getRange(row, col, rows, cols) { return new Range(this, row, col, rows, cols); }
  getMaxRows() { return this.rows; } getMaxColumns() { return this.cols; }
  insertRowsAfter(_, n) { this.rows += n; } insertColumnsAfter(_, n) { this.cols += n; }
  clearContents() { this.data = []; } setFrozenRows() {} autoResizeColumns() {} setColumnWidth() {} getColumnWidth() { return 120; }
  appendRow(row) { this.data.push(row); }
}
function loadBundle() {
  const sheets = new Map();
  const spreadsheet = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet: name => {
      if (sheets.has(name)) throw new Error('Duplicate sheet: ' + name);
      const sheet = new Sheet(name); sheets.set(name, sheet); return sheet;
    },
    getSheets: () => [...sheets.values()]
  };
  const context = vm.createContext({
    module: {exports:{}}, Date, console,
    SpreadsheetApp: {getActiveSpreadsheet: () => spreadsheet},
    LockService: {getDocumentLock: () => ({tryLock: () => true, releaseLock() {}})}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../paste-into-apps-script/ProjectPomfret.gs'), 'utf8'), context);
  return {sheets, context, adapter:context.module.exports};
}
module.exports = {Range, Sheet, loadBundle};
