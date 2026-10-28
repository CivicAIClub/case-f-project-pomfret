'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Range {
  constructor(sheet, row, col, rows = 1, cols = 1) { Object.assign(this, { sheet, row, col, rows, cols }); }
  cells(fn) { for (let i = 0; i < this.rows; i++) for (let j = 0; j < this.cols; j++) fn(this.row + i, this.col + j); }
  getValues() { return Array.from({ length: this.rows }, (_, i) => Array.from({ length: this.cols }, (_, j) => this.sheet.data[this.row + i - 1]?.[this.col + j - 1] ?? '')); }
  getBackgrounds() { return this.getValues().map(row => row.map(() => '#ffffff')); }
  setValues(values) { values.forEach((row, i) => row.forEach((v, j) => { const r = this.row + i - 1; this.sheet.data[r] ??= []; this.sheet.data[r][this.col + j - 1] = v; })); return this; }
  setValue(value) { return this.setValues([[value]]); }
  // Data validation lives beside the values, so clearContents keeps it, as in Sheets.
  setDataValidation(rule) { this.cells((r, c) => this.sheet.validations.set(r + ',' + c, rule)); return this; }
  clearDataValidations() { this.cells((r, c) => this.sheet.validations.delete(r + ',' + c)); return this; }
  getDataValidations() { return Array.from({ length: this.rows }, (_, i) => Array.from({ length: this.cols }, (_, j) => this.sheet.validations.get((this.row + i) + ',' + (this.col + j)) || null)); }
  // Bold is kept per cell, and like Sheets, clearContents leaves it; clearFormats removes it.
  setFontWeight(weight) { this.cells((r, c) => { if (weight === 'bold') this.sheet.bold.add(r + ',' + c); else this.sheet.bold.delete(r + ',' + c); }); return this; }
  setBackground() { return this; } setFontColor() { return this; } setWrap() { return this; }
}
class Sheet {
  constructor(name, data = []) { Object.assign(this, { name, data, rows: 1000, cols: 26, validations: new Map(), bold: new Set() }); }
  isBold(row, col = 1) { return this.bold.has(row + ',' + col); }
  getLastRow() { return this.data.length; }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.data.length), Math.max(1, ...this.data.map(row => row.length))); }
  getRange(row, col, rows, cols) { return new Range(this, row, col, rows, cols); }
  getMaxRows() { return this.rows; } getMaxColumns() { return this.cols; }
  insertRowsAfter(_, n) { this.rows += n; } insertColumnsAfter(_, n) { this.cols += n; }
  clearContents() { this.data = []; } clearFormats() { this.bold.clear(); } setFrozenRows() {} autoResizeColumns() {} setColumnWidth() {} getColumnWidth() { return 120; }
  appendRow(row) { this.data.push(row); }
}
// The parts of SpreadsheetApp.newDataValidation() the adapter uses.
function newDataValidation() {
  const rule = { values: [], showDropdown: false, allowInvalid: true, helpText: '' };
  const builder = {
    requireValueInList(values, showDropdown = true) { rule.values = [...values]; rule.showDropdown = showDropdown; return builder; },
    setAllowInvalid(allow) { rule.allowInvalid = allow; return builder; },
    setHelpText(text) { rule.helpText = text; return builder; },
    build() { return { ...rule, values: [...rule.values] }; }
  };
  return builder;
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
    SpreadsheetApp: {getActiveSpreadsheet: () => spreadsheet, newDataValidation},
    LockService: {getDocumentLock: () => ({tryLock: () => true, releaseLock() {}})}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../paste-into-apps-script/ProjectPomfret.gs'), 'utf8'), context);
  return {sheets, context, adapter:context.module.exports};
}
module.exports = {Range, Sheet, newDataValidation, loadBundle};
