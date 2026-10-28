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
    minorMin: 'Minimum students taking two Minors.', minorTarget: 'Target students taking two Minors.',
    minorMax: 'Maximum students taking two Minors.', allowMajorToMinor: 'Allow Major-preference moves when needed; each move is flagged.',
    checkedBeforeInferred: 'Prefer a checked project with no other match over an unchecked project matching Type and goal.'
  };
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
  function seed(name, headers, rows) {
    if (!nonempty(sheet(name))) write(name, headers, rows);
  }
  function records(name, headers, required) {
    var data = values(name, required);
    if (!data.length) return [];
    var found = data[0].map(text), indices = headers.map(function (h) {
      var matches = found.reduce(function (a, x, i) { if (x === h) a.push(i); return a; }, []);
      if (matches.length !== 1) throw new Error('Tab "' + name + '" needs exactly one "' + h + '" column.');
      return matches[0];
    });
    return data.slice(1).filter(function (r) { return r.some(function (v) { return text(v) !== ''; }); }).map(function (r, i) {
      var o = { _row: i + 2 }; headers.forEach(function (h, j) { o[h] = r[indices[j]]; }); return o;
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
    Object.keys(result).forEach(function (key) { if (!seen[key]) throw new Error('Settings is missing ' + key + '. Restore the row before running.'); });
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
    var projects = nonempty(sheet('Projects')) ? readProjects().projects : PPCatalog;
    seed('Project choices', ['Project ID', 'Project', 'Run', 'Final length', 'Must run', 'Leaders', "Can't run with"], projects.map(function (p) { return [p.id, p.name, '', '', false, '', '']; }));
    seed('Gender', ['Email', 'Gender'], []);
    seed('Status changes', ['Email', 'Name', 'Status', 'Why'], []);
    seed('PP Run log', ['Time', 'Why', 'Fingerprint', 'Placed', 'Needs review', 'Errors', 'Warnings'], []);
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
    records('Project choices', ['Project ID', 'Project', 'Run', 'Final length', 'Must run', 'Leaders', "Can't run with"], true).forEach(function (r) {
      var id = text(r['Project ID']), p = byId[id];
      if (!p) throw new Error('Unknown Project ID in Project choices: ' + id);
      if (result[id]) throw new Error('Duplicate Project ID in Project choices: ' + id);
      var length = text(r['Final length']);
      if (length && ['Major', 'Minor'].indexOf(length) === -1) throw new Error(p.name + ': Final length must be Major, Minor or blank.');
      if (length && p.length !== 'Either' && length !== p.length) throw new Error(p.name + ' is listed as ' + p.length + '. Update the approved source metadata before changing its length.');
      var choice = { run: boolean(r.Run, p.name + ' Run', null), length: length || null, mustRun: boolean(r['Must run'], p.name + ' Must run', false), leaders: [], cannotRunWith: [] };
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
  function output(input, result) {
    var studentsById = {}, assignmentsById = {};
    input.students.forEach(function (s) { studentsById[s.id] = s; });
    result.assignments.forEach(function (a) { assignmentsById[a.studentId] = a; });
    [12, 11, 10].forEach(function (grade) {
      write(masterName(grade), MASTER_HEADERS, input.students.filter(function (s) { return s.grade === grade; }).map(function (s) {
        var a = assignmentsById[s.id] || { status: 'review', reason: 'No assignment returned.', flags: ['Missing assignment'] };
        // Like the master list, a Major shows its MAJ- label in both columns.
        var second = a.project2 || (lengthOf(a.project1, result.projects) === 'Major' ? a.project1 : null);
        return [s.id, s.name, projectToken(a.project1, result.projects), projectToken(second, result.projects), a.status, a.fit1, a.fit2, a.reason, (a.flags || []).join('; ')];
      }));
    });
    var oldRegistry = values('PP Project tabs', false).slice(1).map(function (r) { return String(r[2] || ''); });
    var newRegistry = [];
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
    var summaryRows = Object.keys(result.summary).filter(function (k) { return typeof result.summary[k] !== 'object'; }).map(function (k) { return [k, result.summary[k]]; });
    Object.keys(result.summary.fitCounts || {}).forEach(function (tier) { summaryRows.push(['Fit ' + tier + ' placements', result.summary.fitCounts[tier]]); });
    [12, 11, 10].forEach(function (grade) { var g = (result.summary.byGrade || {})[grade]; if (g) { summaryRows.push(['Grade ' + grade + ' placed', g.placed], ['Grade ' + grade + ' mean fit', g.meanFit == null ? 'Not available' : g.meanFit]); } });
    write('PP Summary', ['Metric', 'Value'], summaryRows.concat([['Fingerprint', result.fingerprint], ['Review status', 'Proposed groups. Read PP Check and PP Needs you before use.']]));
    write('PP Needs you', ['Student ID', 'Name', 'Grade', 'Status', 'Reason', 'Flags'], result.assignments.filter(function (a) { return a.status === 'review' || (a.flags || []).length || (studentsById[a.studentId].issues || []).length; }).map(function (a) {
      var s = studentsById[a.studentId]; return [s.id, s.name, s.grade, a.status, a.reason, (a.flags || []).concat(s.issues || []).join('; ')];
    }));
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
    var input = prepare(), config = settings(), decisions = choices(input.projects, input.students);
    var result = PPEngine.sort(input.students, input.projects, config, decisions);
    snapshot(input, result, config, decisions);
    output(input, result);
    var allChecks = result.checks.concat(input.issues || [], result.issues || []);
    sheet('PP Run log', true).appendRow([new Date(), safeCell(reason), result.fingerprint, result.summary.placed, result.summary.needsReview, allChecks.filter(function (c) { return c.severity === 'error'; }).length, allChecks.filter(function (c) { return c.severity === 'warning'; }).length]);
    return result;
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
  function checkAgain() {
    var state = readSnapshot(), baseline = {}, checks = [], current = [], known = {}, tokenMap = {};
    state.assignments.forEach(function (a) { baseline[a.studentId] = a; });
    state.students.forEach(function (s) { known[s.id] = s; });
    state.projects.forEach(function (p) { tokenMap[projectToken(p.id, state.projects)] = p.id; });
    [12, 11, 10].forEach(function (grade) {
      records(masterName(grade), MASTER_HEADERS, true).forEach(function (r) {
        var id = text(r['Student ID']), original = baseline[id], one = text(r['Project #1']), two = text(r['Project #2']);
        var a = { studentId: id, project1: one ? tokenMap[one] || one : null, project2: two ? tokenMap[two] || two : null, status: text(r.Status), reason: text(r.Reason), flags: [], fit1: null, fit2: null };
        // A Major's Project #2 repeats its MAJ- label or is blank. Either way it is one project.
        if (a.project2 === a.project1 && lengthOf(a.project1, state.projects) === 'Major') a.project2 = null;
        if (known[id] && known[id].grade !== grade) checks.push({ severity: 'error', code: 'wrong_grade_tab', studentId: id, message: 'Student appears in the wrong grade master.' });
        if (one && !tokenMap[one] || two && !tokenMap[two]) checks.push({ severity: 'error', code: 'unknown_project_token', studentId: id, message: 'Project #1 or #2 does not exactly match a running MAJ-/MIN- project label.' });
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
    checks = checks.concat(PPEngine.check(state.students, state.projects, current, state.settings, state.choices), state.inputIssues, state.runIssues);
    try {
      var live = readInputs(), currentSettings = settings(), currentChoices = choices(live.projects, live.students);
      if (PPEngine.fingerprint({ students: live.students, projects: live.projects, settings: currentSettings, choices: currentChoices }) !== state.inputFingerprint) checks.push({ severity: 'warning', code: 'stale_inputs', message: 'Inputs or settings changed after Sort. These checks use the saved run rules. Run Sort again to apply the current inputs.' });
    } catch (e) { checks.push({ severity: 'warning', code: 'current_input_error', message: 'The saved run was checked, but current inputs could not be compared: ' + e.message }); }
    writeIssues('PP Check', checks);
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
  return { setup: setup, prepare: prepare, interest: interest, sort: sort, checkAgain: checkAgain, practice: practice, safeCell: safeCell, readSettings: settings, readChoices: choices, masterHeaders: MASTER_HEADERS };
}());

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Project: Pomfret').addItem('Setup', 'PP_setup').addItem('Prepare students', 'PP_prepare').addItem('Count interest', 'PP_interest').addItem('Sort', 'PP_sort').addItem('Check again', 'PP_check').addSeparator().addItem('Make practice data', 'PP_practice').addToUi();
}
function PP_withLock(action) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) throw new Error('Another person is running the program. Wait for that run to finish.');
  try { return action(); } finally { lock.releaseLock(); }
}
function PP_menu(action, message) {
  try { PP_withLock(action); SpreadsheetApp.getUi().alert(message); }
  catch (e) { SpreadsheetApp.getUi().alert('Project: Pomfret stopped\n\n' + e.message); }
}
function PP_setup() { PP_menu(PPAdapter.setup, 'Setup is ready. Existing settings were preserved.'); }
function PP_prepare() { PP_menu(PPAdapter.prepare, 'Read PP Students and PP Input check before counting interest.'); }
function PP_interest() { PP_menu(PPAdapter.interest, 'Read PP Interest and PP Project check. Final choices belong in Project choices.'); }
function PP_check() { PP_menu(PPAdapter.checkAgain, 'PP Check now evaluates the current grade master cells against the saved run.'); }
function PP_practice() { PP_menu(PPAdapter.practice, 'Practice data is ready. Run Prepare students, Count interest, then Sort.'); }
function PP_sort() {
  var ui = SpreadsheetApp.getUi(), response = ui.prompt('Why are you running the sort?', 'Describe the rule or client decision for PP Run log.', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  PP_menu(function () { PPAdapter.sort(response.getResponseText()); }, 'Proposed groups are ready. Read PP Summary, PP Check and PP Needs you.');
}
if (typeof module !== 'undefined' && module.exports) module.exports = PPAdapter;
