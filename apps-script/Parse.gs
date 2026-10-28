// Generated from core/parser.js. Edit the core source and rebuild.
/* Case F: deterministic form preparation. Source sheets are never modified. */
var PPParser = (function () {
  'use strict';
  var GOALS = [
    'No Poverty', 'Zero Hunger', 'Good Health and Well-Being', 'Quality Education',
    'Gender Equality', 'Clean Water and Sanitation', 'Affordable and Clean Energy',
    'Decent Work and Economic Growth', 'Industry Innovation and Infrastructure',
    'Reduced Inequalities', 'Sustainable Cities and Communities',
    'Responsible Consumption and Production', 'Climate Action', 'Life Below Water',
    'Life on Land', 'Peace Justice and Strong Institutions', 'Partnerships for the Goals'
  ];
  var EXTRA_ALIASES = {
    'stem-app-building': ['STEM', 'S.T.E.M.', 'App Building'],
    'trail-mix-rock-climbing': ['Trail Mix', 'Rock Climbing'],
    'music-for-social-justice-rap-cypher': ['Music for Social Justice', 'Rap Cypher'],
    'design-style-project-runway': ['Design and Style', 'Design & Style', 'Project: Pomfret Runway', 'Project Runway'],
    'cinderella': ['Cinderella Project'],
    'kind-art': ['KIND.art: Art for the Greater Good', 'KIND.art'],
    'glass-fusing': ['Glass Art'],
    'fly-fishing': ['Fly Tying and Fishing'],
    'play-and-create-board-games': ['Create and Play Board Games'],
    'model-un': ['Model U.N.'],
    'larp': ['Live-Action Role-Play (L.A.R.P.)', 'L.A.R.P.'],
    'health-science-research': ['Health Science Research'],
    'fueling-the-body-healthy-bodies': ['Fueling the Body', 'Healthy Body, Healthy Mind', 'Healthy Mind, Healthy Body', 'Healthy Bodies', 'Healthy Minds, Healthy Bodies', 'Healthy Minds Healthy Bodies'],
    'happiness-project': ['Happiness'],
    'biomimicry-3d-adaptive-tools': ['Biomimicry', '3-D Printed Adaptive Tools', '3D Adaptive Tools'],
    'the-people-v-the-system-class-actions-and-social-change': ['The People v. The System'],
    'derelict-scultpure': ['Derelict Sculpture', 'Derelict Scultpure']
  };
  var RETIRED = ['Create a New Sport', 'Criminal Justice', 'Cultural Awareness Program', 'CAP', 'Escape Room', 'GSD', 'Japanese Literature', 'Journal Entries', 'Outdoors is for Everyone', 'Stories Matter - Student Leader', 'Stories Matter', 'Merida', 'Murakami'];
  var NOT_RUNNING = ['Derelict Sculpture', 'Derelict Scultpure', 'Art of Living Smart', 'Perform an Original Play', 'Sketch Comedy Club', 'Buddhism, Wellbeing and Art'];
  var COLORS = {'#00ffff':'trip', '#ff9900':'leader', '#00ff00':'late'};
  var STATUS = ['eligible', 'late', 'trip', 'leader', 'review'];

  function text(value) { return value === null || value === undefined ? '' : String(value).trim(); }
  function normalize(value) {
    return text(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }
  function slug(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function unique(values) { return Array.from(new Set(values)); }
  function list(value) { return Array.isArray(value) ? value : [value]; }
  function canonicalTypes(value) {
    var found = [];
    list(value).forEach(function (item) {
      ['hands', 'head', 'heart', 'feet'].forEach(function (type) {
        if (new RegExp('(^|\\W)' + type + '($|\\W)', 'i').test(text(item))) found.push(type);
      });
    });
    return unique(found);
  }
  function canonicalGoals(value) {
    var result = [];
    list(value).forEach(function (item) {
      var raw = text(item), normalized = normalize(raw);
      if (!raw) return;
      if (/^\d{1,2}(?:\s*[,;|]\s*\d{1,2})*$/.test(raw)) {
        raw.split(/[,;|]/).forEach(function (part) { var n = Number(part); if (n >= 1 && n <= 17) result.push(String(n)); });
        return;
      }
      var number = raw.match(/^(?:goal\s*)?(\d{1,2})\s*[.:-]/i);
      if (number && +number[1] >= 1 && +number[1] <= 17) { result.push(String(+number[1])); return; }
      var aliases = {'good health':'3', 'good health and wellbeing':'3', 'reduced inequality':'10', 'reduced inequalties':'10', 'reduced inequalities':'10'};
      if (aliases[normalized]) { result.push(aliases[normalized]); return; }
      GOALS.forEach(function (goal, i) { if (normalized === normalize(goal)) result.push(String(i + 1)); });
    });
    return unique(result);
  }
  function emailOf(value) {
    var email = text(value).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }
  function timestamp(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value === 'number' && Number.isFinite(value)) return value > 100000000000 ? value : Math.round((value - 25569) * 86400000);
    var str = text(value);
    if (!str) return null;
    var parsed = Date.parse(str);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function colorOf(value) {
    var color = text(value).toLowerCase().replace(/^#/, '');
    if (color.length === 8) color = color.slice(2);
    if (color.length === 3) color = color.split('').map(function (x) { return x + x; }).join('');
    return '#' + color;
  }
  function literalRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function matchText(value) {
    return text(value).toLowerCase().replace(/[.’']/g, '').replace(/&/g, 'and').replace(/[–—]/g, '-').replace(/[ \t]+/g, ' ');
  }
  function aliasesFor(project) {
    return unique([project.name, project.id].concat(project.aliases || [], EXTRA_ALIASES[project.id] || []).filter(Boolean));
  }
  /* Do not split comma-joined checkbox prose: titles and descriptions themselves contain commas. */
  function titlePattern(alias) {
    var escaped = literalRegex(matchText(alias)).replace(/\s+/g, '\\s+');
    return new RegExp('(^|[,;\\n]\\s*|\\s/\\s)' + escaped + '(?=\\s*(?:$|[-:;,\\n(]))', 'gi');
  }
  function matchingProjects(value, projects, enabledOnly) {
    var raw = matchText(value), found = [];
    projects.forEach(function (project) {
      if (enabledOnly && project.enabled === false) return;
      if (aliasesFor(project).some(function (alias) { return titlePattern(alias).test(raw); })) found.push(project.id);
    });
    return unique(found);
  }
  function parsePrevious(value, projects) {
    var raw = text(value), norm = normalize(raw);
    if (!raw) return {ids:[], known:false, unresolved:false, retired:[]};
    var none = ['none', 'no', 'na', 'n a', 'not applicable', 'new', 'new student', 'new to school', 'im new', 'i am new', 'i did not participate in project pomfret', 'i was not in a project last year'];
    if (none.indexOf(norm) >= 0) return {ids:[], known:true, unresolved:false, retired:[]};
    var normalized = matchText(raw), ids = matchingProjects(raw, projects, false), remainder = normalized;
    var aliasList = [];
    projects.forEach(function (project) { aliasesFor(project).forEach(function (alias) { aliasList.push(alias); }); });
    var retired = RETIRED.filter(function (title) { return titlePattern(title).test(normalized); });
    aliasList.concat(RETIRED).sort(function (a,b) { return b.length - a.length; }).forEach(function (alias) {
      remainder = remainder.replace(titlePattern(alias), function (match, prefix) { return prefix; });
    });
    remainder = normalize(remainder).replace(/\b(and|maj|min)\b/g, '').trim();
    return {ids:ids, known:remainder.length === 0, unresolved:remainder.length > 0, retired:retired};
  }
  function findHeader(headers, label, predicate, required) {
    var matches = headers.map(function (header,i) { return predicate(normalize(header)) ? i : -1; }).filter(function (i) { return i >= 0; });
    if (matches.length > 1) throw new Error('More than one ' + label + ' column. Make the headers unambiguous.');
    if (!matches.length && required) throw new Error('Missing ' + label + ' column. Check the source header.');
    return matches.length ? matches[0] : -1;
  }
  function columns(headers) {
    return {
      timestamp: findHeader(headers, 'Timestamp', function (h) { return h === 'timestamp'; }, true),
      email: findHeader(headers, 'Email', function (h) { return h === 'email' || h === 'email address'; }, true),
      name: findHeader(headers, 'Name', function (h) { return h === 'name' || h.indexOf('what is your name') === 0; }, true),
      previous: findHeader(headers, 'Previous projects', function (h) { return h === 'previous projects' || h.indexOf('what project s were you in last year') === 0; }, false),
      preference: findHeader(headers, 'Major/Minor preference', function (h) { return h === 'preference' || h.indexOf('would you prefer to do a major project') === 0; }, true),
      comments: findHeader(headers, 'Comments', function (h) { return h === 'comments' || h.indexOf('please share anything else') === 0; }, false),
      goals: headers.map(function (h,i) { h = normalize(h); return h === 'un goals' || h.indexOf('sustainable development goals') >= 0 ? i : -1; }).filter(function (i) { return i >= 0; }),
      types: headers.map(function (h,i) { h = normalize(h); return h === 'types' || h.indexOf('type of project') >= 0 ? i : -1; }).filter(function (i) { return i >= 0; }),
      choices: headers.map(function (h,i) { h = normalize(h); return h === 'projects selected' || h === 'choices' || (h.indexOf('check all') >= 0 && h.indexOf('projects') >= 0) ? i : -1; }).filter(function (i) { return i >= 0; })
    };
  }
  function preferenceOf(value) {
    var val = normalize(value);
    if (val === 'not sure' || val === 'either' || val.indexOf('not sure') === 0) return 'Not sure';
    if (/^(a )?major\b/.test(val)) return 'Major';
    if (/^(two )?minor\b/.test(val)) return 'Minor';
    return null;
  }
  function gradeOf(table) {
    if ([10,11,12].indexOf(Number(table.grade)) >= 0) return Number(table.grade);
    var n = normalize(table.name);
    if (/senior/.test(n)) return 12;
    if (/junior/.test(n)) return 11;
    if (/soph/.test(n)) return 10;
    throw new Error('Specify grade 10, 11 or 12 for ' + text(table.name) + '.');
  }
  function issue(code, severity, message, source) {
    var value = {code:code, severity:severity, message:message};
    if (source) value.source = source;
    return value;
  }
  function prepare(tables, projects, options) {
    options = options || {};
    if (!Array.isArray(tables) || !tables.length) throw new Error('No grade source tables were supplied.');
    if (!Array.isArray(projects) || !projects.length) throw new Error('No projects were supplied.');
    var rows = [], issues = [], stats = {rawRows:0, students:0, droppedDuplicates:0, byGrade:{}, byStatus:{}, identityConflicts:0};
    tables.forEach(function (table) {
      if (!table.values || !Array.isArray(table.values[0])) throw new Error('Missing header row in ' + text(table.name) + '.');
      var c;
      try { c = columns(table.values[0]); } catch (error) { throw new Error(text(table.name) + ': ' + error.message); }
      if (!c.goals.length || !c.types.length || !c.choices.length) throw new Error(text(table.name) + ': missing UN goals, Types or project checkbox columns.');
      var grade = gradeOf(table), sheetName = text(table.name) || String(grade);
      if (c.previous < 0) issues.push(issue('PREVIOUS_UNAVAILABLE', 'warning', sheetName + ': no previous-project question; repeat-project checks cannot be completed for this grade.'));
      table.values.slice(1).forEach(function (row, index) {
        if (!row.some(function (v) { return text(v) !== ''; })) return;
        var source = {sheet:sheetName, row:index + 2}, email = emailOf(row[c.email]), name = text(row[c.name]);
        var fill = table.backgrounds && table.backgrounds[index + 1] ? table.backgrounds[index + 1][c.name] : '';
        var status = COLORS[colorOf(fill)] || 'eligible', parsedTime = timestamp(row[c.timestamp]);
        var problems = [], identityInvalid = !name || !email;
        stats.rawRows++;
        if (!name) problems.push('Name is missing.');
        if (!email) problems.push('Valid email is missing; reconcile this roster entry.');
        if (parsedTime === null) problems.push('No valid form timestamp.');
        if (identityInvalid && status !== 'trip' && status !== 'leader') status = 'review';
        if (parsedTime === null && status === 'eligible') status = 'review';
        var pref = preferenceOf(row[c.preference]);
        if (!pref) { problems.push('Major/Minor preference is missing or unrecognized.'); if (status !== 'trip' && status !== 'leader') status = 'review'; }
        var types = canonicalTypes(c.types.map(function (i) { return row[i]; }));
        var goals = canonicalGoals(c.goals.map(function (i) { return row[i]; }));
        if (!types.length) problems.push('No recognized project Type.');
        if (!goals.length) problems.push('No recognized UN goal.');
        var selected = unique([].concat.apply([], c.choices.map(function (i) { return matchingProjects(row[i], projects, true); })));
        if (!selected.length) problems.push('No current running project was checked.');
        else if (selected.length === 1) problems.push('Only one current project was checked; there is no priority bonus for a narrow choice.');
        var previous = c.previous >= 0 ? parsePrevious(row[c.previous], projects) : {ids:[],known:false,unresolved:false,retired:[]};
        if (!previous.known) problems.push(c.previous < 0 ? 'Previous-project question was not supplied.' : 'Previous projects are missing or contain an unrecognized title.');
        if (previous.unresolved && status !== 'trip' && status !== 'leader') status = 'review';
        if (previous.retired.length) problems.push('Historical project not on current list; no renamed-project equivalence was assumed.');
        rows.push({
          id:email || ('row:' + slug(sheetName) + ':' + grade + ':' + source.row), name:name, email:email, grade:grade,
          preference:pref || 'Not sure', choices:selected, types:types, goals:goals, previous:previous.ids,
          previousKnown:previous.known, status:status, gender:null, comments:c.comments >= 0 ? text(row[c.comments]) : '',
          source:source, issues:problems, _time:parsedTime, _nameKey:normalize(name), _invalid:identityInvalid,
          _blocked:identityInvalid || !pref || previous.unresolved || (parsedTime === null && !COLORS[colorOf(fill)]),
          _colorStatus:COLORS[colorOf(fill)] || null
        });
      });
    });
    var byEmail = {}, kept = [];
    rows.forEach(function (s) { if (!s.email) kept.push(s); else (byEmail[s.email] || (byEmail[s.email] = [])).push(s); });
    Object.keys(byEmail).sort().forEach(function (email) {
      var group = byEmail[email], identities = unique(group.map(function (s) { return s.grade + ':' + s._nameKey; }));
      if (identities.length > 1) {
        group.forEach(function (s) { s.id += ':' + slug(s.source.sheet) + ':' + s.source.row; s.status = 'review'; s._invalid = true; s.issues.push('Email is shared by different names or grades; do not merge these identities.'); kept.push(s); });
        stats.identityConflicts += group.length;
        issues.push(issue('IDENTITY_CONFLICT', 'error', 'One email identifies different names or grades. All affected rows are in review.', group[0].source));
        return;
      }
      // Only valid timestamped submissions are duplicate form submissions. Typed roster rows survive.
      var submissions = group.filter(function (s) { return s._time !== null; }), typed = group.filter(function (s) { return s._time === null; });
      submissions.sort(function (a,b) { return b._time - a._time || b.source.row - a.source.row || a.source.sheet.localeCompare(b.source.sheet); });
      if (submissions.length) {
        var winner = submissions[0], exclusions = unique(submissions.map(function (s) { return s._colorStatus; }).filter(function (s) { return s === 'trip' || s === 'leader'; }));
        if (exclusions.length === 1) winner.status = exclusions[0];
        if (exclusions.length > 1) { winner.status = 'review'; winner.issues.push('Duplicate submissions disagree on trip/freshman-leader exclusion.'); }
        if (submissions.length > 1) {
          stats.droppedDuplicates += submissions.length - 1;
          winner.issues.push('Latest timestamped submission retained; ' + (submissions.length - 1) + ' older submission(s) removed.');
          issues.push(issue('DUPLICATE_SUBMISSION', 'info', 'Older timestamped submission removed; latest retained.', winner.source));
        }
        kept.push(winner);
      }
      typed.forEach(function (s) {
        if (submissions.length || typed.length > 1) { s.id += ':roster:' + slug(s.source.sheet) + ':' + s.source.row; s.issues.push('Roster entry shares an email with another row; reconcile before sorting.'); s._invalid = true; if (s.status !== 'trip' && s.status !== 'leader') s.status = 'review'; }
        kept.push(s);
      });
      if (submissions.length && typed.length) { submissions[0].status = 'review'; submissions[0]._invalid = true; submissions[0].issues.push('A typed roster entry shares this email; reconcile the duplicate person before sorting.'); }
    });
    var genders = {};
    (options.genders || []).forEach(function (g) {
      var email = emailOf(g.email), gender = text(g.gender).toLowerCase().replace(/\s+/g, ' ');
      if (!email || !gender) { issues.push(issue('INVALID_GENDER_ROW', 'warning', 'Gender row needs a valid email and a supplied gender.')); return; }
      if (!genders[email]) genders[email] = [];
      genders[email].push(gender);
    });
    var statusChanges = options.statusChanges || [];
    statusChanges.forEach(function (change) {
      var email = emailOf(change.email), name = normalize(change.name), status = normalize(change.status), why = text(change.why);
      if (STATUS.indexOf(status) < 0 || !why || (!email && !name)) { issues.push(issue('INVALID_STATUS_CHANGE', 'error', 'Status change requires a valid status, a reason, and an email or exact name.')); return; }
      var matches = kept.filter(function (s) { return (!email || s.email === email) && (!name || s._nameKey === name); });
      if (matches.length !== 1) { issues.push(issue('AMBIGUOUS_STATUS_CHANGE', 'error', 'Status change did not identify exactly one student.')); return; }
      var target = matches[0];
      if (target._invalid && (status === 'eligible' || status === 'late')) { issues.push(issue('UNRESOLVED_IDENTITY', 'error', 'A status change cannot resolve a missing or conflicting identity.', target.source)); return; }
      if (target._blocked && (status === 'eligible' || status === 'late')) { issues.push(issue('UNRESOLVED_RESPONSE', 'error', 'A status change cannot repair missing or unrecognized required response data.', target.source)); return; }
      target.status = status;
      target.issues.push('Status changed: ' + why);
    });
    kept.forEach(function (s) {
      var values = unique(genders[s.email] || []);
      if (values.length === 1) s.gender = values[0];
      if (values.length > 1) { s.issues.push('Conflicting supplied gender values; gender remains unknown.'); issues.push(issue('CONFLICTING_GENDER', 'warning', 'Conflicting gender entries need review.', s.source)); }
      delete s._time; delete s._nameKey; delete s._invalid; delete s._blocked; delete s._colorStatus;
      stats.byGrade[s.grade] = (stats.byGrade[s.grade] || 0) + 1;
      stats.byStatus[s.status] = (stats.byStatus[s.status] || 0) + 1;
    });
    kept.sort(function (a,b) { return b.grade - a.grade || a.id.localeCompare(b.id); });
    stats.students = kept.length;
    return {students:kept, issues:issues, stats:stats};
  }
  function parseProjects(table) {
    if (!table || !table.values || !table.values.length) throw new Error('Projects source has no header row.');
    var headers = table.values[0], projectColumn = findHeader(headers,'Project',function(h) {return h === 'project' || h === 'project name';},true);
    var lengthColumn = findHeader(headers,'Length',function(h) {return h === 'length';},true);
    var typeColumns = [], goalColumns = [];
    headers.forEach(function (h,i) { h = normalize(h); if (/^type\b/.test(h)) typeColumns.push(i); if (/^unsdg\b|^un goal/.test(h)) goalColumns.push(i); });
    if (!typeColumns.length || !goalColumns.length) throw new Error('Projects source needs Type and UNSDG columns.');
    var projects = [], issues = [], seen = {};
    table.values.slice(1).forEach(function (row,index) {
      if (!row.some(function (v) { return text(v) !== ''; })) return;
      var name = text(row[projectColumn]).replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (!name) { issues.push(issue('PROJECT_NAME_MISSING','error','Project row has no name.',{sheet:table.name || 'Projects',row:index+2})); return; }
      var id = slug(name), length = text(row[lengthColumn]), normalizedLength = normalize(length);
      length = normalizedLength === 'major' ? 'Major' : normalizedLength === 'minor' ? 'Minor' : normalizedLength === 'either' ? 'Either' : null;
      if (!length) throw new Error('Project row ' + (index + 2) + ': Length must be Major, Minor or Either.');
      var aliases = unique([name].concat(EXTRA_ALIASES[id] || []));
      var enabled = !NOT_RUNNING.some(function (x) { return normalize(x) === normalize(name); });
      if (normalize(name) === 'glass fusing') { length = 'Either'; issues.push(issue('OCT23_GLASS','info','Glass Fusing uses Either, per the Oct 23 handoff.')); }
      if (!enabled) issues.push(issue('CANCELLED_PROJECT','info',name + ' is disabled under the supplied handoff.'));
      if (seen[id]) throw new Error('Duplicate project title on row ' + (index + 2) + '.');
      seen[id] = true;
      var goals = canonicalGoals(goalColumns.map(function (i) { return row[i]; })), types = canonicalTypes(typeColumns.map(function (i) { return row[i]; }));
      if (!types.length) issues.push(issue('PROJECT_TYPE_MISSING','warning',name + ' has no recognized Type.'));
      if (!goals.length) issues.push(issue('PROJECT_GOALS_MISSING','warning',name + ' has no recognized UN goal; it can match on Type only.'));
      projects.push({id:id,name:name,length:length,types:types,goals:goals,aliases:aliases,enabled:enabled});
    });
    return {projects:projects,issues:issues};
  }
  return {prepare:prepare,parseProjects:parseProjects,normalize:normalize,canonicalGoals:canonicalGoals,canonicalTypes:canonicalTypes,matchingProjects:matchingProjects,parsePrevious:parsePrevious};
}());
if (typeof module !== 'undefined' && module.exports) module.exports = PPParser;
