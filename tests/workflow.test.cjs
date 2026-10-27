const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../preview/workflow.js');
const engine = require('../core/engine.js');

test('one project decision preserves explicit choices and restores suggestion without losing unrelated constraints', () => {
  const project = {id:'example',length:'Either'};
  const before = {mustRun:true,leaders:['practice-id'],cannotRunWith:['other']};
  const major = flow.decision(project,'Major',before);
  assert.deepEqual(major,{...before,run:true,length:'Major'});
  assert.deepEqual(before,{mustRun:true,leaders:['practice-id'],cannotRunWith:['other']});
  assert.deepEqual(flow.decision(project,'auto',major),before);
  const off = flow.decision(project,'off',major);
  assert.equal(off.run,false); assert.equal(off.mustRun,false); assert.equal(off.length,undefined);
});

test('unavailable lengths are rejected while explicit run choices reach the engine', () => {
  const projects = [{id:'one',name:'Example One',length:'Major',enabled:true,types:[],goals:[]},
    {id:'two',name:'Example Two',length:'Major',enabled:true,types:[],goals:[]}];
  assert.throws(()=>flow.decision(projects[0],'Minor'),/offered/);
  assert.throws(()=>flow.decision(projects[0],'invalid'),/offered/);
  const cfg = {...engine.defaults,projectCount:1,minorProjects:0};
  const plan = engine.propose([],projects,cfg,{two:flow.decision(projects[1],'Major')});
  assert.deepEqual(plan.projects.map(p=>p.id),['two']);
});

test('review grouping retains every finding exactly once, including unknown errors', () => {
  const findings = [
    {code:'SOURCE_REVIEW',severity:'error',studentId:'practice-1',origin:'source'},
    {code:'SOURCE_REVIEW',severity:'error',studentId:'practice-1',origin:'source'},
    {code:'LOW_FIT',severity:'warning',studentId:'practice-2',origin:'check'},
    {code:'LOW_FIT',severity:'warning',studentId:'practice-2',origin:'check'},
    {code:'NEW_UNEXPECTED_ERROR',severity:'error',origin:'source'},
    {code:'NO_GENDER_DATA',severity:'warning',origin:'check'},
    {code:'PREVIOUS_UNAVAILABLE',severity:'warning',studentId:'practice-3',origin:'check'},
    {code:'GRADE_FIT_REVIEW',severity:'warning',origin:'check'},
    {code:'SOURCE_RECORD_NOTES',severity:'info',origin:'source'},
  ];
  const groups = flow.groups(findings), items = groups.flatMap(g=>g.items);
  assert.equal(items.length,findings.length);
  findings.forEach(f=>assert.equal(items.filter(item=>item===f).length,1));
  assert.equal(groups.find(g=>g.id==='identity').studentCount,1);
  assert.equal(groups.find(g=>g.id==='identity').hasError,true);
  assert.equal(groups.find(g=>g.id==='match').items.length,2);
  assert.equal(groups.find(g=>g.id==='rules').hasError,true);
  assert.equal(groups.find(g=>g.id==='rules').items[0],findings[4]);
});

test('plain match labels distinguish explicit interest, inferred interest and limited matches', () => {
  assert.equal(flow.matchLabel({checked:true,typeMatch:false,goalMatch:false}),'Checked this project');
  assert.equal(flow.matchLabel({checked:false,typeMatch:true,goalMatch:true}),'Matches Type + UN goal');
  assert.equal(flow.matchLabel({checked:false,typeMatch:true,goalMatch:false}),'Review this match');
});

test('project export status distinguishes cut projects, current placements and stale results', () => {
  const result = {projects:[{id:'kept',finalLength:'Minor'}]};
  assert.deepEqual(flow.projectOutcome('kept',result,false),{length:'Minor',status:'In placement draft'});
  assert.deepEqual(flow.projectOutcome('cut',result,false),{length:'',status:'Not in placement draft'});
  assert.deepEqual(flow.projectOutcome('kept',result,true),{length:'',status:'Out of date; update placements'});
  assert.deepEqual(flow.projectOutcome('kept',null,false),{length:'',status:'Placements not created'});
});
