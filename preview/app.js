(function () {
  'use strict';
  var main = document.getElementById('main');
  var dataset = typeof PPAttachedData !== 'undefined' ? PPAttachedData : null;
  var dataError = validateAttachedData(dataset);
  if (dataError) {
    main.innerHTML = '<div class="notice error" role="alert"><div><strong>Attached student data could not be loaded.</strong><p id="data-error-detail"></p><p>This page requires the local case-f-private/attached-data.js file alongside the prototype folder. Run the attached-workbook importer described in the setup notes, keep both folders together, and reopen this page. No practice data has been substituted.</p><a href="../README.md">Open setup notes</a></div></div>';
    document.getElementById('data-error-detail').textContent = dataError;
    return;
  }
  if (typeof PPEngine === 'undefined') {
    main.innerHTML = '<div class="notice error" role="alert">The local sorting files could not load. Keep the preview and core folders together, then reopen this page.</div>';
    return;
  }
  var catalog = dataset.projects.filter(function (p) { return p.enabled !== false; });
  var students = dataset.students;
  var census = students.reduce(function (counts,student) { counts.total += 1; if (student.status === 'eligible' || student.status === 'late') counts.candidates += 1; else if (student.status === 'trip' || student.status === 'leader') counts.excluded += 1; else counts.review += 1; counts.byStatus[student.status] = (counts.byStatus[student.status] || 0) + 1; return counts; },{total:0,candidates:0,excluded:0,review:0,byStatus:{}});
  var settings = Object.assign({}, PPEngine.defaults);
  var choices = {};
  var state = {view:'interest',query:'',projectFilter:'all',grade:'all',studentStatus:'all',placementMode:'students',week:'1',placementFilter:'all',support:null,result:null,resultSettings:null,stale:false,log:[],error:'',plan:null};
  var projectMap = Object.fromEntries(catalog.map(function (p) { return [p.id,p]; }));
  var studentMap = Object.fromEntries(students.map(function (s) { return [s.id,s]; }));
  var sourceIssues = (dataset.issues || []).slice();
  students.filter(function (student) { return student.status === 'review' || student.issues.length; }).forEach(function (student) {
    sourceIssues.push({code:student.status === 'review' ? 'SOURCE_REVIEW' : 'SOURCE_RECORD_NOTES',severity:student.status === 'review' ? 'error' : student.status === 'trip' || student.status === 'leader' ? 'info' : 'warning',message:student.issues.length ? student.issues.join(' ') : 'Source record requires review before placement.',studentId:student.id,source:student.source});
  });
  var interest = PPEngine.interest(students,catalog).sort(function (a,b) { return b.checked - a.checked || a.name.localeCompare(b.name); });
  function validateAttachedData(data) {
    function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
    function string(value) { return typeof value === 'string' && value.length <= 100000; }
    function strings(value) { return Array.isArray(value) && value.length <= 1000 && value.every(string); }
    function issue(value) { return string(value) || record(value) && string(value.code) && string(value.message) && ['error','warning','info'].includes(value.severity) && (!value.source || record(value.source)); }
    function types(value) { return strings(value) && value.every(function (type) { return ['head','hands','heart','feet'].includes(type); }); }
    function goals(value) { return strings(value) && value.every(function (goal) { return /^(?:[1-9]|1[0-7])$/.test(goal); }); }
    if (!record(data) || data.schemaVersion !== 1 || data.mode !== 'attached') return 'The attached-data file is missing or uses an unsupported format.';
    if (!Array.isArray(data.projects) || !data.projects.length || data.projects.length > 1000) return 'The imported project list is missing or invalid.';
    if (!Array.isArray(data.students) || !data.students.length || data.students.length > 5000) return 'The imported student records are missing or invalid.';
    if (!Array.isArray(data.sourceFiles) || data.sourceFiles.length > 50 || !data.sourceFiles.every(function (file) { return record(file) && string(file.name) && string(file.role) && (!file.sheet || string(file.sheet)); })) return 'The source-file metadata is invalid.';
    if (!Array.isArray(data.issues) || data.issues.length > 10000 || !data.issues.every(issue)) return 'The imported source findings are invalid.';
    var projectIds = new Set(), studentIds = new Set();
    for (var i = 0; i < data.projects.length; i += 1) {
      var project = data.projects[i];
      if (!record(project) || !string(project.id) || !project.id || !string(project.name) || !project.name || !['Major','Minor','Either'].includes(project.length) || typeof project.enabled !== 'boolean' || !types(project.types) || !goals(project.goals) || !strings(project.aliases)) return 'Project record ' + (i + 1) + ' has missing or invalid fields.';
      if (projectIds.has(project.id)) return 'The imported project list contains duplicate identifiers.';
      projectIds.add(project.id);
    }
    if (!data.projects.some(function (project) { return project.enabled; })) return 'The imported catalog has no enabled projects.';
    for (var j = 0; j < data.students.length; j += 1) {
      var student = data.students[j];
      if (!record(student) || !string(student.id) || !student.id || !string(student.name) || !string(student.email) || ![10,11,12].includes(student.grade) || !['eligible','late','trip','leader','review'].includes(student.status) || !['Major','Minor','Not sure'].includes(student.preference)) return 'Student record ' + (j + 1) + ' has an invalid identity, grade, status, or preference.';
      if (studentIds.has(student.id)) return 'The imported student records contain duplicate identifiers. Reconcile the source identities and reimport.';
      studentIds.add(student.id);
      if (!strings(student.choices) || !strings(student.previous) || !types(student.types) || !goals(student.goals) || !strings(student.issues) || !string(student.comments) || typeof student.previousKnown !== 'boolean' || !(student.gender === null || string(student.gender))) return 'Student record ' + (j + 1) + ' has missing or invalid response fields.';
      if (!student.choices.concat(student.previous).every(function (id) { return projectIds.has(id); })) return 'Student record ' + (j + 1) + ' refers to a project outside the imported catalog.';
      var source = student.source;
      if (!record(source) || !string(source.file) || !source.file || !string(source.sheet) || !source.sheet || !Number.isInteger(source.row) || source.row < 1 || source.row > 1000000 || (source.originalSheet !== undefined && !string(source.originalSheet))) return 'Student record ' + (j + 1) + ' has an invalid source reference.';
    }
    return '';
  }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function label(id) { return projectMap[id] ? projectMap[id].name : id || 'Not placed'; }
  function titleCase(value) { return String(value).charAt(0).toUpperCase() + String(value).slice(1); }
  function goalLabel(value) { return typeof PPGoalNames !== 'undefined' && PPGoalNames[value] ? value + '. ' + PPGoalNames[value] : 'Goal ' + value; }
  function badge(text,kind) { return '<span class="tag ' + esc(kind || '') + '">' + esc(text) + '</span>'; }
  function icon(name,extraClass) {
    var paths = {
      search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
      arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
      download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
      chevron:'<path d="m9 5 7 7-7 7"/>',
      check:'<path d="m5 12 4 4L19 6"/>',
      close:'<path d="m6 6 12 12M18 6 6 18"/>',
      people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0112 0v3M17 5a3 3 0 010 6m1 3a5 5 0 014 5v2"/>',
      grid:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/>'
    };
    return '<svg class="ui-icon ' + (extraClass || '') + '" viewBox="0 0 24 24" fill="none" aria-hidden="true">' + paths[name] + '</svg>';
  }
  function allFindings(result) {
    result = result || {};
    var seen = new Set(), findings = [];
    [['source',sourceIssues],['decision',result.issues || []],['check',result.checks || []]].forEach(function (group) {
      group[1].forEach(function (item) {
        var finding = typeof item === 'string' ? {code:'DECISION_NOTE',severity:'info',message:item} : item;
        var source = finding.source || {};
        var key = JSON.stringify([finding.code,finding.severity,finding.message,finding.studentId || '',finding.projectId || '',finding.week || '',source.file || '',source.sheet || '',source.row || '']);
        if (seen.has(key)) return;
        seen.add(key);
        findings.push(Object.assign({},finding,{origin:group[0]}));
      });
    });
    return findings;
  }
  function findingOrigin(finding) { return finding.origin === 'source' ? 'Source review' : finding.origin === 'decision' ? 'Sorting decision' : 'Assignment check'; }
  function sourceLabel(student) { var source = student.source || {}; return [source.file,source.originalSheet || source.sheet,source.row ? 'row ' + source.row : ''].filter(Boolean).join(' · ') || 'Source reference unavailable'; }
  function statusLabel(status) { return {eligible:'Eligible',late:'Green · placed last',trip:'Trip · excluded',leader:'Freshman leader · excluded',review:'Needs review'}[status] || status; }
  function stat(labelText,value,note,suffix) { return '<div class="stat"><div class="stat-label">' + esc(labelText) + '</div><div class="stat-number">' + esc(value) + (suffix ? '<small>' + esc(suffix) + '</small>' : '') + '</div><div class="stat-note">' + esc(note) + '</div></div>'; }
  function actionButton(text,id,kind) { return '<button class="button ' + (kind || 'primary') + '" id="' + id + '">' + text + '</button>'; }
  function heading(title,description,actions) { return '<div class="page-heading"><div><h1>' + title + '</h1><p>' + description + '</p></div><div class="heading-actions">' + (actions || '') + '</div></div>'; }
  function notice() {
    if (state.error) return '<div class="notice error" role="alert">' + esc(state.error) + '</div>';
    if (state.stale) return '<div class="notice"><span><strong>Your changes need a new placement run.</strong> Update placements to use the current project choices and rules.</span><button class="button small secondary" data-run>Update placements</button></div>';
    return '';
  }
  function updatePlan() {
    try { state.plan = PPEngine.propose(students,catalog,settings,choices); state.error = ''; }
    catch (error) { state.plan = {projects:[],issues:[]}; state.error = error.message; }
  }
  function invalidate() { if (state.result) state.stale = true; updatePlan(); }
  function chosenMap() { return Object.fromEntries((state.plan.projects || []).map(function (p) { return [p.id,p]; })); }
  function options(items,selected) { return items.map(function (item) { var v = Array.isArray(item) ? item[0] : item; var text = Array.isArray(item) ? item[1] : item; return '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + esc(text) + '</option>'; }).join(''); }
  function gradeSelect() { return '<select id="grade-filter" class="select" aria-label="Filter grade">' + options([['all','All grades'],[12,'Seniors'],[11,'Juniors'],[10,'Sophomores']],state.grade) + '</select>'; }
  function search(placeholder) { return '<div class="search-field"><input id="search" class="search" type="search" autocomplete="off" aria-label="' + esc(placeholder) + '" placeholder="' + esc(placeholder) + '" value="' + esc(state.query) + '">' + icon('search') + '<button class="search-clear" data-clear-search aria-label="Clear search"' + (!state.query ? ' hidden' : '') + '>' + icon('close') + '</button></div>'; }
  function stepHeading(step,title,description,actions) {
    var icon = step === 1 ? '<rect x="5" y="5" width="30" height="30" rx="3"/><path d="M5 14h30M16 14v21M16 24h19"/>' : '<circle cx="15" cy="12" r="5"/><path d="M5 33v-4a10 10 0 0120 0v4M27 8a5 5 0 010 10m1 4a9 9 0 017 9v2"/>';
    return heading('<span class="document-mark"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true">' + icon + '</svg></span><span>' + title + '</span>',description,actions);
  }
  function lengthGuide() { return '<div class="length-guide"><div><p><strong>Major <span>Two weeks</span></strong><span>The same project and group for both weeks.</span></p><div class="week-diagram major" aria-hidden="true"><span>Week 1</span><span>Week 2</span><b>One project, same group</b></div></div><div><p><strong>Minor <span>One week each</span></strong><span>Each student takes two different projects. Each project gets a new group in week two.</span></p><div class="week-diagram minor" aria-hidden="true"><span>Week 1</span><span>Week 2</span><b>First project</b><b>Different project</b></div></div></div>'; }
  function projectFilters(plan) {
    var major=plan.filter(function(p){return p.finalLength==='Major';}).length;
    var minor=plan.length-major;
    return '<div class="project-filters" role="group" aria-label="Filter draft projects">' + [['all','All projects',catalog.length],['Major','Majors',major],['Minor','Minors',minor],['off','Not running',catalog.length-plan.length]].map(function(item){return '<button class="filter-chip" data-project-filter="'+item[0]+'" aria-pressed="'+(state.projectFilter===item[0])+'"><span>'+item[1]+'</span><span class="filter-count">'+item[2]+'</span></button>';}).join('')+'</div>';
  }
  function showInterest() {
    var selected = chosenMap(), plan = state.plan.projects || [];
    var minors = plan.filter(function (p) { return p.finalLength === 'Minor'; }).length;
    var maxDemand = Math.max.apply(null,interest.map(function (r) { return r.checked; }).concat([1]));
    var html = stepHeading(1,'Choose projects','Use student interest to choose which projects to offer.','<button class="button primary next-button" data-view="placements">Next: place students ' + icon('arrow') + '</button>');
    html += notice();
    html += '<div class="plan-strip"><div><strong>' + plan.length + ' projects in the draft</strong><span>' + (plan.length-minors) + ' Majors · ' + minors + ' Minors</span></div><p><strong>' + census.candidates + ' students</strong> available to place. They could check several projects without ranking them.</p><button class="text-button" data-support="rules">View placement rules</button></div>';
    html += '<details class="schedule-guide"><summary>' + icon('chevron','disclosure-icon') + '<span><strong>Major:</strong> same project both weeks. <strong>Minor:</strong> two different projects.</span><span class="guide-hint">See schedule</span></summary>' + lengthGuide() + '</details>';
    if (state.result && !state.stale) {
      var changed = plan.filter(function(p){var outcome=PPWorkflow.projectOutcome(p.id,state.result,false);return outcome.length!==p.finalLength;}).length;
      if (changed) html += '<div class="notice info"><span><strong>The placement draft changed ' + changed + (changed===1?' project.':' projects.') + '</strong> It uses ' + state.result.projects.length + ' projects. You can see the changes below and in the exported list.</span><button class="button small" data-view="placements">View placements</button></div>';
    }
    html += '<section class="panel interest-panel"><div class="panel-head"><div><h2>Student interest</h2><p>Projects with the most selections appear first. Use the menu beside each one to choose whether it runs.</p></div><button class="button secondary small" id="export-interest">' + icon('download') + 'Export project list</button></div><div class="database-toolbar">' + projectFilters(plan) + search('Find a project') + '</div><div class="table-wrap"><table class="interest-table"><thead><tr><th scope="col">Project</th><th scope="col">Students interested</th><th scope="col"><span class="grade-breakdown"><span>Seniors</span><span>Juniors</span><span>Sophomores</span></span></th><th scope="col">Project choice</th></tr></thead><tbody>';
    var rows = interest.filter(function (r) { var p=selected[r.projectId]; return r.name.toLowerCase().includes(state.query.toLowerCase()) && (state.projectFilter==='all' || state.projectFilter==='off'&&!p || p&&p.finalLength===state.projectFilter); });
    rows.forEach(function (row) {
      var p = projectMap[row.projectId], c = choices[p.id] || {}, chosen = selected[p.id];
      var proposed = chosen ? chosen.finalLength : 'Do not run';
      var outcome = PPWorkflow.projectOutcome(p.id,state.result,state.stale);
      var outcomeNote = state.result && !state.stale && (chosen ? chosen.finalLength : '') !== outcome.length ? '<span class="project-outcome">' + (outcome.length ? 'In placements: ' + outcome.length : 'Left out of placement draft') + '</span>' : '';
      var value = c.run === false ? 'off' : c.run === true ? c.length || proposed : 'auto';
      var opts = [['auto','Suggested: ' + proposed]];
      if (p.length !== 'Minor') opts.push(['Major','Run as Major']);
      if (p.length !== 'Major') opts.push(['Minor','Run as Minor']);
      opts.push(['off','Do not run']);
      html += '<tr><td class="project-name">' + esc(p.name) + '<span class="project-meta">' + (p.length === 'Either' ? 'Can run as a Major or Minor' : p.length + ' in the project list') + (c.mustRun ? ' · Must run, even with a small group' : '') + '</span></td><td class="demand-cell"><span class="demand-number">' + row.checked + '</span><div class="demand-track" aria-hidden="true"><span class="demand-fill" data-width="' + Math.round(row.checked/maxDemand*100) + '"></span></div></td><td><span class="grade-breakdown">' + [12,11,10].map(function (g) { return '<span>' + (row.byGrade[g] || 0) + '</span>'; }).join('') + '</span></td><td><span class="decision-field ' + (chosen ? chosen.finalLength.toLowerCase() : 'off') + '"><span class="decision-dot" aria-hidden="true"></span><select class="compact-select decision-select" data-decision="' + esc(p.id) + '" aria-label="Decision for ' + esc(p.name) + '">' + options(opts,value) + '</select>' + icon('chevron') + '</span>' + outcomeNote + '</td></tr>';
    });
    if (!rows.length) html += '<tr><td colspan="4" class="empty-result"><strong>No projects match these filters.</strong><span>Try another name or choose All projects.</span></td></tr>';
    html += '</tbody></table></div><details class="table-foot"><summary>How the suggestions work</summary><p>The app suggests projects using student interest and your Major/Minor targets. Each Minor runs in both weeks with a different group. A combined project counts once per student.</p><p>Glass Fusing can run either length. Derelict Sculpture was canceled and is left out.</p><p>The app may drop a suggested project if its group is too small. Projects you choose stay in the draft. Any broken rules appear under Needs review.</p></details></section>';
    if (state.plan.issues.length) html += '<div class="notice"><div><strong>Review this project list</strong>' + state.plan.issues.map(function (f) { return '<p>' + esc(f.message || f) + '</p>'; }).join('') + '</div></div>';
    html += '<div class="step-end"><p>Mr. Litowitz still needs to confirm teacher availability and any projects that must run.</p><button class="button primary next-button" data-view="placements">Next: place students ' + icon('arrow') + '</button></div>';
    return html;
  }
  function sourceSummary() {
    return '<p class="source-summary">All ' + census.total + ' student records: <strong>' + census.candidates + ' available to place</strong>, ' + census.excluded + ' on trips or freshman leaders, and ' + census.review + ' need checking. <button class="text-button" data-support="records">View student records</button></p>';
  }
  function reviewPanel() {
    var findings = allFindings(state.result);
    // Group missing-placement notes with the same student's unresolved source record.
    var reviewIds = new Set(students.filter(function (s) { return s.status === 'review'; }).map(function (s) { return s.id; }));
    findings = findings.map(function (f) { return f.code === 'NEEDS_REVIEW' && reviewIds.has(f.studentId) ? Object.assign({},f,{code:'SOURCE_REVIEW'}) : f; });
    var grouped = PPWorkflow.groups(findings);
    return '<section class="panel review-panel"><div class="panel-head"><div><h2>Needs review</h2><p>Open a group of notes to see which students or projects need attention.</p></div><button class="button secondary small" id="export-checks"' + (state.stale ? ' disabled' : '') + '>Export review notes</button></div>' + grouped.map(function (g) {
      var countLabel = ['identity','unplaced','previous','preference'].includes(g.id) && g.studentCount ? g.studentCount + (g.studentCount === 1 ? ' student' : ' students') : g.items.length + (g.id === 'match' ? (g.items.length === 1 ? ' assignment' : ' assignments') : (g.items.length === 1 ? ' note' : ' notes'));
      return '<details class="review-group"><summary>' + icon('chevron','disclosure-icon') + '<span><span class="review-dot ' + (g.hasError ? 'error' : '') + '" aria-hidden="true"></span>' + esc(g.title) + '</span><span class="review-count">' + esc(countLabel) + '</span></summary><div class="review-content"><p>' + esc(g.action) + '</p>' + g.items.map(function (f) {
        var message = f.code === 'LOW_FIT' ? 'The student did not check this project, and it does not match both their Type and UN goal.' : f.message;
        return '<div class="review-note">' + (f.studentId && studentMap[f.studentId] ? '<button class="student-link" data-student="' + esc(f.studentId) + '">' + esc(studentMap[f.studentId].name || 'Name missing') + '</button> · ' : '') + (f.projectId ? '<strong>' + esc(label(f.projectId)) + '</strong>' + (f.week ? ' · Week ' + f.week : '') + ': ' : '') + esc(message) + (f.severity === 'error' ? ' <strong class="error-text">Needs correction</strong>' : '') + (f.source ? '<span class="project-meta">' + esc(sourceLabel({source:f.source})) + '</span>' : '') + '</div>';
      }).join('') + '</div></details>';
    }).join('') + '</section>';
  }
  function placementReason(a,student) {
    if (a.status !== 'placed') return a.status === 'excluded' ? statusLabel(student.status) : 'Check the student record and available spaces.';
    return [a.project1,a.project2].filter(Boolean).map(function (id,index) { var match=PPEngine.fit(student,selectedProject(id),state.resultSettings || settings); return (a.project2 ? 'Week ' + (index+1) + ': ' : '') + PPWorkflow.matchLabel(match); }).join(' · ');
  }
  function placementRows() {
    return state.result.assignments.filter(function (a) {
      var st=studentMap[a.studentId];
      var filter=state.placementFilter;
      return st && (state.grade==='all' || String(st.grade)===state.grade) && (filter==='all' || filter===a.status || filter==='match' && (a.fit1===6 || a.fit2===6)) && (st.name+' '+label(a.project1)+' '+label(a.project2)).toLowerCase().includes(state.query.toLowerCase());
    });
  }
  function showPlacements() {
    var html=stepHeading(2,'Place students','Create a draft schedule for both weeks. Check the placements before exporting it.','<button class="button secondary" data-view="interest">← Choose projects</button>' + (state.result ? '<button class="button primary" id="export-placements"'+(state.stale?' disabled':'')+'>Export draft placements</button>' : ''));
    html+=notice();
    if (!state.result) {
      var plan=state.plan.projects, minors=plan.filter(function(p){return p.finalLength==='Minor';}).length;
      html+='<section class="panel start-panel"><div><h2>'+plan.length+' projects · '+(plan.length-minors)+' Majors · '+minors+' Minors</h2><p>The app matches project choices, Types and UN goals within the group limits. Seniors have priority within each Major or Minor group.</p><p>Each student gets one Major or two different Minors. Students with missing or conflicting details stay on the review list.</p><button class="button primary" data-run>Create draft placements</button></div></section>'+sourceSummary();
      html+='<div class="notice"><div><strong>Still missing</strong><p>'+census.review+' student records need checking. Gender data is missing, and the sophomore form did not ask about past projects. The draft will show which checks are missing.</p></div><button class="button secondary small" data-support="records" data-status="review">Check student records</button></div>';
      html+='<p class="small-text muted">This uses your attached workbooks. It does not update the school spreadsheet. <button class="text-button" data-support="rules">See the placement rules</button></p>';
      return html;
    }
    var result=state.result, s=result.summary;
    html+='<div class="stats-strip">'+stat('Students placed',s.placed,'Draft placements')+stat('Taking a Major',s.majorStudents,'Same project for both weeks')+stat('Taking two Minors',s.minorStudents,'Different project each week')+stat('Not yet placed',s.needsReview,s.excluded+' trips / freshman leaders excluded')+'</div>';
    html+=sourceSummary();
    html+='<div class="result-line"><p><strong>'+s.projectCount+' projects in this result</strong> · '+s.minorProjectCount+' Minors</p><button class="text-button" data-run>Update placements</button></div>';
    var changed=result.projects.length!==state.plan.projects.length || result.projects.some(function(p){return !state.plan.projects.some(function(q){return q.id===p.id&&q.finalLength===p.finalLength;});});
    if (changed) html+='<div class="notice"><div><strong>The project list changed during placement.</strong><p>Some groups had too few students. The totals and rosters use the updated list. Read the reasons below.</p></div></div>';
    html+=reviewPanel();
    html+='<section class="panel"><div class="tabs" role="group" aria-label="View the same placements by student or project"><button class="tab '+(state.placementMode==='students'?'active':'')+'" aria-pressed="'+(state.placementMode==='students')+'" data-mode="students">'+icon('people')+'By student</button><button class="tab '+(state.placementMode==='rosters'?'active':'')+'" aria-pressed="'+(state.placementMode==='rosters')+'" data-mode="rosters">'+icon('grid')+'By project</button></div>';
    if(state.placementMode==='students') {
      html+='<div class="panel-head"><div><h2>Student schedules</h2><p>Click a student name to compare their responses with the placement.</p></div><div class="toolbar">'+search('Find a student')+gradeSelect()+'<select class="select" id="placement-filter" aria-label="Filter placements">'+options([['all','All records'],['placed','Placed'],['review','Needs placement'],['match','Review the match'],['excluded','Trips / leaders']],state.placementFilter)+'</select></div></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Grade</th><th>Week 1</th><th>Week 2</th><th>Why this placement</th></tr></thead><tbody>';
      var rows=placementRows();
      rows.forEach(function(a){var st=studentMap[a.studentId]; html+='<tr><td><button class="student-link" data-student="'+esc(st.id)+'">'+esc(st.name||'Name missing')+'</button>'+(a.status!=='placed'?'<span class="project-meta">'+(a.status==='excluded'?'Excluded':'Needs placement')+'</span>':'')+'</td><td>'+st.grade+'</td><td>'+esc(label(a.project1))+'</td><td>'+esc(a.project2?label(a.project2):a.project1?'Same Major, both weeks':'Not placed')+'</td><td class="placement-reason">'+esc(placementReason(a,st))+'</td></tr>';});
      if(!rows.length) html+='<tr><td colspan="5">No students match these filters.</td></tr>';
      html+='</tbody></table></div>';
    } else {
      html+='<div class="panel-head"><div><h2>Project groups</h2><p>Majors keep the same group. Minors have a different group each week.</p></div><div class="toolbar">'+search('Find a project')+'<select class="select" id="week-filter" aria-label="Select week">'+options([['1','Week 1'],['2','Week 2']],state.week)+'</select></div></div><div class="roster-grid">';
      var projects=result.projects.filter(function(p){return p.name.toLowerCase().includes(state.query.toLowerCase());});
      projects.forEach(function(p){var members=result.assignments.filter(function(a){return a.status==='placed'&&(p.finalLength==='Major'||state.week==='1'?a.project1===p.id:a.project2===p.id);}); html+='<article class="roster"><div class="roster-header"><h3>'+esc(p.name)+'</h3><p>'+esc(p.finalLength)+' · '+members.length+' students · '+(p.finalLength==='Major'?'Both weeks':'Week '+state.week)+'</p></div><ol>'+members.map(function(a){var st=studentMap[a.studentId];return '<li><button class="student-link" data-student="'+esc(st.id)+'">'+esc(st.name)+'</button><span class="muted">Grade '+st.grade+'</span></li>';}).join('')+'</ol></article>';});
      if(!projects.length) html+='<p>No projects match your search.</p>';
      html+='</div>';
    }
    html+='</section>'+runLog();
    return html;
  }
  function runLog(){return '<details class="support-details"><summary>Changes made this session</summary><p>Reloading the page clears these changes and placements.</p>'+state.log.slice().reverse().map(function(e,i){return '<p><strong>Draft '+(state.log.length-i)+' · '+esc(e.time)+'</strong>: '+esc(e.reason)+(e.same?' Same result as the previous run.':'')+'</p>';}).join('')+'</details>';}
  function showRecords(){
    var rows=students.filter(function(s){return(state.grade==='all'||String(s.grade)===state.grade)&&(state.studentStatus==='all'||s.status===state.studentStatus)&&(s.name+' '+s.email).toLowerCase().includes(state.query.toLowerCase());});
    return '<h2 id="support-title">Student records</h2><p>'+census.total+' records · '+census.candidates+' available to place · '+census.excluded+' excluded · '+census.review+' need checking. Select a student to see their form response. Correct errors in the working spreadsheet, then import the updated file.</p><div class="toolbar">'+search('Find a student or email')+gradeSelect()+'<select class="select" id="student-status-filter" aria-label="Filter student status">'+options([['all','All records'],['eligible','Eligible'],['late','Green · placed last'],['trip','Trips'],['leader','Freshman leaders'],['review','Needs checking']],state.studentStatus)+'</select></div><div class="table-wrap"><table><thead><tr><th>Student</th><th>Grade</th><th>Status</th><th>Notes</th></tr></thead><tbody>'+rows.map(function(s){return '<tr><td><button class="student-link" data-student="'+esc(s.id)+'">'+esc(s.name||'Name missing')+'</button></td><td>'+s.grade+'</td><td>'+esc(statusLabel(s.status))+'</td><td>'+esc(s.issues.join(' ')||'No notes.')+'</td></tr>';}).join('')+(!rows.length?'<tr><td colspan="4">No students match these filters.</td></tr>':'')+'</tbody></table></div>';
  }
  function showAbout(){
    var roles={project_catalog:'Project names, lengths and interest tags.',historical_output_layout:'Last year\'s grade lists and project rosters.',student_responses:'Student choices, interests and color-coded statuses.',requirements:'What Mr. Litowitz asked for and the rules he gave us.',later_defaults:'The handoff from Luke, including later changes to the project and placement rules.'};
    return '<h2 id="support-title">About this tool</h2><p>Last year, Mr. Litowitz spent longer fixing the first sort than he would have spent placing students himself. This tool gives him a draft he can check before making the final decisions.</p><ol class="about-goals"><li><strong>Decide which projects to run.</strong> Compare interest by grade and the suggested Major/Minor split. Mr. Litowitz checks teacher availability and group sizes before confirming the list.</li><li><strong>Place students in projects.</strong> Make a draft schedule with reasons for the placements and notes on what needs checking.</li></ol>'+lengthGuide()+'<p>Matching uses project choices, Types (hands, head, heart, feet), UN goals, senior priority and group limits. Mr. Litowitz reviews comments and friend requests; they do not affect the sort. Club members cannot manually move a student to another group.</p><div class="prototype-limits"><h3>Before using these groups</h3><p>This local draft still needs checks for gender balance, senior priority across all groups and student records with missing or conflicting details. The October 26 running document lists more requirements for the school Sheets version. <a href="../SOURCE-AUDIT.md">Read the source review and unfinished work</a>.</p></div><p>This prototype uses the attached files and runs on this computer. Mr. Litowitz approves the final placements. It does not update the school spreadsheet, and reloading clears your changes.</p><details class="support-details"><summary>Sources for this draft</summary>'+(dataset.sourceFiles||[]).map(function(f){return '<div class="source-item"><div><h3>'+esc(f.name)+'</h3><p>'+esc(roles[f.role]||String(f.role).replace(/_/g,' '))+'</p></div></div>';}).join('')+'<p><a href="../BRIEF.md">Read the project brief</a></p></details>';
  }
  function settingNumber(key,labelText,description){return '<div class="setting"><div><label for="setting-'+key+'">'+labelText+'</label><p>'+description+'</p></div><input id="setting-'+key+'" name="'+key+'" type="number" min="0" max="300" step="1" required value="'+settings[key]+'"></div>';}
  function showRules(){return '<h2 id="support-title">Placement rules</h2><p>These rules come from the meeting and the handoff from Luke. Change them at the request of Mr. Litowitz.</p><ul class="rule-summary"><li>Target '+settings.projectCount+' projects, including '+settings.minorProjects+' Minors.</li><li>Groups of '+settings.minSize+' to '+settings.maxSize+'. Aim for 10 to 12 students when planning; the app fills groups evenly. Each Minor runs once each week.</li><li>Target '+settings.minorTarget+' Minor students ('+settings.minorMin+' to '+settings.minorMax+'). Each gets two different projects.</li><li>Favor seniors, then juniors, then sophomores within each Major/Minor group. Check the results across all grades before approving the draft. Students marked green go last.</li><li>Exclude trips and freshman leaders. Avoid previous projects unless an approved project leader.</li><li>Gender checks need data from the school. This prototype flags uneven groups but cannot rebalance them. Teachers review comments and friend requests.</li></ul><details class="support-details"><summary>Edit placement rules</summary><div id="settings-error" role="alert" class="error-text"></div><form id="settings-form"><div class="settings-grid"><section>'+settingNumber('minSize','Minimum group size','Fewest students allowed in a group.')+settingNumber('maxSize','Maximum group size','The limit is 14 students.')+settingNumber('projectCount','Projects to run','The handoff calls for 22 to 24.')+settingNumber('minorProjects','Minor projects','Each runs in both weeks.')+'</section><section>'+settingNumber('minorMin','Minimum Minor students','Fewest students taking two Minors.')+settingNumber('minorTarget','Target Minor students','Number of students to aim for across the two Minors.')+settingNumber('minorMax','Maximum Minor students','Most students taking two Minors.')+'<div class="setting"><div><label for="setting-allowMajorToMinor">Allow Minors for students who requested a Major</label><p>Use this only if needed. The draft flags each change.</p></div><input id="setting-allowMajorToMinor" name="allowMajorToMinor" type="checkbox"'+(settings.allowMajorToMinor?' checked':'')+'></div><div class="setting"><div><label for="setting-checkedBeforeInferred">If no stronger match is available</label><p>Choose between a checked project and an unchecked project that matches both Type and UN goal.</p></div><select id="setting-checkedBeforeInferred" name="checkedBeforeInferred" class="select">'+options([['true','Checked project first'],['false','Type + goal first']],String(settings.checkedBeforeInferred))+'</select></div></section></div><button class="button primary" type="submit">Apply rule changes</button></form></details><details class="support-details"><summary>Projects that must run, even with a small group</summary><p>Mark these only if Mr. Litowitz says they must run. Groups below the minimum stay flagged.</p>'+catalog.map(function(p){return '<label class="required-option"><input type="checkbox" data-required="'+esc(p.id)+'"'+((choices[p.id]||{}).mustRun?' checked':'')+'> '+esc(p.name)+'</label>';}).join('')+'</details><p class="small-text">The Google Sheets version still needs approved project leaders and teacher scheduling conflicts.</p>';}
  function renderSupport(){var dialog=document.getElementById('support-dialog');dialog.innerHTML='<div class="dialog-top"><span></span><button class="icon-button" data-close="support-dialog" aria-label="Close supporting details">' + icon('close') + '</button></div>'+({records:showRecords,rules:showRules,about:showAbout}[state.support])();}
  function openSupport(kind,status){state.support=kind;state.query='';state.grade='all';state.studentStatus=status||'all';render();renderSupport();document.getElementById('support-dialog').showModal();}
  function render(){document.getElementById('current-page').textContent=state.view==='interest'?'Choose projects':'Place students';main.innerHTML=state.view==='interest'?showInterest():showPlacements();document.querySelectorAll('nav [data-view]').forEach(function(button){button.classList.toggle('active',button.dataset.view===state.view);if(button.dataset.view===state.view)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});main.querySelectorAll('[data-width]').forEach(function(bar){bar.style.width=bar.dataset.width+'%';});}
  function toast(message,kind){var t=document.getElementById('toast');t.classList.toggle('pending',kind==='pending');t.classList.toggle('error',kind==='error');t.innerHTML=(kind==='pending'?'<span class="spinner" aria-hidden="true"></span>':icon(kind==='error'?'close':'check'))+'<span>'+esc(message)+'</span>';t.hidden=false;clearTimeout(toast.timer);if(kind!=='pending')toast.timer=setTimeout(function(){t.hidden=true;},5000);}
  function openRun(){if(!state.log.length){performRun('First draft from the attached workbooks.');return;}document.getElementById('run-reason').value='';document.getElementById('run-reason').setCustomValidity('');document.getElementById('run-dialog').showModal();document.getElementById('run-reason').focus();}
  function performRun(reason){
    document.querySelectorAll('[data-run],#confirm-run').forEach(function(b){b.disabled=true;});
    main.setAttribute('aria-busy','true');
    toast('Creating draft placements…','pending');
    setTimeout(function(){try{var result=PPEngine.sort(students,catalog,settings,choices), previous=state.log[state.log.length-1];state.result=result;state.resultSettings=Object.assign({},settings);state.stale=false;state.error='';state.view='placements';state.query='';state.grade='all';state.placementFilter='all';state.log.push({reason:reason,time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),fingerprint:result.fingerprint,same:!!previous&&previous.fingerprint===result.fingerprint});document.getElementById('run-dialog').close();render();toast('The draft is ready. Start with Needs review.');}catch(error){state.error='Placements could not be created: '+error.message;document.getElementById('run-dialog').close();render();toast('The draft could not run. Check the error above.','error');}finally{main.removeAttribute('aria-busy');document.getElementById('confirm-run').disabled=false;}},30);
  }
  function selectedProject(id) { return state.result && state.result.projects.find(function (p) { return p.id === id; }) || projectMap[id]; }
  function showStudent(id) {
    var student = studentMap[id];
    var a = state.result && state.result.assignments.find(function (assignment) { return assignment.studentId === id; });
    if (!student) return;
    var dialog = document.getElementById('student-dialog');
    var html = '<div class="dialog-top"><span class="small-kicker">Form response' + (a ? ' &amp; draft placement' : '') + '</span><button class="icon-button" data-close="student-dialog" aria-label="Close student details">' + icon('close') + '</button></div><h2 id="student-title">' + esc(student.name || 'Name missing') + '</h2><p>Grade ' + student.grade + ' · ' + esc(student.preference) + ' preference · ' + esc(statusLabel(student.status)) + '<br>' + esc(student.email || 'Email missing') + '</p>';
    if (state.stale && a) html += '<div class="notice">Your changes need a new placement run. Update placements to include your changes.</div>';
    if (a) html += '<div class="placement-pair"><div class="placement-box"><small>Project #1 / Week 1</small><strong>' + esc(label(a.project1)) + '</strong></div><div class="placement-box"><small>Project #2 / Week 2</small><strong>' + esc(a.project2 ? label(a.project2) : a.project1 ? 'Same Major, both weeks' : 'Not placed') + '</strong></div></div><h3>Why this placement</h3><p>' + esc(a.reason.replace(/Fit [1-6]: /g, '').replace(/tier [1-6]/gi, 'interest match')) + '</p>';
    else html += '<div class="notice info">These are the form responses. Create draft placements to see the schedule.</div>';
    (a ? [a.project1,a.project2] : []).filter(Boolean).forEach(function (pid) {
      var match = PPEngine.fit(student,selectedProject(pid),state.resultSettings || settings);
      html += '<p class="small-text"><strong>' + esc(label(pid)) + '</strong> ' + badge(match.checked ? 'Checked' : 'Not checked') + ' ' + badge(match.typeMatch ? 'Type match' : 'No Type match') + ' ' + badge(match.goalMatch ? 'Goal match' : 'No goal match') + '</p>';
    });
    html += '<div class="evidence-grid"><section class="evidence wide"><h3>Checked projects</h3><div class="evidence-tags">' + (student.choices.map(function (pid) { return badge(label(pid)); }).join('') || '<span class="muted">None of these choices match this year\'s project list</span>') + '</div></section><section class="evidence"><h3>Types</h3><p>' + esc(student.types.map(titleCase).join(', ') || 'Not provided') + '</p></section><section class="evidence"><h3>UN goals</h3><p>' + esc(student.goals.map(goalLabel).join('; ') || 'Not provided') + '</p></section><section class="evidence"><h3>Previous projects</h3><p>' + esc(student.previousKnown === false ? 'Past projects are missing or unclear, so the app cannot check for repeats yet.' : student.previous.map(label).join(', ') || 'None of the past projects appear in this year\'s list.') + '</p></section><section class="evidence"><h3>Original spreadsheet row</h3><p>' + esc(sourceLabel(student)) + '</p></section><section class="evidence wide"><h3>Review notes</h3><p>' + esc(((a ? a.flags || [] : []).concat(student.issues || []).join(' ') || 'No other notes.').replace('Fit 6: review the placement.', 'This project has little overlap with the student\'s interests. Check the placement.')) + '</p></section><section class="evidence wide"><h3>Student comment · faculty review only</h3><p>' + esc(student.comments || 'No comment.') + '</p><p class="small-text">Comments do not affect placements.</p></section></div><div class="dialog-actions"><button class="button secondary" data-close="student-dialog">Close details</button></div>';
    dialog.innerHTML = html;
    dialog.showModal();
  }
  function csvCell(value) { var text = String(value == null ? '' : value); if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g,'""') + '"'; }
  function download(filename,rows) { var blob = new Blob(['\ufeff' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n')],{type:'text/csv;charset=utf-8'}); var url = URL.createObjectURL(blob); var anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(function () { URL.revokeObjectURL(url); },1000); }
  function exportInterest() { var selected = chosenMap(); download('case-f-proposed-interest.csv',[['Review status','Project','Checked','Checked and Type or goal','Senior','Junior','Sophomore','Project choice before placement','Current placement length','Placement status']].concat(interest.map(function (r) { var outcome=PPWorkflow.projectOutcome(r.projectId,state.result,state.stale); return ['Proposed; review required',r.name,r.checked,r.aligned,r.byGrade[12] || 0,r.byGrade[11] || 0,r.byGrade[10] || 0,selected[r.projectId] ? selected[r.projectId].finalLength : 'Not selected',outcome.length,outcome.status]; }))); toast('Project list exported with placement status.'); }
  function exportPlacements() {
    if (!state.result || state.stale) return;
    download('case-f-proposed-placements.csv',[['Review status','Name','Grade','Email','Project #1','Project #2','Fit 1','Fit 2','Status','Reason','Flags','Comment for faculty','Source reference']].concat(state.result.assignments.map(function (a) { var s = studentMap[a.studentId]; var p = selectedProject(a.project1); var q = selectedProject(a.project2); return ['Proposed; review required',s.name,s.grade,s.email,p ? (p.finalLength === 'Minor' ? 'MIN-' : 'MAJ-') + p.name : '',q ? 'MIN-' + q.name : '',a.fit1,a.fit2,a.status,a.reason,(a.flags || []).concat(s.issues || []).join('; '),s.comments,sourceLabel(s)]; })));
    toast('Draft placements exported.');
  }
  function exportChecks() {
    if (state.stale) return;
    download('case-f-proposed-checks.csv',[['Review status','Origin','Severity','Code','Message','Student','Project','Week','Run fingerprint','Source reference']].concat(allFindings(state.result).map(function (finding) {
      return ['Proposed; review required',findingOrigin(finding),finding.severity,finding.code,finding.message,finding.studentId && studentMap[finding.studentId] ? studentMap[finding.studentId].name : '',finding.projectId ? label(finding.projectId) : '',finding.week || '',state.result ? state.result.fingerprint : 'Not run',finding.source ? sourceLabel({source:finding.source}) : ''];
    })));
    toast('Review notes exported.');
  }
  document.addEventListener('click',function(event){
    var target=event.target.closest('button');if(!target||target.disabled)return;
    if(target.dataset.view){state.view=target.dataset.view;state.query='';state.grade='all';render();main.focus();window.scrollTo(0,0);return;}
    if(target.dataset.close){document.getElementById(target.dataset.close).close();return;}
    if(target.dataset.support){openSupport(target.dataset.support,target.dataset.status);return;}
    if(target.hasAttribute('data-run')){openRun();return;}
    if(target.dataset.student){showStudent(target.dataset.student);return;}
    if(target.dataset.mode){state.placementMode=target.dataset.mode;state.query='';render();main.querySelector('[data-mode="'+state.placementMode+'"]').focus({preventScroll:true});return;}
    if(target.dataset.projectFilter){state.projectFilter=target.dataset.projectFilter;render();main.querySelector('[data-project-filter="'+state.projectFilter+'"]').focus({preventScroll:true});return;}
    if(target.hasAttribute('data-clear-search')){var input=target.closest('.search-field').querySelector('input');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();return;}
    if(target.id==='export-interest')exportInterest();
    if(target.id==='export-placements')exportPlacements();
    if(target.id==='export-checks')exportChecks();
  });
  document.addEventListener('input',function(event){
    if(event.target.id!=='search')return;
    state.query=event.target.value;
    event.target.closest('.search-field').querySelector('[data-clear-search]').hidden=!state.query;
    var root=state.support==='records'?document.getElementById('support-dialog'):main;
    var preview=document.createElement('div');preview.innerHTML=state.support==='records'?showRecords():state.view==='interest'?showInterest():showPlacements();
    var selector=!state.support&&state.view==='placements'&&state.placementMode==='rosters'?'.roster-grid':'tbody';
    var current=root.querySelector(selector),replacement=preview.querySelector(selector);if(current&&replacement)current.innerHTML=replacement.innerHTML;
    root.querySelectorAll('[data-width]').forEach(function(bar){bar.style.width=bar.dataset.width+'%';});
  });
  document.addEventListener('change',function(event){
    var input=event.target;
    if(input.dataset.decision){var id=input.dataset.decision;choices[id]=PPWorkflow.decision(projectMap[id],input.value,choices[id]);invalidate();render();var field=main.querySelector('[data-decision="'+id+'"]')||main.querySelector('[data-project-filter="'+state.projectFilter+'"]');if(field)field.focus({preventScroll:true});toast(projectMap[id].name+': '+(input.value==='auto'?'using the suggestion.':input.value==='off'?'not running.':'run as '+input.value+'.'));return;}
    if(input.dataset.required){var id=input.dataset.required;if(!choices[id])choices[id]={};choices[id].mustRun=input.checked;if(input.checked)delete choices[id].run;invalidate();render();return;}
    if(input.id==='grade-filter')state.grade=input.value;
    else if(input.id==='week-filter')state.week=input.value;
    else if(input.id==='placement-filter')state.placementFilter=input.value;
    else if(input.id==='student-status-filter')state.studentStatus=input.value;
    else return;
    if(state.support==='records')renderSupport();else render();
    var filterRoot=state.support==='records'?document.getElementById('support-dialog'):main;var updated=filterRoot.querySelector('#'+input.id);if(updated)updated.focus({preventScroll:true});
  });
  document.addEventListener('submit',function(event){
    if(event.target.id==='settings-form'){
      event.preventDefault();var form=new FormData(event.target), candidate=Object.assign({},settings);
      ['minSize','maxSize','projectCount','minorProjects','minorMin','minorTarget','minorMax'].forEach(function(key){candidate[key]=Number(form.get(key));});
      candidate.targetSize=Math.min(candidate.maxSize,Math.max(candidate.minSize,settings.targetSize));
      candidate.allowMajorToMinor=form.has('allowMajorToMinor');candidate.checkedBeforeInferred=form.get('checkedBeforeInferred')==='true';
      try{PPEngine.propose(students,catalog,candidate,choices);settings=candidate;invalidate();document.getElementById('support-dialog').close();render();toast('Rules changed. Update placements to apply them.');}catch(error){document.getElementById('settings-error').textContent=error.message;}
    }
    if(event.target.id==='run-form'){
      event.preventDefault();var field=document.getElementById('run-reason'),reason=field.value.trim();if(reason.length<5){field.setCustomValidity('Add a short reason (at least five characters).');field.reportValidity();return;}field.setCustomValidity('');performRun(reason);
    }
  });
  document.getElementById('run-reason').addEventListener('input',function(){this.setCustomValidity('');});
  document.getElementById('support-dialog').addEventListener('close',function(){state.support=null;state.query='';state.grade='all';this.innerHTML='';render();});
  updatePlan();render();
}());
