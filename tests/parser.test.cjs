const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../core/parser.js');
const engine = require('../core/engine.js');
const headers = ['Timestamp','Email Address','Name','Previous projects','UN goals','Types','Preference','Projects selected','Comments'];
const projects = [
  {id:'robotics',name:'Robotics',length:'Major',types:['hands','head'],goals:['9'],aliases:[],enabled:true},
  {id:'stem-app-building',name:'STEM / App Building',length:'Major',types:['hands'],goals:['9'],aliases:['S.T.E.M.','App Building'],enabled:true},
  {id:'fueling-the-body-healthy-bodies',name:'Fueling the Body / Healthy Bodies',length:'Either',types:['head'],goals:['3'],aliases:['Fueling the Body','Healthy Body, Healthy Mind'],enabled:true},
  {id:'kind-art',name:'Kind Art',length:'Major',types:['hands'],goals:['12'],aliases:['KIND.art: Art for the Greater Good'],enabled:true},
  {id:'cancelled',name:'Cancelled',length:'Major',types:['hands'],goals:[],aliases:[],enabled:false}
];
function row(email='avery@example.org', name='Example, Avery', time='2026-10-01T12:00:00Z') {return [time,email,name,'None','Industry, Innovation, and Infrastructure','Hands - Make Something','Major','Robotics - Build, test, and improve.','A comment that must never affect sorting.'];}
function table(rows, grade=12, colors={}) {const values=[headers.slice(),...rows], backgrounds=values.map(()=>headers.map(()=> '#ffffff')); Object.keys(colors).forEach(i=>backgrounds[+i+1][2]=colors[i]); return {name:grade===12?'Senior':grade===11?'Junior':'Sophomore',grade,values,backgrounds};}

