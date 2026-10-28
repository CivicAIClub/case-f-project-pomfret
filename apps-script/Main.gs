/** @OnlyCurrentDoc
 * Google Sheets boundary for the dependency-free Project: Pomfret program.
 * Source tabs are read only. No network or AI services are used.
 */
var PPAdapter = (function () {
  'use strict';
  var INPUTS = [{ name: 'Senior', grade: 12 }, { name: 'Junior', grade: 11 }, { name: 'Sophomore', grade: 10 }];
  // Grade and group tabs get shared, and comments can name other students, so comments stay in PP Students.
  var MASTER_HEADERS = ['Student ID', 'Name', 'Project #1', 'Project #2', 'Status', 'Fit #1', 'Fit #2', 'Reason', 'Review flags'];
  var SETTING_NOTES = {
    minSize: 'Minimum students in each group or each Minor week.',
    targetSize: 'Preferred group size.', maxSize: 'Absolute group size limit.',
    projectCount: 'Target number of distinct running projects.', minorProjects: 'Target distinct Minor projects, each running twice.',
    minorMin: 'Minimum students taking two Minors.', minorTarget: 'Not used by Sort or the project suggestion. Sort puts Not-sure students who lean Minor in Minors, and others only to reach the minimum.',
    minorMax: 'Maximum students taking two Minors.', allowMajorToMinor: 'Let Major-preference students take Minors only while Minors are below minorMin; each move is flagged.',
    checkedBeforeInferred: 'Prefer a checked project with no other match over an unchecked project matching Type and goal.',
    tieSeed: 'Shuffles the order of students who tie, so names never decide who wins. Any whole number; the same number always gives the same groups.',
    useFriendRequests: 'TRUE uses the reviewed Friend requests tab: "Not with" pairs are kept apart and "With" requests are met where the rules allow. FALSE leaves the groups unchanged.',
    balanceGender: 'TRUE swaps or moves students between groups so each group has no Male students or at least three, and the same for Female. A change never drops the fit of a student by more than one step. PP Check reports breaks either way.',
    followChecksOverTrack: "TRUE: a student whose Major or Minor answer doesn't match the projects they checked is placed by what they checked."
  };
  // Settings added after the first school trial. A sheet without these rows uses the default.
  var NEW_SETTINGS = ['tieSeed', 'useFriendRequests', 'balanceGender', 'followChecksOverTrack'];
  var FRIEND_HEADERS = ['Name', 'Grade', 'Request', 'Classmate', 'Classmate grade', 'Named each other', 'Match', 'Note', 'Use', 'Comment', 'Email', 'Classmate email'];
  var RUN_LOG_HEADERS = ['Time', 'Why', 'Fingerprint', 'Placed', 'Needs review', 'Errors', 'Warnings', 'Tie seed', 'Run by'];
  var LOCK_HEADERS = ['Email', 'Name', 'Project 1', 'Project 2', 'Locked by', 'When', 'Why'];
  // Faculty and Location are only shown on the results tabs. The sort never reads them.
  var CHOICE_HEADERS = ['Project ID', 'Project', 'Run', 'Final length', 'Must run', 'Leaders', "Can't run with", 'Max size', 'Faculty', 'Location'];
  function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
  function text(v) { return v == null ? '' : String(v).trim(); }
  function safeCell(v) {
    if (v == null) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    var s = String(v);
    return /^[\s]*[=+\-@]/.test(s) ? "'" + s : s;
  }
  function sheet(name, required) {
    var s = ss().getSheetByName(name);
    if (!s && required) throw new Error('Missing tab "' + name + '". Copy the corresponding source into this working spreadsheet, preserving colors.');
    return s;
  }
  function values(name, required) {
    var s = sheet(name, required);
    if (!s || s.getLastRow() === 0) return [];
    return s.getDataRange().getValues();
  }
  function nonempty(s) {
    return s && s.getDataRange().getValues().some(function (r) { return r.some(function (v) { return text(v) !== ''; }); });
  }
  function resize(s, rows, cols) {
    if (s.getMaxRows() < rows) s.insertRowsAfter(s.getMaxRows(), rows - s.getMaxRows());
    if (s.getMaxColumns() < cols) s.insertColumnsAfter(s.getMaxColumns(), cols - s.getMaxColumns());
  }
  function write(name, headers, rows) {
    var s = sheet(name) || ss().insertSheet(name);
    var data = [headers].concat(rows).map(function (r) {
      return headers.map(function (_, i) { return safeCell(r[i]); });
    });
    resize(s, data.length, headers.length);
    s.clearContents();
    s.getRange(1, 1, data.length, headers.length).setValues(data);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#9e2132').setFontColor('#ffffff');
    s.setFrozenRows(1);
    if (data.length > 1) s.getRange(2, 1, data.length - 1, headers.length).setWrap(true);
    s.autoResizeColumns(1, headers.length);
    for (var c = 1; c <= headers.length; c++) if (s.getColumnWidth(c) > 420) s.setColumnWidth(c, 420);
    return s;
  }
  // A tab laid out for reading and printing, like last year's master list and rosters. Each line is
  // { cells, style }: 'header' rows look like the other tabs' headers, and 'title' and 'total' rows
  // are bold. Old formatting goes first, because rows move between runs.
  function writeLayout(name, width, lines) {
    var s = sheet(name) || ss().insertSheet(name);
    var data = lines.map(function (l) { var row = []; for (var i = 0; i < width; i++) row.push(safeCell((l.cells || [])[i])); return row; });
    resize(s, Math.max(1, data.length), width);
    s.clearContents(); s.clearFormats(); s.setFrozenRows(0);
    if (data.length) s.getRange(1, 1, data.length, width).setValues(data).setWrap(true);
    lines.forEach(function (l, i) {
      if (l.style === 'header') s.getRange(i + 1, 1, 1, width).setFontWeight('bold').setBackground('#9e2132').setFontColor('#ffffff');
      else if (l.style) s.getRange(i + 1, 1, 1, width).setFontWeight('bold');
    });
    s.autoResizeColumns(1, width);
    for (var c = 1; c <= width; c++) if (s.getColumnWidth(c) > 420) s.setColumnWidth(c, 420);
    return s;
  }
  function seed(name, headers, rows) {
    if (!nonempty(sheet(name))) write(name, headers, rows);
  }
  // Add the header cells a tab is missing after its last header. No other cell changes.
  function addColumns(name, headers) {
    var s = sheet(name), data = values(name), have = data.length ? data[0].map(text) : [];
    var missing = headers.filter(function (h) { return have.indexOf(h) < 0; }), last = 0;
    if (!s || !missing.length) return;
    have.forEach(function (h, i) { if (h) last = i + 1; });
    resize(s, Math.max(1, s.getLastRow()), last + missing.length);
    s.getRange(1, last + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#9e2132').setFontColor('#ffffff');
  }
  function appendRecord(name, record) {
    var header = values(name, true)[0].map(text);
    sheet(name, true).appendRow(header.map(function (h) { return Object.prototype.hasOwnProperty.call(record, h) ? safeCell(record[h]) : ''; }));
  }
  // optional lists columns that may be missing; each one present is read like the others.
  function records(name, headers, required, optional) {
    var data = values(name, required);
    if (!data.length) return [];
    var found = data[0].map(text);
    headers = headers.concat((optional || []).filter(function (h) { return found.indexOf(h) >= 0; }));
    var indices = headers.map(function (h) {
      var matches = found.reduce(function (a, x, i) { if (x === h) a.push(i); return a; }, []);
      if (matches.length !== 1) throw new Error('Tab "' + name + '" needs exactly one "' + h + '" column.');
      return matches[0];
    });
    // _row is the sheet row, so blank rows in between don't shift it.
    return data.map(function (r, i) { return { values: r, row: i + 1 }; }).slice(1).filter(function (x) { return x.values.some(function (v) { return text(v) !== ''; }); }).map(function (x) {
      var o = { _row: x.row }; headers.forEach(function (h, j) { o[h] = x.values[indices[j]]; }); return o;
    });
  }
  function boolean(v, label, blank) {
    if (text(v) === '' && blank !== undefined) return blank;
    if (v === true || /^true$|^yes$/i.test(text(v))) return true;
    if (v === false || /^false$|^no$/i.test(text(v))) return false;
    throw new Error(label + ' must be TRUE or FALSE' + (blank === null ? ', or blank for the suggestion.' : '.'));
  }
  function settings() {
    var result = Object.assign({}, PPEngine.defaults), seen = {};
    records('Settings', ['Setting', 'Value'], true).forEach(function (r) {
      var key = text(r.Setting);
      if (!Object.prototype.hasOwnProperty.call(result, key)) throw new Error('Unknown setting: ' + key);
      if (seen[key]) throw new Error('Duplicate setting: ' + key);
      seen[key] = true;
      if (typeof result[key] === 'boolean') result[key] = boolean(r.Value, key);
      else {
        if (text(r.Value) === '' || !Number.isInteger(Number(r.Value)) || Number(r.Value) < 0) throw new Error(key + ' must be a whole number of zero or more.');
        result[key] = Number(r.Value);
      }
    });
    Object.keys(result).forEach(function (key) { if (!seen[key] && NEW_SETTINGS.indexOf(key) < 0) throw new Error('Settings is missing ' + key + '. Restore the row before running.'); });
    if (!(result.minSize > 0 && result.minSize <= result.targetSize && result.targetSize <= result.maxSize && result.maxSize <= 14)) throw new Error('Group sizes must satisfy 1 <= minimum <= target <= maximum <= 14.');
    if (!(result.minorMin <= result.minorTarget && result.minorTarget <= result.minorMax)) throw new Error('Minor cohort sizes must satisfy minimum <= target <= maximum.');
    if (result.projectCount < 1 || result.minorProjects > result.projectCount || (result.minorProjects === 1)) throw new Error('Project counts are invalid. Two distinct Minor projects are required for a Minor student.');
    return result;
  }
  function readProjects() {
    var s = sheet('Projects', true);
    var parsed = PPParser.parseProjects({ name: 'Projects', values: s.getDataRange().getValues(), backgrounds: s.getDataRange().getBackgrounds() });
    if (!parsed.projects || !parsed.projects.length) throw new Error('Projects has no recognized projects. Check its headers and source copy.');
    return parsed;
  }
  function setup() {
    seed('Settings', ['Setting', 'Value', 'Notes'], Object.keys(PPEngine.defaults).map(function (k) { return [k, PPEngine.defaults[k], SETTING_NOTES[k] || '']; }));
    var have = records('Settings', ['Setting'], true).map(function (r) { return text(r.Setting); });
    Object.keys(PPEngine.defaults).forEach(function (k) { if (have.indexOf(k) < 0) appendRecord('Settings', { Setting: k, Value: PPEngine.defaults[k], Notes: SETTING_NOTES[k] || '' }); });
    var projects = nonempty(sheet('Projects')) ? readProjects().projects : PPCatalog;
    seed('Project choices', CHOICE_HEADERS, projects.map(function (p) { return [p.id, p.name, '', '', false, '', '', '', '', '']; }));
    addColumns('Project choices', CHOICE_HEADERS);
    seed('Gender', ['Email', 'Gender'], []);
    seed('Status changes', ['Email', 'Name', 'Status', 'Why'], []);
    seed('Locked placements', LOCK_HEADERS, []);
    seed('Friend requests', FRIEND_HEADERS, []);
    seed('PP Run log', RUN_LOG_HEADERS, []);
    addColumns('PP Run log', RUN_LOG_HEADERS);
    return { message: 'Settings and decision tabs are ready. Existing values were preserved.' };
  }
  function options() {
    return {
      genders: records('Gender', ['Email', 'Gender'], false).map(function (r) { return { email: text(r.Email), gender: text(r.Gender) }; }),
      statusChanges: records('Status changes', ['Email', 'Name', 'Status', 'Why'], false).map(function (r) {
        var status = text(r.Status).toLowerCase();
        if (['eligible', 'late', 'trip', 'leader', 'review'].indexOf(status) === -1) throw new Error('Status changes row ' + r._row + ': use eligible, late, trip, leader or review.');
        if (!text(r.Why)) throw new Error('Status changes row ' + r._row + ' needs a reason.');
        if (!text(r.Email) && !text(r.Name)) throw new Error('Status changes row ' + r._row + ' needs Email or Name.');
        return { email: text(r.Email), name: text(r.Name), status: status, why: text(r.Why) };
      })
    };
  }
  function readInputs() {
    var catalog = readProjects();
    var tables = INPUTS.map(function (x) {
      var s = sheet(x.name, true);
      if (s.getLastRow() < 2) throw new Error(x.name + ' has no student rows.');
      return { name: x.name, grade: x.grade, values: s.getDataRange().getValues(), backgrounds: s.getDataRange().getBackgrounds() };
    });
    var prepared = PPParser.prepare(tables, catalog.projects, options());
    if (!prepared.students || !prepared.students.length) throw new Error('No students could be prepared. Check the form headers.');
    return { students: prepared.students, projects: catalog.projects, issues: (catalog.issues || []).concat(prepared.issues || []), stats: prepared.stats };
  }
  function writeStudents(input) {
    write('PP Students', ['Student ID', 'Name', 'Email', 'Grade', 'Status', 'Preference', 'Checked projects', 'Types', 'UN goals', 'Previous projects', 'Gender', 'Source', 'Issues', 'Student comment'], input.students.map(function (s) {
      return [s.id, s.name, s.email, s.grade, s.status, s.preference, s.choices.join('; '), s.types.join('; '), s.goals.join('; '), s.previous.join('; '), s.gender || '', s.source ? s.source.sheet + ':' + s.source.row : '', (s.issues || []).join('; '), s.comments || ''];
    }));
  }
  function prepare() { setup(); var input = readInputs(); writeStudents(input); writeIssues('PP Input check', input.issues); return input; }
  function split(v) { return text(v).split(/[;,\n]/).map(text).filter(Boolean); }
  function choices(projects, students) {
    var result = {}, byId = {}, byName = {}, people = {};
    projects.forEach(function (p) { byId[p.id] = p; byName[p.name.toLowerCase()] = p; });
    students.forEach(function (s) {
      people[s.id.toLowerCase()] = (people[s.id.toLowerCase()] || []).concat(s.id);
      if (s.email) people[s.email.toLowerCase()] = (people[s.email.toLowerCase()] || []).concat(s.id);
    });
    records('Project choices', CHOICE_HEADERS.slice(0, 7), true, ['Max size']).forEach(function (r) {
      var id = text(r['Project ID']), p = byId[id];
      if (!p) throw new Error('Unknown Project ID in Project choices: ' + id);
      if (result[id]) throw new Error('Duplicate Project ID in Project choices: ' + id);
      var length = text(r['Final length']);
      if (length && ['Major', 'Minor'].indexOf(length) === -1) throw new Error(p.name + ': Final length must be Major, Minor or blank.');
      if (length && p.length !== 'Either' && length !== p.length) throw new Error(p.name + ' is listed as ' + p.length + '. Update the approved source metadata before changing its length.');
      var size = text(r['Max size']);
      if (size && (!Number.isInteger(Number(size)) || Number(size) < 1 || Number(size) > 14)) throw new Error(p.name + ': Max size must be a whole number from 1 to 14, or blank.');
      var choice = { run: boolean(r.Run, p.name + ' Run', null), length: length || null, mustRun: boolean(r['Must run'], p.name + ' Must run', false), leaders: [], cannotRunWith: [], maxSize: size ? Number(size) : null };
      if (choice.mustRun && choice.run === false) throw new Error(p.name + ': Must run conflicts with Run FALSE.');
      choice.leaders = split(r.Leaders).map(function (token) {
        var found = people[token.toLowerCase()] || [], unique = found.filter(function (x, i) { return found.indexOf(x) === i; });
        if (unique.length !== 1) throw new Error(p.name + ': leader "' + token + '" must resolve to exactly one Student ID or email.');
        return unique[0];
      });
      choice.cannotRunWith = split(r["Can't run with"]).map(function (token) {
        var other = byId[token] || byName[token.toLowerCase()];
        if (!other || other.id === id) throw new Error(p.name + ': invalid incompatible project "' + token + '". Use an exact Project ID or name.');
        return other.id;
      });
      result[id] = choice;
    });
    return result;
  }
  // Faculty (several names, separated by commas) and Location for each project, read fresh each time
  // so Check again shows the current names. Blank stays blank.
  function details() {
    var result = {};
    records('Project choices', ['Project ID'], false, ['Faculty', 'Location']).forEach(function (r) {
      result[text(r['Project ID'])] = { faculty: text(r.Faculty).split(',').map(text).filter(Boolean).join(', '), location: text(r.Location) };
    });
    return result;
  }
  function interest() {
    var input = prepare(), config = settings(), decisions = choices(input.projects, input.students);
    var counts = PPEngine.interest(input.students, input.projects), proposal = PPEngine.propose(input.students, input.projects, config, decisions), selected = {};
    proposal.projects.forEach(function (p) { selected[p.id] = p; });
    write('PP Interest', ['Project ID', 'Project', 'Listed length', 'Checked', 'Checked + Type or goal', 'Seniors', 'Juniors', 'Sophomores', 'Suggested run', 'Suggested length'], counts.map(function (r) {
      var p = input.projects.filter(function (p) { return p.id === r.projectId; })[0];
      return [r.projectId, r.name, p.length, r.checked, r.aligned, r.byGrade[12], r.byGrade[11], r.byGrade[10], !!selected[r.projectId], selected[r.projectId] ? selected[r.projectId].finalLength : ''];
    }));
    writeIssues('PP Project check', proposal.issues || []);
    return { counts: counts, proposal: proposal };
  }
  function issueRow(i) {
    if (typeof i === 'string') return ['warning', 'input', i, '', '', '', ''];
    return [i.severity || 'warning', i.code || 'input', i.message || JSON.stringify(i), i.studentId || '', i.projectId || '', i.week || '', i.source ? i.source.sheet + ':' + i.source.row : ''];
  }
  function writeIssues(name, issues) { write(name, ['Severity', 'Code', 'Message', 'Student ID', 'Project ID', 'Week', 'Source'], issues.map(issueRow)); }
  function projectToken(id, projects) {
    if (!id) return '';
    var p = projects.filter(function (x) { return x.id === id; })[0];
    return p ? (p.finalLength === 'Minor' ? 'MIN-' : 'MAJ-') + p.name : id;
  }
  function lengthOf(id, projects) {
    var p = projects.filter(function (x) { return x.id === id; })[0];
    return p ? p.finalLength : null;
  }
  function masterName(grade) { return grade === 12 ? 'PP Senior' : grade === 11 ? 'PP Junior' : 'PP Sophomore'; }
  // Mr. Litowitz moves a student by picking another running project. Sheets always lets a cell be cleared.
  function projectDropdown(projects) {
    var labels = projects.map(function (p) { return projectToken(p.id, projects); }).sort();
    if (!labels.length) return null;
    return SpreadsheetApp.newDataValidation().requireValueInList(labels, true).setAllowInvalid(false).setHelpText('Pick a running MAJ- or MIN- project, or clear the cell.').build();
  }
  // Like the master list, a Major shows its MAJ- label in both columns.
  function secondProject(a, projects) { return a.project2 || (lengthOf(a.project1, projects) === 'Major' ? a.project1 : null); }
  function writeGradeTabs(students, result) {
    var assignmentsById = {}, dropdown = projectDropdown(result.projects);
    result.assignments.forEach(function (a) { assignmentsById[a.studentId] = a; });
    [12, 11, 10].forEach(function (grade) {
      var name = masterName(grade), old = sheet(name);
      // The last run's dropdowns may list projects that no longer run.
      if (old) old.getRange(1, 1, old.getMaxRows(), old.getMaxColumns()).clearDataValidations();
      var rows = students.filter(function (s) { return s.grade === grade; }).map(function (s) {
        var a = assignmentsById[s.id] || { status: 'review', reason: 'No assignment returned.', flags: ['Missing assignment'] };
        return [s.id, s.name, projectToken(a.project1, result.projects), projectToken(secondProject(a, result.projects), result.projects), a.status, a.fit1, a.fit2, a.reason, (a.flags || []).join('; ')];
      });
      var tab = write(name, MASTER_HEADERS, rows);
      if (dropdown && rows.length) tab.getRange(2, MASTER_HEADERS.indexOf('Project #1') + 1, rows.length, 2).setDataValidation(dropdown);
    });
  }
  function writeGroupTabs(students, result) {
    var studentsById = {}, oldRegistry = values('PP Project tabs', false).slice(1).map(function (r) { return String(r[2] || ''); }), newRegistry = [];
    students.forEach(function (s) { studentsById[s.id] = s; });
    result.projects.forEach(function (p, index) {
      var name = 'PP Group ' + String(index + 1).padStart(2, '0') + ' ' + p.name.replace(/[\[\]*?\/\\:]/g, ' ').slice(0, 65), rows = [];
      result.assignments.forEach(function (a) {
        var s = studentsById[a.studentId]; if (!s || a.status !== 'placed') return;
        if (a.project1 === p.id) rows.push([p.finalLength === 'Minor' ? 'Week 1' : 'Both weeks', s.name, s.grade, s.id, a.fit1, a.reason]);
        if (a.project2 === p.id) rows.push(['Week 2', s.name, s.grade, s.id, a.fit2, a.reason]);
      });
      rows.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])) || b[2] - a[2] || String(a[3]).localeCompare(String(b[3])); });
      write(name, ['Session', 'Name', 'Grade', 'Student ID', 'Fit', 'Reason'], rows);
      newRegistry.push([p.id, p.name, name, p.finalLength]);
    });
    oldRegistry.forEach(function (name) {
      if (/^PP Group \d{2} /.test(name) && !newRegistry.some(function (r) { return r[2] === name; }) && sheet(name)) {
        write(name, ['Status'], [['Retired by the latest run. Use PP Project tabs for current groups.']]);
      }
    });
    write('PP Project tabs', ['Project ID', 'Project', 'Sheet', 'Length'], newRegistry);
  }
  var GRADE_WORDS = { 12: 'Seniors', 11: 'Juniors', 10: 'Sophomores' };
  // A name is "Last, First" or "First Last". Jr., Sr. and II to IV aren't last names.
  function lastName(name) {
    var raw = text(name), comma = raw.indexOf(',');
    if (comma >= 0) return raw.slice(0, comma).trim();
    var words = raw.split(/\s+/).filter(Boolean);
    while (words.length > 1 && /^(jr|sr|ii|iii|iv)\.?$/i.test(words[words.length - 1])) words.pop();
    return words.length ? words[words.length - 1] : '';
  }
  function byLastName(a, b) {
    return lastName(a.name).toLowerCase().localeCompare(lastName(b.name).toLowerCase()) || text(a.name).toLowerCase().localeCompare(text(b.name).toLowerCase()) || String(a.id).localeCompare(String(b.id));
  }
  // Like last year's master list: every placed student's projects with their faculty, grade by grade.
  // Students who aren't placed are in PP Not placed.
  function writeMasterList(students, result, info) {
    var byId = {}, lines = [];
    function faculty(id) { return id && info[id] ? info[id].faculty : ''; }
    result.assignments.forEach(function (a) { byId[a.studentId] = a; });
    [12, 11, 10].forEach(function (grade, i) {
      if (i) lines.push({ cells: [] });
      lines.push({ cells: [GRADE_WORDS[grade].toUpperCase()], style: 'title' });
      lines.push({ cells: ['Name', 'Project #1', 'Project Faculty', 'Project #2', 'Project Faculty', 'Why'], style: 'header' });
      students.filter(function (s) { return s.grade === grade && byId[s.id] && byId[s.id].status === 'placed'; }).sort(byLastName).forEach(function (s) {
        var a = byId[s.id], two = secondProject(a, result.projects);
        lines.push({ cells: [s.name || s.id, projectToken(a.project1, result.projects), faculty(a.project1), projectToken(two, result.projects), faculty(two), a.reason] });
      });
    });
    writeLayout('PP Master list', 6, lines);
  }
  var SUMMARY_LABELS = [['total', 'Students'], ['eligible', 'Students who can be placed'], ['placed', 'Placed'], ['excluded', 'Excluded (trip or freshman leader)'], ['needsReview', 'Need review'], ['majorStudents', 'Major students'], ['minorStudents', 'Minor students'], ['projectCount', 'Projects running'], ['minorProjectCount', 'Minor projects running']];
  function summaryRows(summary) {
    var rows = SUMMARY_LABELS.filter(function (l) { return summary[l[0]] !== undefined; }).map(function (l) { return [l[1], summary[l[0]]]; });
    Object.keys(summary.fitCounts || {}).forEach(function (tier) { rows.push(['Placements at fit ' + tier, summary.fitCounts[tier]]); });
    [12, 11, 10].forEach(function (grade) {
      var g = (summary.byGrade || {})[grade], who = GRADE_WORDS[grade];
      if (!g) return;
      rows.push([who + ' placed', g.placed]);
      if (g.major) rows.push([who + ' in a Major they checked', g.major.checked], [who + " in a Major they didn't check", g.major.notChecked]);
      if (g.minor) rows.push([who + ' in Minors, both weeks checked', g.minor.bothChecked], [who + ' in Minors, one week checked', g.minor.oneChecked], [who + ' in Minors, neither week checked', g.minor.noneChecked]);
      Object.keys(g.fits || {}).forEach(function (tier) { rows.push([who + ' placements at fit ' + tier, g.fits[tier]]); });
      rows.push([who + ' average fit', g.meanFit == null ? 'Not available' : Math.round(g.meanFit * 100) / 100]);
    });
    (summary.groups || []).forEach(function (g) { rows.push(['Group size: ' + g.name, g.length === 'Minor' ? 'Week 1: ' + g.sizes[0] + ', week 2: ' + g.sizes[1] : g.sizes[0]]); });
    var f = summary.friends;
    if (f) rows.push(['Friend requests', f.used ? 'Used' : 'Turned off in Settings'], ['"With" requests met', f.withMet], ['"With" requests not met', f.withUnmet], ['Students with a "With" request who are with a classmate they named', f.studentsMet + ' of ' + f.studentsWith], ['"Not with" requests broken', f.notWithBroken]);
    var t = summary.tracks;
    if (t) rows.push(['Students whose Major or Minor answer and checks disagree', t.disagree + ' (followChecksOverTrack is ' + (t.followChecks ? 'on' : 'off') + ')']);
    return rows;
  }
  // A group over this size is flagged in PP Projects unless its project has a Max size, which
  // Mr. Litowitz sets on purpose. It is the top of the preferred group size.
  var PREFERRED_MOST = 12;
  // One row per running project, Majors then Minors, each by name. A Minor's counts read
  // "week 1 / week 2". Picked it counts the students in the group who checked the project.
  function writeProjectsOverview(students, result, info, config, decisions) {
    var byId = {}, minimum = (config || PPEngine.defaults).minSize;
    students.forEach(function (s) { byId[s.id] = s; });
    var projects = result.projects.slice().sort(function (a, b) { return (a.finalLength === 'Major' ? 0 : 1) - (b.finalLength === 'Major' ? 0 : 1) || a.name.localeCompare(b.name); });
    var rows = projects.map(function (p, i) {
      var minor = p.finalLength === 'Minor', sized = decisions && decisions[p.id] && Number.isInteger(decisions[p.id].maxSize), flags = [];
      var weeks = (minor ? [0, 1] : [0]).map(function (w) {
        var group = result.assignments.filter(function (a) { return a.status === 'placed' && byId[a.studentId] && (w ? a.project2 : a.project1) === p.id; }).map(function (a) { return byId[a.studentId]; });
        function count(test) { return group.filter(test).length; }
        return { size: group.length, male: count(function (s) { return s.gender === 'Male'; }), female: count(function (s) { return s.gender === 'Female'; }), 12: count(function (s) { return s.grade === 12; }), 11: count(function (s) { return s.grade === 11; }), 10: count(function (s) { return s.grade === 10; }), picked: count(function (s) { return (s.choices || []).indexOf(p.id) >= 0; }) };
      });
      weeks.forEach(function (c, w) {
        var when = minor ? ' in week ' + (w + 1) : '';
        if (!sized && c.size > PREFERRED_MOST) flags.push('Over ' + PREFERRED_MOST + ' students' + when);
        if (c.size < minimum) flags.push('Under ' + minimum + ' students' + when);
        if ((c.male && c.male < 3) || (c.female && c.female < 3)) flags.push('Fewer than 3 of one gender' + when);
      });
      function both(key) { return minor ? weeks[0][key] + ' / ' + weeks[1][key] : weeks[0][key]; }
      var where = info[p.id] || { faculty: '', location: '' };
      return [i + 1, projectToken(p.id, result.projects), where.location, where.faculty, weeks[0].size, minor ? weeks[1].size : weeks[0].size, both('male'), both('female'), both(12), both(11), both(10), both('picked'), flags.join('; ')];
    });
    write('PP Projects', ['#', 'Project', 'Location', 'Faculty', 'Week 1', 'Week 2', 'Male', 'Female', 'Seniors', 'Juniors', 'Sophomores', 'Picked it', 'Flags'], rows);
  }
  // Placed seniors with at least one project they didn't check, for Mr. Litowitz to look over.
  function writeSeniorsToCheck(students, result) {
    var byId = {}; students.forEach(function (s) { byId[s.id] = s; });
    var rows = result.assignments.filter(function (a) {
      var s = byId[a.studentId];
      return s && s.grade === 12 && a.status === 'placed' && [a.project1, a.project2].filter(Boolean).some(function (id) { return (s.choices || []).indexOf(id) < 0; });
    }).map(function (a) {
      var s = byId[a.studentId];
      return [s.name, s.email, projectToken(a.project1, result.projects), projectToken(secondProject(a, result.projects), result.projects), a.reason];
    }).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])); });
    write('PP Seniors to check', ['Name', 'Email', 'Project #1', 'Project #2', 'Reason'], rows);
  }
  // Everything that follows from the placements. Check again rebuilds these from the grade tabs.
  function writeResults(students, result, status, config, decisions) {
    var studentsById = {}, info = details();
    students.forEach(function (s) { studentsById[s.id] = s; });
    writeMasterList(students, result, info);
    writeProjectsOverview(students, result, info, config, decisions);
    writeGroupTabs(students, result);
    write('PP Summary', ['Metric', 'Value'], summaryRows(result.summary).concat([['Fingerprint', result.fingerprint], ['Review status', status]]));
    write('PP Needs you', ['Student ID', 'Name', 'Grade', 'Status', 'Reason', 'Flags'], result.assignments.filter(function (a) { var s = studentsById[a.studentId]; return s && (a.status === 'review' || (a.flags || []).length || (s.issues || []).length); }).map(function (a) {
      var s = studentsById[a.studentId]; return [s.id, s.name, s.grade, a.status, a.reason, (a.flags || []).concat(s.issues || []).join('; ')];
    }));
    writeSeniorsToCheck(students, result);
  }
  function output(input, result, config, decisions) {
    writeGradeTabs(input.students, result);
    writeResults(input.students, result, 'Proposed groups. Read PP Check and PP Needs you before use.', config, decisions);
    writeFriendCheck(result.friends);
    writeIssues('PP Check', result.checks.concat(input.issues || [], result.issues || []));
  }
  function snapshot(input, result, config, decisions) {
    var inputIssues = input.issues || [], runIssues = result.issues || [];
    var rows = [['meta', 'version', JSON.stringify(2)], ['meta', 'fingerprint', JSON.stringify(result.fingerprint)], ['meta', 'inputFingerprint', JSON.stringify(PPEngine.fingerprint({ students: input.students, projects: input.projects, settings: config, choices: decisions }))], ['meta', 'snapshotFingerprint', JSON.stringify(PPEngine.fingerprint({ students: input.students, sourceProjects: input.projects, projects: result.projects, assignments: result.assignments, settings: config, choices: decisions }))], ['meta', 'findingsFingerprint', JSON.stringify(PPEngine.fingerprint({ inputIssues: inputIssues, runIssues: runIssues }))], ['settings', '', JSON.stringify(config)], ['choices', '', JSON.stringify(decisions)]];
    input.students.forEach(function (s) { rows.push(['student', s.id, JSON.stringify(s)]); });
    input.projects.forEach(function (p) { rows.push(['source-project', p.id, JSON.stringify(p)]); });
    result.projects.forEach(function (p) { rows.push(['project', p.id, JSON.stringify(p)]); });
    result.assignments.forEach(function (a) { rows.push(['assignment', a.studentId, JSON.stringify(a)]); });
    inputIssues.forEach(function (i, index) { rows.push(['input-issue', String(index), JSON.stringify(i)]); });
    runIssues.forEach(function (i, index) { rows.push(['run-issue', String(index), JSON.stringify(i)]); });
    if (rows.some(function (r) { return r[2].length > 49000; })) throw new Error('A snapshot record exceeds the Sheets cell limit. Shorten the source record before running.');
    write('PP Run snapshot', ['Record type', 'Key', 'JSON (do not edit)'], rows);
  }
  function sort(reason) {
    reason = text(reason); if (!reason) throw new Error('A run reason is required. Explain the rule or client decision behind this run.');
    setup();
    var moves = saveMoves(), last = savedRun();
    var input = prepare(), config = settings(), decisions = choices(input.projects, input.students);
    var context = { previous: last ? Object.keys(last.assignments).map(function (id) { return last.assignments[id]; }) : [], locks: readLocks(), friends: readFriends(config) };
    var result = PPEngine.sort(input.students, input.projects, config, decisions, context);
    snapshot(input, result, config, decisions);
    output(input, result, config, decisions);
    var allChecks = result.checks.concat(input.issues || [], result.issues || []);
    appendRecord('PP Run log', { 'Time': new Date(), 'Why': reason, 'Fingerprint': result.fingerprint, 'Placed': result.summary.placed, 'Needs review': result.summary.needsReview, 'Errors': allChecks.filter(function (c) { return c.severity === 'error'; }).length, 'Warnings': allChecks.filter(function (c) { return c.severity === 'warning'; }).length, 'Tie seed': config.tieSeed, 'Run by': activeUser() });
    result.savedMoves = moves;
    return result;
  }
  function activeUser() {
    try { return text(Session.getActiveUser().getEmail()) || 'unknown'; } catch (e) { return 'unknown'; }
  }
  function key(v) { return text(v).toLowerCase().replace(/\s+/g, ''); }
  // The last run's placements, read without the checks readSnapshot makes, so saving moves still
  // works after Settings, Project choices or the forms change. No snapshot means nothing to save.
  function savedRun() {
    var data = values('PP Run snapshot', false), run = { assignments: {}, students: {}, projects: [] };
    if (data.length < 2) return null;
    var header = data[0].map(text), kind = header.indexOf('Record type'), json = header.indexOf('JSON (do not edit)');
    if (kind < 0 || json < 0) return null;
    data.slice(1).forEach(function (r) {
      var value, type = text(r[kind]);
      try { value = JSON.parse(r[json]); } catch (_) { return; }
      if (!value) return;
      if (type === 'assignment') run.assignments[value.studentId] = value;
      else if (type === 'student') run.students[value.id] = value;
      else if (type === 'project') run.projects.push(value);
    });
    return Object.keys(run.assignments).length ? run : null;
  }
  // The reviewed Friend requests tab, read by header name. The Comment column is never read, and a
  // person's Use checkbox decides which rows count.
  function readFriends(config) {
    var data = values('Friend requests', false), at = {};
    if (data.length < 2) return [];
    var header = data[0].map(text);
    ['Name', 'Request', 'Classmate', 'Named each other', 'Use', 'Email', 'Classmate email'].forEach(function (h) { at[h] = header.indexOf(h); });
    if (at.Request < 0 || at.Use < 0 || at.Email < 0 || at['Classmate email'] < 0) {
      if (config && config.useFriendRequests) throw new Error('Friend requests needs Request, Use, Email and Classmate email columns.');
      return [];
    }
    function cell(r, h) { return at[h] >= 0 ? r[at[h]] : ''; }
    function yes(v) { return v === true || /^(true|yes)$/i.test(text(v)); }
    return data.slice(1).map(function (r, i) {
      return { row: i + 2, name: text(cell(r, 'Name')), classmate: text(cell(r, 'Classmate')), request: text(cell(r, 'Request')), use: yes(cell(r, 'Use')), namedEachOther: yes(cell(r, 'Named each other')), email: text(cell(r, 'Email')), classmateEmail: text(cell(r, 'Classmate email')) };
    });
  }
  function writeFriendCheck(rows) {
    write('PP Friend check', ['Name', 'Classmate', 'Request', 'Result', 'Why'], (rows || []).map(function (r) { return [r.name, r.classmate, r.request, r.result, r.why]; }));
  }
  function readLocks() {
    return records('Locked placements', ['Email', 'Name', 'Project 1', 'Project 2'], false, ['Why']).map(function (r) {
      return { email: text(r.Email), name: text(r.Name), project1: text(r['Project 1']), project2: text(r['Project 2']), why: text(r.Why), row: r._row };
    });
  }
  // The Email column holds the student's email, or their Student ID when the email is missing or
  // shared with another student.
  function lockKey(s) { return s.email && s.id === s.email ? s.email : s.id; }
  // Mr. Litowitz moves students by changing Project #1 or #2 in the grade tabs. Every student whose
  // cells differ from the last run gets a row in Locked placements, so the move survives a rerun.
  // A row that already says the same thing is left alone.
  function saveMoves() {
    var saved = savedRun(), count = 0;
    if (!saved) return 0;
    var tab = sheet('Locked placements', true), header = values('Locked placements', true)[0].map(text), rows = records('Locked placements', ['Email', 'Name', 'Project 1', 'Project 2'], true), tokens = {}, by = activeUser(), when = new Date();
    saved.projects.forEach(function (p) { tokens[projectToken(p.id, saved.projects)] = p.id; tokens[p.id.toLowerCase()] = p.id; tokens[p.name.toLowerCase()] = p.id; });
    function read(cell) { cell = text(cell); return cell ? tokens[cell] || tokens[cell.replace(/^(MAJ|MIN)-/i, '').toLowerCase()] || cell : null; }
    function placement(one, two) {
      var p1 = read(one), p2 = read(two);
      if (p2 === p1 && lengthOf(p1, saved.projects) === 'Major') p2 = null;
      else if (!p1 && lengthOf(p2, saved.projects) === 'Major') { p1 = p2; p2 = null; }
      return [p1, p2];
    }
    [12, 11, 10].forEach(function (grade) {
      records(masterName(grade), ['Student ID', 'Project #1', 'Project #2'], false).forEach(function (r) {
        var id = text(r['Student ID']), before = saved.assignments[id], s = saved.students[id];
        if (!before || !s) return;
        var one = text(r['Project #1']), two = text(r['Project #2']), now = placement(one, two);
        if (now[0] === (before.project1 || null) && now[1] === (before.project2 || null)) return;
        var found = rows.filter(function (row) { return key(row.Email) ? key(row.Email) === key(lockKey(s)) : text(row.Name).toLowerCase() === text(s.name).toLowerCase(); })[0];
        if (found && placement(found['Project 1'], found['Project 2']).join() === now.join()) return;
        var cells = { 'Email': lockKey(s), 'Name': s.name, 'Project 1': one, 'Project 2': two, 'Locked by': by, 'When': when, 'Why': 'Moved by hand' };
        if (found) {
          Object.keys(cells).forEach(function (h) { if (header.indexOf(h) >= 0) tab.getRange(found._row, header.indexOf(h) + 1).setValue(safeCell(cells[h])); });
          found['Project 1'] = one; found['Project 2'] = two;
        } else {
          appendRecord('Locked placements', cells);
          rows.push({ _row: tab.getLastRow(), Email: cells.Email, Name: cells.Name, 'Project 1': one, 'Project 2': two });
        }
        count++;
      });
    });
    return count;
  }
  function readSnapshot() {
    var state = { students: [], projects: [], sourceProjects: [], assignments: [], inputIssues: [], runIssues: [] };
    records('PP Run snapshot', ['Record type', 'Key', 'JSON (do not edit)'], true).forEach(function (r) {
      var value;
      try { value = JSON.parse(r['JSON (do not edit)']); } catch (_) { throw new Error('PP Run snapshot is damaged. Rerun Sort to regenerate it.'); }
      var kind = text(r['Record type']);
      if (kind === 'student') state.students.push(value);
      else if (kind === 'project') state.projects.push(value);
      else if (kind === 'source-project') state.sourceProjects.push(value);
      else if (kind === 'assignment') state.assignments.push(value);
      else if (kind === 'input-issue') state.inputIssues.push(value);
      else if (kind === 'run-issue') state.runIssues.push(value);
      else if (kind === 'settings') state.settings = value;
      else if (kind === 'choices') state.choices = value;
      else if (kind === 'meta') state[text(r.Key)] = value;
    });
    if (state.version !== 2 || !state.settings || !state.students.length) throw new Error('No current run snapshot with saved findings. Run Sort to regenerate it.');
    if (PPEngine.fingerprint({ students: state.students, projects: state.sourceProjects, settings: state.settings, choices: state.choices }) !== state.inputFingerprint) throw new Error('PP Run snapshot inputs changed after the run. Rerun Sort to restore a consistent baseline.');
    if (PPEngine.fingerprint({ students: state.students, sourceProjects: state.sourceProjects, projects: state.projects, assignments: state.assignments, settings: state.settings, choices: state.choices }) !== state.snapshotFingerprint) throw new Error('PP Run snapshot placements changed after the run. Rerun Sort to restore a consistent baseline.');
    if (PPEngine.fingerprint({ inputIssues: state.inputIssues, runIssues: state.runIssues }) !== state.findingsFingerprint) throw new Error('PP Run snapshot findings changed after the run. Rerun Sort to restore a consistent baseline.');
    return state;
  }
  function savedMessage(n) { return n ? 'Saved ' + n + (n === 1 ? ' move' : ' moves') + ". They'll stay put when you sort again." : ''; }
  // A row in Locked placements that the grade tab doesn't show yet, such as one typed by hand.
  function lockDifferences(state, current) {
    if (!PPEngine.locks) return [];
    var byId = {}, names = {}, out = [], info = PPEngine.locks(state.students, state.sourceProjects, readLocks());
    current.forEach(function (a) { byId[a.studentId] = a; });
    state.students.forEach(function (s) { names[s.id] = s.name || s.id; });
    Object.keys(info.byStudent).sort().forEach(function (id) {
      var lock = info.byStudent[id], a = byId[id], p1 = lock.project1, p2 = lock.project2;
      if (!a) return;
      if (p2 === p1 && lengthOf(p1, state.projects) === 'Major') p2 = null;
      else if (!p1 && lengthOf(p2, state.projects) === 'Major') { p1 = p2; p2 = null; }
      if (p1 !== a.project1 || p2 !== a.project2) out.push({ severity: 'warning', code: 'lock_differs', studentId: id, message: names[id] + " has a row in Locked placements that the grade tab doesn't show. Sort again to apply it, or delete the row to unlock them." });
    });
    return out.concat(info.issues);
  }
  function checkAgain() {
    setup();
    var moves = saveMoves(), state;
    // Moves are saved before anything can stop Check again.
    try { state = readSnapshot(); } catch (e) { if (moves) e.message = savedMessage(moves) + ' ' + e.message; throw e; }
    var baseline = {}, checks = [], current = [], known = {}, tokenMap = {};
    state.assignments.forEach(function (a) { baseline[a.studentId] = a; });
    state.students.forEach(function (s) { known[s.id] = s; });
    state.projects.forEach(function (p) { tokenMap[projectToken(p.id, state.projects)] = p.id; });
    function track(a) {
      var one = lengthOf(a.project1, state.projects), two = lengthOf(a.project2, state.projects);
      if (one === 'Major' && !a.project2) return 'Major';
      if (one === 'Minor' && two === 'Minor' && a.project1 !== a.project2) return 'Minor';
      return a.project1 || a.project2 ? 'mixed' : null;
    }
    // A student whose projects changed since Sort was moved by hand. Recompute the row the way
    // Sort would, write it back, and let the checks below report any rule the move breaks.
    function moveByHand(tab, header, r, a, student, original) {
      var ids = [a.project1, a.project2].filter(Boolean);
      var placement = ids.length ? PPEngine.explain(student, ids, state.projects, state.settings, state.choices, true, true) : { fit1: null, fit2: null, reason: 'Not placed in a project.', flags: [] };
      a.fit1 = placement.fit1; a.fit2 = placement.fit2; a.reason = 'Moved by hand. ' + placement.reason; a.flags = placement.flags; a.movedByHand = true;
      if (ids.length) a.status = 'placed'; else if (a.status === 'placed') a.status = 'review';
      var cells = { 'Status': a.status, 'Fit #1': a.fit1, 'Fit #2': a.fit2, 'Reason': a.reason, 'Review flags': a.flags.join('; ') };
      Object.keys(cells).forEach(function (h) { sheet(tab, true).getRange(r._row, header.indexOf(h) + 1).setValue(safeCell(cells[h])); });
      var from = track(original), to = track(a), what = !to ? 'Moved by hand out of every project, so this student is not placed.' : !from ? 'Placed by hand.' :
        from !== to && from !== 'mixed' && to !== 'mixed' ? (to === 'Major' ? 'Moved by hand from two Minors to one Major.' : 'Moved by hand from one Major to two Minors.') : 'Moved by hand.';
      checks.push({ severity: 'info', code: 'moved_by_hand', studentId: a.studentId, message: what + ' Fit #1, Fit #2 and Reason were updated.' });
    }
    [12, 11, 10].forEach(function (grade) {
      var tab = masterName(grade), header = values(tab, true)[0].map(text);
      records(tab, MASTER_HEADERS, true).forEach(function (r) {
        var id = text(r['Student ID']), original = baseline[id], student = known[id], one = text(r['Project #1']), two = text(r['Project #2']);
        var a = { studentId: id, project1: one ? tokenMap[one] || one : null, project2: two ? tokenMap[two] || two : null, status: text(r.Status), reason: text(r.Reason), flags: text(r['Review flags']) ? text(r['Review flags']).split('; ') : [], fit1: null, fit2: null };
        // A Major is one MAJ- label: in both columns, or in one column with the other blank.
        if (a.project2 === a.project1 && lengthOf(a.project1, state.projects) === 'Major') a.project2 = null;
        else if (!a.project1 && lengthOf(a.project2, state.projects) === 'Major') { a.project1 = a.project2; a.project2 = null; }
        if (student && student.grade !== grade) checks.push({ severity: 'error', code: 'wrong_grade_tab', studentId: id, message: 'Student appears in the wrong grade master.' });
        var unknown = one && !tokenMap[one] || two && !tokenMap[two];
        if (unknown) checks.push({ severity: 'error', code: 'unknown_project_token', studentId: id, message: 'Project #1 or #2 does not exactly match a running MAJ-/MIN- project label.' });
        if (original && student && !unknown && (a.project1 !== original.project1 || a.project2 !== original.project2)) {
          moveByHand(tab, header, r, a, student, original);
          if (text(r.Name) !== text(student.name)) checks.push({ severity: 'warning', code: 'manual_edit', studentId: id, message: 'This row differs from the saved program run (Name). The current cells are being checked.' });
          current.push(a);
          return;
        }
        // A student Sort placed with a lock is still locked, so the checks treat it as a person's decision.
        if (original && original.locked === true) a.locked = true;
        ['project1', 'project2'].forEach(function (key, i) {
          var label = 'Fit #' + (i + 1), raw = r[label], fit = text(raw) === '' ? null : Number(raw);
          if ((typeof raw === 'boolean') || (fit !== null && (!Number.isInteger(fit) || fit < 1 || fit > 6)) || (a[key] && fit === null) || (!a[key] && fit !== null)) {
            checks.push({ severity: 'error', code: 'invalid_fit_cell', studentId: id, message: label + ' must be a whole number from 1 to 6 for an assigned project, and blank otherwise.' });
            fit = null;
          }
          // Pass the displayed value through. The engine independently recomputes
          // the expected fit, so an edited fit cannot be silently repaired here.
          a['fit' + (i + 1)] = fit;
        });
        var changed = [];
        if (!original) changed.push('Student ID');
        else {
          ['project1', 'project2', 'status', 'fit1', 'fit2', 'reason'].forEach(function (key) { if (a[key] !== original[key]) changed.push(key); });
          if (known[id] && text(r.Name) !== text(known[id].name)) changed.push('Name');
        }
        if (changed.length) checks.push({ severity: 'warning', code: 'manual_edit', studentId: id, message: 'This row differs from the saved program run (' + changed.join(', ') + '). The current cells are being checked.' });
        current.push(a);
      });
    });
    // Recheck current master cells, but retain source and project-selection
    // findings from the saved run. Reading the previous PP Check would both
    // retain obsolete assignment failures and accumulate repeated warnings.
    var friendRows = readFriends(state.settings);
    checks = checks.concat(PPEngine.check(state.students, state.projects, current, state.settings, state.choices, { friends: friendRows }), state.inputIssues, state.runIssues, lockDifferences(state, current));
    try {
      var live = readInputs(), currentSettings = settings(), currentChoices = choices(live.projects, live.students);
      if (PPEngine.fingerprint({ students: live.students, projects: live.projects, settings: currentSettings, choices: currentChoices }) !== state.inputFingerprint) checks.push({ severity: 'warning', code: 'stale_inputs', message: 'Inputs or settings changed after Sort. These checks use the saved run rules. Run Sort again to apply the current inputs.' });
    } catch (e) { checks.push({ severity: 'warning', code: 'current_input_error', message: 'The saved run was checked, but current inputs could not be compared: ' + e.message }); }
    // Rebuild what follows from the placements, from the grade tabs as they are now, without sorting.
    var summary = PPEngine.summarize ? PPEngine.summarize(state.students, state.projects, current, state.settings, state.choices) : {}, report = PPEngine.friends ? PPEngine.friends(state.students, state.projects, current, state.settings, friendRows, state.choices) : null;
    if (report) summary.friends = report.summary;
    writeResults(state.students, { assignments: current, projects: state.projects, summary: summary, fingerprint: state.fingerprint }, 'Rebuilt by Check again from the grade tabs. Read PP Check before use.', state.settings, state.choices);
    if (report) writeFriendCheck(report.rows);
    writeIssues('PP Check', checks);
    checks.savedMoves = moves;
    return checks;
  }
  function practice() {
    if (ss().getSheets().some(nonempty)) throw new Error('Make practice data only works in a completely empty scratch spreadsheet. Create a new spreadsheet first.');
    write('Projects', ['Project', 'Length', 'Type', 'UN Goals'], PPCatalog.map(function (p) { return [p.name, p.length, p.types.join(', '), p.goals.join(', ')]; }));
    INPUTS.forEach(function (tab, g) {
      var headers = ['Timestamp', 'Email Address', 'Name', 'Previous projects', 'UN goals', 'Types', 'Preference', 'Projects selected', 'Comments'];
      var rows = [];
      for (var i = 0; i < 80; i++) {
        var n = g * 80 + i + 1, selected = PPCatalog.filter(function (p) { return p.enabled !== false; }).filter(function (_, j) { return (j + n) % 3 === 0; });
        rows.push([new Date(2026, 9, 20, 12, i), 'practice' + n + '@example.org', 'Practice Student ' + String(n).padStart(3, '0'), 'None', ['3', '4', '9', '10', '11', '12', '13', '15', '16'][n % 9], ['hands', 'head', 'heart', 'feet'][n % 4], n % 3 === 0 ? 'Not sure' : n % 7 === 0 ? 'Minor' : 'Major', selected.map(function (p) { return p.name; }).join('; '), 'Invented practice response.']);
      }
      write(tab.name, headers, rows);
    });
    setup();
    return { message: 'Created 240 invented students. No real student records were used.' };
  }
  return { setup: setup, prepare: prepare, interest: interest, sort: sort, checkAgain: checkAgain, practice: practice, safeCell: safeCell, readSettings: settings, readChoices: choices, readDetails: details, masterHeaders: MASTER_HEADERS, savedMessage: savedMessage };
}());

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Project: Pomfret').addItem('Setup', 'PP_setup').addItem('Prepare students', 'PP_prepare').addItem('Count interest', 'PP_interest').addItem('Sort', 'PP_sort').addItem('Check again', 'PP_check').addSeparator().addItem('Make practice data', 'PP_practice').addToUi();
}
function PP_withLock(action) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) throw new Error('Another person is running the program. Wait for that run to finish.');
  try { return action(); } finally { lock.releaseLock(); }
}
// message can be a function of what the action returns.
function PP_menu(action, message) {
  try { var result = PP_withLock(action); SpreadsheetApp.getUi().alert(typeof message === 'function' ? message(result) : message); }
  catch (e) { SpreadsheetApp.getUi().alert('Project: Pomfret stopped\n\n' + e.message); }
}
function PP_saved(n) { return n ? PPAdapter.savedMessage(n) + '\n\n' : ''; }
function PP_setup() { PP_menu(PPAdapter.setup, 'Setup is ready. Existing settings were preserved.'); }
function PP_prepare() { PP_menu(PPAdapter.prepare, 'Read PP Students and PP Input check before counting interest.'); }
function PP_interest() { PP_menu(PPAdapter.interest, 'Read PP Interest and PP Project check. Final choices belong in Project choices.'); }
function PP_check() { PP_menu(PPAdapter.checkAgain, function (checks) { return PP_saved(checks.savedMoves) + 'PP Check now checks the grade tabs against the saved run. Students moved by hand have a new Fit, Reason and flags, and the group tabs, PP Summary and PP Needs you match the grade tabs.'; }); }
function PP_practice() { PP_menu(PPAdapter.practice, 'Practice data is ready. Run Prepare students, Count interest, then Sort.'); }
function PP_sort() {
  var ui = SpreadsheetApp.getUi(), response = ui.prompt('Why are you running the sort?', 'Describe the rule or client decision for PP Run log.', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  PP_menu(function () { return PPAdapter.sort(response.getResponseText()); }, function (result) { return PP_saved(result.savedMoves) + 'Proposed groups are ready. Read PP Summary, PP Check and PP Needs you.'; });
}
if (typeof module !== 'undefined' && module.exports) module.exports = PPAdapter;
