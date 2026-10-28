/* Presentation helpers only. All placement decisions remain in PPEngine. */
var PPWorkflow = (function () {
  'use strict';
  function decision(project, value, previous) {
    var next = Object.assign({}, previous || {});
    if (value === 'auto') { delete next.run; delete next.length; }
    else if (value === 'off') { next.run = false; delete next.length; next.mustRun = false; }
    else {
      if (!['Major','Minor'].includes(value) || (project.length !== 'Either' && project.length !== value)) throw new Error('Choose a length offered for this project.');
      next.run = true; next.length = value;
    }
    return next;
  }
  function groups(findings) {
    var definitions = [
      ['identity','Student information needs checking','Correct the missing or conflicting details in the working spreadsheet. Import it again, then update placements.'],
      ['unplaced','Students still need a placement','Check the project list and available spaces, then run placements again.'],
      ['rules','Groups to check','Review these groups with Mr. Litowitz. Change the projects or rules if he asks before using the draft.'],
      ['match','Weak interest matches','These projects have little overlap with what the students chose or listed as interests. Click a name to check the responses.'],
      ['preference','Major / Minor preferences changed','These students asked for a Major and received Minors, or asked for Minors and received a Major.'],
      ['gender','Gender balance needs checking','Check the groups using gender data from the school. Do not guess from names.'],
      ['previous','Past project information is missing','Add the missing past projects so the app can check for repeats.'],
      ['priority','Review senior priority','The average match is weaker for an older grade than for the next grade below it. Review those placements before approving the draft.'],
      ['source','Other notes','These notes come from the imported files and your project choices. Click a student name to read their comment.']
    ];
    var output = definitions.map(function (d) { return {id:d[0],title:d[1],action:d[2],items:[]}; });
    var index = Object.fromEntries(output.map(function (g) { return [g.id,g]; }));
    (findings || []).forEach(function (f) {
      var code = f.code || '', key;
      if (['SOURCE_REVIEW','IDENTITY_CONFLICT'].includes(code)) key = 'identity';
      else if (code === 'NEEDS_REVIEW') key = 'unplaced';
      else if (code === 'LOW_FIT') key = 'match';
      else if (['MAJOR_TO_MINOR','MINOR_PREFERENCE_CHANGED'].includes(code)) key = 'preference';
      else if (/GENDER/.test(code)) key = 'gender';
      else if (code === 'PREVIOUS_UNAVAILABLE') key = 'previous';
      else if (code === 'GRADE_FIT_REVIEW') key = 'priority';
      else if (f.severity === 'error' || f.origin === 'check' || f.origin === 'decision') key = 'rules';
      else key = 'source';
      index[key].items.push(f);
    });
    return output.filter(function (g) { return g.items.length; }).map(function (g) {
      g.studentCount = new Set(g.items.map(function (f) { return f.studentId; }).filter(Boolean)).size;
      g.hasError = g.items.some(function (f) { return f.severity === 'error'; });
      return g;
    });
  }
  function matchLabel(match) {
    return match.checked ? 'Checked this project' : match.typeMatch && match.goalMatch ? 'Matches Type + UN goal' : 'Review this match';
  }
  function projectOutcome(projectId,result,stale) {
    if (!result) return {length:'',status:'Placements not created'};
    if (stale) return {length:'',status:'Out of date; update placements'};
    var project = result.projects.find(function (p) { return p.id === projectId; });
    return {length:project ? project.finalLength : '',status:project ? 'In placement draft' : 'Not in placement draft'};
  }
  return {decision:decision,groups:groups,matchLabel:matchLabel,projectOutcome:projectOutcome};
}());
if (typeof module !== 'undefined' && module.exports) module.exports = PPWorkflow;