test('parses title boundaries without splitting comma-containing descriptions or rewarding combined halves twice',()=>{
  const r=row(); r[7]='S.T.E.M. - Build useful things, App Building - Learn, test, and ship, Healthy Body, Healthy Mind - A course, Fueling the Body - More ideas, KIND.art: Art for the Greater Good - Create crafts.';
  const result=parser.prepare([table([r])],projects).students[0];
  assert.deepEqual(result.choices.sort(),['fueling-the-body-healthy-bodies','kind-art','stem-app-building']);
  assert.deepEqual(result.goals,['9']); assert.deepEqual(result.types,['hands']);
  assert.equal(result.comments,r[8]);
  assert.deepEqual(parser.matchingProjects('A workshop about Robotics - is not a checked title', projects, true),[]);
});
test('latest timestamp wins for same identity; old exclusion cannot vanish',()=>{
  const first=row(), second=row(); second[0]='2026-10-03T12:00:00Z'; second[7]='App Building';
  const result=parser.prepare([table([first,second],12,{0:'#00ffff'})],projects);
  assert.equal(result.stats.droppedDuplicates,1); assert.equal(result.students.length,1);
  assert.equal(result.students[0].status,'trip'); assert.deepEqual(result.students[0].choices,['stem-app-building']);
  assert.equal(result.students[0].source.row,3);
});
const sharedFlag='Two students sent their forms from the same email. Check that both answers are right.';
const smallRun={...engine.defaults,minSize:1,targetSize:2,maxSize:3,projectCount:1,minorProjects:0,minorMin:0,minorTarget:0,minorMax:0};
test('two students on one email are both placed with their own IDs and a warning',()=>{
  const a=row('shared@example.org','Example, Avery'), b=row('shared@example.org','Sample, Jordan','2026-10-02T12:00:00Z');
  const result=parser.prepare([table([a,b])],projects);
  assert.equal(result.students.length,2); assert.equal(result.stats.droppedDuplicates,0);
  assert.deepEqual(result.students.map(s=>s.id).sort(),['shared@example.org:example-avery','shared@example.org:sample-jordan']);
  assert.ok(result.students.every(s=>s.status==='eligible' && s.issues.includes(sharedFlag)));
  const shared=result.issues.filter(i=>i.code==='SHARED_EMAIL');
  assert.deepEqual(shared.map(i=>i.severity),['warning','warning']); assert.deepEqual(shared.map(i=>i.studentId).sort(),result.students.map(s=>s.id).sort());
  assert.ok(!result.issues.some(i=>i.severity==='error'));
  const run=engine.sort(result.students,projects,smallRun,{});
  assert.deepEqual(run.assignments.map(x=>x.status),['placed','placed']);
  assert.deepEqual(parser.prepare([table([a,b])],projects),result);
});
test('the same student sending the form twice keeps only the newest response',()=>{
  const older=row('twice@example.org','Example, Casey'), newer=row('twice@example.org','Example, Casey','2026-10-04T12:00:00Z'); newer[7]='App Building';
  const result=parser.prepare([table([newer,older])],projects);
  assert.equal(result.students.length,1); assert.equal(result.students[0].id,'twice@example.org');
  assert.deepEqual(result.students[0].choices,['stem-app-building']); assert.equal(result.stats.droppedDuplicates,1);
  assert.ok(!result.issues.some(i=>i.code==='SHARED_EMAIL'||i.severity!=='info'));
  // "Last, First" one time and "First Last" the next is still one student.
  const flipped=parser.prepare([table([row('flip@example.org','Example, Casey'),row('flip@example.org','Casey Example','2026-10-02T12:00:00Z')])],projects);
  assert.equal(flipped.students.length,1); assert.equal(flipped.students[0].name,'Casey Example');
  // A shortened first name is the same student, but the changed spelling is a warning.
  const renamed=parser.prepare([table([row('nick@example.org','Doe, Nick'),row('nick@example.org','Doe, Nicholas','2026-10-02T12:00:00Z')])],projects);
  assert.equal(renamed.students.length,1); assert.equal(renamed.students[0].name,'Doe, Nicholas');
  assert.ok(renamed.issues.some(i=>i.code==='DUPLICATE_SUBMISSION'&&i.severity==='warning'));
});
test('the same name and email in two grades stays in review',()=>{
  const result=parser.prepare([table([row('two-grades@example.org','Example, Rowan')],12),table([row('two-grades@example.org','Example, Rowan')],11)],projects);
  assert.equal(result.students.length,2); assert.ok(result.students.every(s=>s.status==='review'));
  assert.ok(result.issues.some(i=>i.code==='IDENTITY_CONFLICT'));
});
test('a shared email gender row is not guessed for either student; a Student ID row is used',()=>{
  const t=table([row('shared@example.org','Example, Avery'),row('shared@example.org','Sample, Jordan','2026-10-02T12:00:00Z')]);
  let result=parser.prepare([t],projects,{genders:[{email:'shared@example.org',gender:'Group A'}]});
  assert.ok(result.students.every(s=>s.gender===null)); assert.equal(result.issues.filter(i=>i.code==='GENDER_SHARED_EMAIL').length,2);
  result=parser.prepare([t],projects,{genders:[{email:'shared@example.org:sample-jordan',gender:'Group B'}]});
  assert.equal(result.students.find(s=>s.name==='Sample, Jordan').gender,'group b'); assert.equal(result.students.find(s=>s.name==='Example, Avery').gender,null);
  result=parser.prepare([t],projects,{statusChanges:[{email:'shared@example.org:example-avery',status:'trip',why:'Confirmed trip list'}]});
  assert.equal(result.students.find(s=>s.name==='Example, Avery').status,'trip');
});
test('non-email trip labels never deduplicate people; green missing email stays review',()=>{
  const a=row('Trip label','Example, One',''), b=row('Trip label','Example, Two',''), c=row('','Example, Three','');
  const result=parser.prepare([table([a,b,c],11,{0:'#00ffff',1:'FF00FFFF',2:'#00ff00'})],projects);
  assert.equal(result.students.length,3); assert.equal(result.stats.byStatus.trip,2); assert.equal(result.stats.byStatus.review,1);
});
test('header matching handles reordered senior comments, choice blocks and leader text',()=>{
  const h=['Email Address','Timestamp','What is your Name? Please answer Last name, First name','Please choose the TYPE of Project you want','Would you prefer to do a MAJOR Project (2 weeks) or two MINOR Projects?','Please choose a UN Sustainable Development Goals','Would you like to be considered to serve as a student leader for Stories Matter?','Below are new Projects. Check ALL the Projects that you might be interested in joining.','Please share anything else you would like me to know','What Project(s) were you in last year?'];
  const values=[h,['reorder@example.org','2026-10-01','Example, Reorder','Heart - Do Something for Others','Minor','Good Health','YES, lead everyone','Robotics','App Building would be fun with a friend','None']];
  const result=parser.prepare([{name:'Senior',values}],projects).students[0];
  assert.equal(result.status,'eligible'); assert.equal(result.preference,'Minor'); assert.deepEqual(result.choices,['robotics']); assert.equal(result.comments,values[1][8]);
});
test('missing Sophomore prior question warns without blocking all students',()=>{
  const t=table([row()],10); t.values=t.values.map(r=>r.filter((_,i)=>i!==3)); t.backgrounds=t.backgrounds.map(r=>r.filter((_,i)=>i!==3));
  const result=parser.prepare([t],projects); assert.equal(result.students[0].status,'eligible'); assert.equal(result.students[0].previousKnown,false); assert.ok(result.issues.some(i=>i.code==='PREVIOUS_UNAVAILABLE'));
});
test('known prior aliases exclude current combined project; unknown substantive prior stays review',()=>{
  const a=row(); a[3]='Healthy Minds, Healthy Bodies';
  const b=row('unknown@example.org','Example, Unknown'); b[3]='A mystery workshop';
  const result=parser.prepare([table([a,b])],projects);
  assert.deepEqual(result.students.find(s=>s.email===a[1]).previous,['fueling-the-body-healthy-bodies']);
  assert.equal(result.students.find(s=>s.email===b[1]).status,'review');
});
test('retired prior titles recognized without guessing renamed equivalents',()=>{
  const previous=parser.parsePrevious('Criminal Justice, Robotics',projects);
  assert.deepEqual(previous.ids,['robotics']); assert.deepEqual(previous.retired,['Criminal Justice']); assert.equal(previous.known,true);
});
test('status overrides require reason and unambiguous identity, and cannot mask identity defects',()=>{
  const r=row(); const t=table([r]);
  let result=parser.prepare([t],projects,{statusChanges:[{email:r[1],status:'trip',why:''}]}); assert.equal(result.students[0].status,'eligible'); assert.ok(result.issues.some(i=>i.code==='INVALID_STATUS_CHANGE'));
  result=parser.prepare([t],projects,{statusChanges:[{email:r[1],status:'trip',why:'Confirmed trip list'}]}); assert.equal(result.students[0].status,'trip');
  result=parser.prepare([table([row('','Example, Missing')])],projects,{statusChanges:[{name:'Example, Missing',status:'eligible',why:'Try to force placement'}]}); assert.equal(result.students[0].status,'review');
});
test('gender only from supplied map; conflicting values remain unknown',()=>{
  const r=row(); assert.equal(parser.prepare([table([r])],projects).students[0].gender,null);
  const result=parser.prepare([table([r])],projects,{genders:[{email:r[1],gender:'Group A'},{email:r[1],gender:'Group B'}]});
  assert.equal(result.students[0].gender,null); assert.ok(result.issues.some(i=>i.code==='CONFLICTING_GENDER'));
});
test('status override cannot bypass an unresolved prior project or required preference',()=>{
  const a=row(); a[3]='Unrecognized historical project';
  const b=row('missing-pref@example.org','Example, Missing Preference'); b[6]='';
  const result=parser.prepare([table([a,b])],projects,{statusChanges:[{email:a[1],status:'eligible',why:'Move from review'},{email:b[1],status:'late',why:'Move from review'}]});
  assert.ok(result.students.every(s=>s.status==='review')); assert.equal(result.issues.filter(i=>i.code==='UNRESOLVED_RESPONSE').length,2);
});
test('explicit no-prior answers and supplied gender capitalization normalize consistently',()=>{
  const a=row(); a[3]='I did not participate in Project: Pomfret';
  const b=row('new@example.org','Example, New'); b[3]='I was not in a Project last year';
  const result=parser.prepare([table([a,b])],projects,{genders:[{email:a[1],gender:'Group A'},{email:a[1],gender:'group a'}]});
  assert.ok(result.students.every(s=>s.previousKnown && s.previous.length===0 && s.status==='eligible')); assert.equal(result.students.find(s=>s.email===a[1]).gender,'group a');
});
test('schema failures stop rather than quietly treating missing project choice columns as zero interest',()=>{
  const t=table([row()]); t.values[0][7]='Something unrecognized'; assert.throws(()=>parser.prepare([t],projects),/missing UN goals, Types or project checkbox/);
});
test('project parser applies Oct23 corrections and canonical fields without modifying source',()=>{
  const t={name:'Projects',values:[['Project','Length','Type #1','Type #2','UNSDG #1','UNSDG #2'],['Glass Fusing','Major','Hands','','Industry, Innovation, and Infrastructure',''],['Derelict Scultpure','Major','Hands','','Quality Education',''],['Happiness Project','Minor','Heart','','','']]};
  const before=JSON.stringify(t), result=parser.parseProjects(t);
  assert.equal(JSON.stringify(t),before); assert.equal(result.projects[0].length,'Either'); assert.equal(result.projects[1].enabled,false); assert.deepEqual(result.projects[0].goals,['9']); assert.deepEqual(result.projects[0].types,['hands']);
  assert.ok(result.issues.some(i=>i.code==='PROJECT_GOALS_MISSING'));
});
test('malformed dates and preferences enter review rather than fabricated eligibility',()=>{
  const r=row(); r[0]='not a date'; r[6]='unexpected';
  const result=parser.prepare([table([r])],projects).students[0]; assert.equal(result.status,'review');
});
test('goal vocabulary accepts recorded spelling variants and canonical numeric lists',()=>{
  assert.deepEqual(parser.canonicalGoals(['Good Health','Reduced Inequalties','3, 12','Gender Equality']),['3','10','12','5']);
});
