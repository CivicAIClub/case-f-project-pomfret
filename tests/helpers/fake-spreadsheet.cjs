'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Range {
  constructor(sheet, row, col, rows = 1, cols = 1) { Object.assign(this, { sheet, row, col, rows, cols }); }
  cells(fn) { for (let i = 0; i < this.rows; i++) for (let j = 0; j < this.cols; j++) fn(this.row + i, this.col + j); }
  getValues() { return Array.from({ length: this.rows }, (_, i) => Array.from({ length: this.cols }, (_, j) => this.sheet.data[this.row + i - 1]?.[this.col + j - 1] ?? '')); }
  getBackgrounds() { return this.getValues().map((row, i) => row.map((_, j) => this.sheet.colors.get((this.row + i) + ',' + (this.col + j)) || '#ffffff')); }
  setValues(values) { values.forEach((row, i) => row.forEach((v, j) => { const r = this.row + i - 1; this.sheet.data[r] ??= []; this.sheet.data[r][this.col + j - 1] = v; })); return this; }
  setValue(value) { return this.setValues([[value]]); }
  // Data validation lives beside the values, so clearContents keeps it, as in Sheets.
  setDataValidation(rule) { this.cells((r, c) => this.sheet.validations.set(r + ',' + c, rule)); return this; }
  clearDataValidations() { this.cells((r, c) => this.sheet.validations.delete(r + ',' + c)); return this; }
  getDataValidations() { return Array.from({ length: this.rows }, (_, i) => Array.from({ length: this.cols }, (_, j) => this.sheet.validations.get((this.row + i) + ',' + (this.col + j)) || null)); }
  // Bold is kept per cell, and like Sheets, clearContents leaves it; clearFormats removes it.
  setFontWeight(weight) { this.cells((r, c) => { if (weight === 'bold') this.sheet.bold.add(r + ',' + c); else this.sheet.bold.delete(r + ',' + c); }); return this; }
  setBackground(color) { this.cells((r, c) => this.sheet.colors.set(r + ',' + c, color)); return this; }
  setFontColor(color) { return this.format('fontColor', color); }
  setFontSize(size) { return this.format('fontSize', size); }
  setWrap(wrap) { return this.format('wrap', wrap); }
  setVerticalAlignment(align) { return this.format('valign', align); }
  setHorizontalAlignment(align) { return this.format('halign', align); }
  // Only the color is kept, on every cell the border call covered.
  setBorder(...args) { return this.format('border', args[6] || 'black'); }
  format(kind, value) { this.cells((r, c) => this.sheet.formats.set(kind + ':' + r + ',' + c, value)); return this; }
}
// Sheet.getRangeList: the same calls on several A1 ranges, such as "A3:D3".
class RangeList {
  constructor(ranges) { this.ranges = ranges; }
}
for (const method of ['setFontWeight', 'setBackground', 'setFontColor', 'setFontSize', 'setWrap', 'setVerticalAlignment', 'setHorizontalAlignment', 'setBorder']) {
  RangeList.prototype[method] = function (...args) { this.ranges.forEach(r => r[method](...args)); return this; };
}
function column(letters) { return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); }
class Sheet {
  constructor(name, data = []) { Object.assign(this, { name, data, rows: 1000, cols: 26, validations: new Map(), bold: new Set(), colors: new Map(), formats: new Map(), widths: new Map(), frozen: { rows: 0, columns: 0 }, autoResized: 0, tabColor: null }); }
  getName() { return this.name; }
  isBold(row, col = 1) { return this.bold.has(row + ',' + col); }
  formatOf(kind, row, col = 1) { return this.formats.get(kind + ':' + row + ',' + col); }
  setColumnWidth(col, width) { this.widths.set(col, width); this.widthCalls = (this.widthCalls || 0) + 1; }
  setColumnWidths(start, count, width) { for (let c = start; c < start + count; c++) this.widths.set(c, width); this.widthCalls = (this.widthCalls || 0) + 1; }
  getColumnWidth(col) { return this.widths.get(col) ?? 120; }
  autoResizeColumns() { this.autoResized++; }
  setFrozenRows(n) { this.frozen.rows = n; } setFrozenColumns(n) { this.frozen.columns = n; }
  getFrozenRows() { return this.frozen.rows; } getFrozenColumns() { return this.frozen.columns; }
  setTabColor(color) { this.tabColor = color; return this; } getTabColor() { return this.tabColor; }
  getRangeList(a1s) {
    return new RangeList(a1s.map(a1 => {
      const [, c1, r1, c2, r2] = a1.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
      return new Range(this, Number(r1), column(c1), Number(r2 || r1) - Number(r1) + 1, column(c2 || c1) - column(c1) + 1);
    }));
  }
  getLastRow() { return this.data.length; }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.data.length), Math.max(1, ...this.data.map(row => row.length))); }
  getRange(row, col, rows, cols) { return new Range(this, row, col, rows, cols); }
  getMaxRows() { return this.rows; } getMaxColumns() { return this.cols; }
  insertRowsAfter(_, n) { this.rows += n; } insertColumnsAfter(_, n) { this.cols += n; }
  // Like Sheets, clearFormats leaves widths, frozen rows and the tab color. It also drops data
  // validation here, the worst case, so tests show the grade tabs' dropdowns are set after it.
  clearContents() { this.data = []; } clearFormats() { this.bold.clear(); this.colors.clear(); this.formats.clear(); this.validations.clear(); }
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
// A spreadsheet over a Map of sheets, in tab order. Like Sheets, inserting a tab makes it the active
// one, and moveActiveSheet moves the active tab to a position counted from 1. moves counts the moves.
function spreadsheetFor(sheets) {
  let active = null;
  const book = {
    moves: 0,
    getSheetByName: name => sheets.get(name) || null,
    insertSheet: name => {
      if (sheets.has(name)) throw new Error('Duplicate sheet: ' + name);
      const sheet = new Sheet(name); sheets.set(name, sheet); active = sheet; return sheet;
    },
    getSheets: () => [...sheets.values()],
    deleteSheet: sheet => { sheets.delete(sheet.name); if (active === sheet) active = null; },
    getActiveSheet: () => (active && sheets.get(active.name) === active ? active : [...sheets.values()][0] || null),
    setActiveSheet: sheet => { active = sheet; return sheet; },
    moveActiveSheet: position => {
      const moving = book.getActiveSheet(), list = [...sheets.values()].filter(s => s !== moving);
      list.splice(position - 1, 0, moving); sheets.clear(); list.forEach(s => sheets.set(s.name, s)); book.moves++;
    }
  };
  return book;
}
function loadBundle() {
  const sheets = new Map(), spreadsheet = spreadsheetFor(sheets);
  const context = vm.createContext({
    module: {exports:{}}, Date, console,
    SpreadsheetApp: {getActiveSpreadsheet: () => spreadsheet, newDataValidation},
    LockService: {getDocumentLock: () => ({tryLock: () => true, releaseLock() {}})}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../paste-into-apps-script/ProjectPomfret.gs'), 'utf8'), context);
  return {sheets, spreadsheet, context, adapter:context.module.exports};
}
module.exports = {Range, Sheet, newDataValidation, loadBundle, spreadsheetFor};
