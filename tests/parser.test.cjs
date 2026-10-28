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
  let result=parser.prepare([t],projects,{genders:[{email:'shared@example.org',gender:'Girl'}]});
  assert.ok(result.students.every(s=>s.gender===null)); assert.equal(result.issues.filter(i=>i.code==='GENDER_SHARED_EMAIL').length,2);
  result=parser.prepare([t],projects,{genders:[{email:'shared@example.org:sample-jordan',gender:'BOY'}]});
  assert.equal(result.students.find(s=>s.name==='Sample, Jordan').gender,'Male'); assert.equal(result.students.find(s=>s.name==='Example, Avery').gender,null);
  result=parser.prepare([t],projects,{statusChanges:[{email:'shared@example.org:example-avery',status:'trip',why:'Confirmed trip list'}]});
  assert.equal(result.students.find(s=>s.name==='Example, Avery').status,'trip');
});
test('non-email trip labels never deduplicate people; an unmatched green row is late',()=>{
  const a=row('Trip label','Example, One',''), b=row('Trip label','Example, Two',''), c=row('','Example, Three','');
  const result=parser.prepare([table([a,b,c],11,{0:'#00ffff',1:'FF00FFFF',2:'#00ff00'})],projects);
  assert.equal(result.students.length,3); assert.equal(result.stats.byStatus.trip,2); assert.equal(result.stats.byStatus.late,1);
});
const typed=name=>['','',name,'','','','','',''];
test('hand-typed rows merge into the one form in their grade with a matching name',()=>{
  const result=parser.prepare([table([row('jo@example.org','Jo Smith'),row('nick@example.org','Nicholas Doe'),typed('Smith, Jo'),typed('Doe, Nick')])],projects);
  assert.deepEqual(result.students.map(s=>s.id).sort(),['jo@example.org','nick@example.org']); assert.equal(result.stats.mergedRows,2);
  assert.ok(result.students.every(s=>s.status==='eligible' && !s.issues.some(x=>/hand-typed/.test(x))));
  const merges=result.issues.filter(i=>i.code==='HAND_TYPED_MERGED');
  assert.deepEqual(merges.map(i=>i.studentId).sort(),['jo@example.org','nick@example.org']); assert.ok(merges.every(i=>i.severity==='info'));
  // Odd spacing and capitals still match.
  assert.equal(parser.prepare([table([row('jo@example.org','Jo Smith'),typed('  SMITH ,jo ')])],projects).students.length,1);
});
test('a hand-typed status color wins over the form it merges into',()=>{
  const trip=parser.prepare([table([row('jo@example.org','Jo Smith'),typed('Smith, Jo')],12,{1:'#00ffff'})],projects);
  assert.equal(trip.students.length,1); assert.equal(trip.students[0].status,'trip');
  const green=parser.prepare([table([row('jo@example.org','Jo Smith'),typed('Smith, Jo')],12,{1:'#00ff00'})],projects);
  assert.equal(green.students[0].status,'late'); assert.match(green.issues.find(i=>i.code==='HAND_TYPED_MERGED').message,/green color was used/);
  const plain=parser.prepare([table([row('jo@example.org','Jo Smith'),typed('Smith, Jo')],12,{0:'#ff9900'})],projects);
  assert.equal(plain.students[0].status,'leader');
});
test('a hand-typed row matching only one last name in its grade merges with a flag',()=>{
  const result=parser.prepare([table([row('chris@example.org','Lee, Chris'),row('jo@example.org','Jo Smith'),typed('Lee, Pat')],12),table([row('morgan@example.org','Lee, Morgan')],11)],projects);
  assert.equal(result.students.length,3); assert.equal(result.stats.mergedRows,1);
  assert.ok(result.students.find(s=>s.id==='chris@example.org').issues.includes('Matched a hand-typed row by last name only. Check it\'s the same student.'));
  assert.ok(result.issues.some(i=>i.code==='HAND_TYPED_LAST_NAME' && i.severity==='warning' && i.studentId==='chris@example.org'));
});
test('a trip or leader hand-typed row merges only by full name, never by last name alone',()=>{
  for (const [color,status] of [['#00ffff','trip'],['#ff9900','leader']]) {
    // One form shares the last name: Ana stays her own excluded row and Ben is still placed.
    const one=parser.prepare([table([row('ben@example.org','Rivera, Ben'),typed('Rivera, Ana')],12,{1:color})],projects);
    const ana=one.students.find(s=>s.name==='Rivera, Ana'), ben=one.students.find(s=>s.name==='Rivera, Ben');
    assert.equal(one.students.length,2); assert.equal(one.stats.mergedRows,0);
    assert.equal(ana.status,status); assert.equal(ben.status,'eligible'); assert.ok(!ben.issues.some(x=>/hand-typed/.test(x)));
    assert.ok(!one.issues.some(i=>i.code==='HAND_TYPED_LAST_NAME'));
    const run=engine.sort(one.students,projects,smallRun,{});
    assert.equal(run.assignments.find(a=>a.studentId===ben.id).status,'placed'); assert.equal(run.assignments.find(a=>a.studentId===ana.id).status,'excluded');
    // Two forms share the last name: Alex stays excluded instead of going to review.
    const two=parser.prepare([table([row('sam@example.org','Kim, Sam'),row('jordan@example.org','Jordan Kim'),typed('Kim, Alex')],12,{2:color})],projects);
    assert.equal(two.students.find(s=>s.name==='Kim, Alex').status,status);
    assert.equal(two.students.filter(s=>s.email && s.status==='eligible').length,2);
    assert.ok(!two.issues.some(i=>i.code==='HAND_TYPED_UNCLEAR'));
  }
  // A green row still merges by last name alone, with the flag.
  const green=parser.prepare([table([row('phil@example.org','Lee, Phil'),typed('Lee, Pat')],12,{1:'#00ff00'})],projects);
  assert.equal(green.students.length,1); assert.equal(green.students[0].status,'late');
  assert.ok(green.students[0].issues.includes('Matched a hand-typed row by last name only. Check it\'s the same student.'));
  assert.ok(green.issues.some(i=>i.code==='HAND_TYPED_LAST_NAME' && i.severity==='warning'));
});
test('unmatched hand-typed rows become late with a flag, while trip colors stay trips',()=>{
  const result=parser.prepare([table([row('jo@example.org','Jo Smith'),typed('Example, Quinn'),typed('Example, Blue')],12,{2:'#00ffff'})],projects);
  const quinn=result.students.find(s=>s.name==='Example, Quinn'), blue=result.students.find(s=>s.name==='Example, Blue');
  assert.equal(quinn.status,'late'); assert.deepEqual(quinn.issues,['No response: check.']);
  assert.equal(blue.status,'trip'); assert.deepEqual(blue.issues,[]);
  assert.ok(result.issues.some(i=>i.code==='NO_RESPONSE' && i.severity==='warning' && i.studentId===quinn.id));
  assert.ok(result.issues.some(i=>i.code==='NO_RESPONSE' && i.severity==='info' && i.studentId===blue.id));
  const run=engine.sort(result.students,projects,smallRun,{}), at=id=>run.assignments.find(a=>a.studentId===id);
  assert.equal(at(quinn.id).status,'placed'); assert.ok(at(quinn.id).flags.some(x=>/after everyone else/.test(x)));
  assert.equal(at(blue.id).status,'excluded');
});
test('a hand-typed row that could be more than one student goes to review',()=>{
  const result=parser.prepare([table([row('sam@example.org','Kim, Sam'),row('samuel@example.org','Samuel Kim'),typed('Kim, Sam'),typed('Kim, Pat')])],projects);
  assert.equal(result.students.length,4); assert.equal(result.stats.mergedRows,0);
  for (const name of ['Kim, Sam','Kim, Pat']) {
    const s=result.students.find(x=>!x.email && x.name===name);
    assert.equal(s.status,'review'); assert.deepEqual(s.issues,['More than one student matches this name.']);
  }
  assert.equal(result.students.filter(s=>s.email && s.status==='eligible').length,2);
  assert.equal(result.issues.filter(i=>i.code==='HAND_TYPED_UNCLEAR').length,2);
  // Two hand-typed rows that both match one form are not merged either.
  const twice=parser.prepare([table([row('jo@example.org','Jo Smith'),typed('Smith, Jo'),typed('Smith, Joanna')])],projects);
  assert.equal(twice.students.length,3); assert.equal(twice.students.filter(s=>s.status==='review').length,2);
});
test('header matching handles reordered senior comments, choice blocks and leader text',()=>{
  const h=['Email Address','Timestamp','What is your Name? Please answer Last name, First name','Please choose the TYPE of Project you want','Would you prefer to do a MAJOR Project (2 weeks) or two MINOR Projects?','Please choose a UN Sustainable Development Goals','Would you like to be considered to serve as a student leader for Stories Matter?','Below are new Projects. Check ALL the Projects that you might be interested in joining.','Please share anything else you would like me to know','What Project(s) were you in last year?'];
  const values=[h,['reorder@example.org','2026-10-01','Example, Reorder','Heart - Do Something for Others','Minor','Good Health','YES, lead everyone','Robotics','App Building would be fun with a friend','None']];
  const result=parser.prepare([{name:'Senior',values}],projects).students[0];
  assert.equal(result.status,'eligible'); assert.equal(result.preference,'Minor'); assert.deepEqual(result.choices,['robotics']); assert.equal(result.comments,values[1][8]);
});
test('missing Sophomore prior question is one PP Input check line, not a flag on every sophomore',()=>{
  const t=table([row(),row('second@example.org','Example, Second')],10); t.values=t.values.map(r=>r.filter((_,i)=>i!==3)); t.backgrounds=t.backgrounds.map(r=>r.filter((_,i)=>i!==3));
  const result=parser.prepare([t],projects);
  assert.ok(result.students.every(s=>s.status==='eligible' && s.previousKnown && !s.issues.some(x=>/last year|previous/i.test(x))));
  assert.equal(result.issues.filter(i=>i.code==='PREVIOUS_UNAVAILABLE').length,1);
  const run=engine.sort(result.students,projects,smallRun,{});
  assert.ok(run.assignments.every(a=>a.status==='placed' && !a.flags.some(x=>/past project/i.test(x))));
  assert.ok(!run.checks.some(c=>c.code==='PREVIOUS_UNAVAILABLE'));
});
test('known prior aliases exclude current combined project; an unreadable last-year answer keeps the student eligible with a flag',()=>{
  const a=row(); a[3]='Healthy Minds, Healthy Bodies';
  const b=row('unknown@example.org','Example, Unknown'); b[3]='A mystery workshop.';
  const result=parser.prepare([table([a,b])],projects), unknown=result.students.find(s=>s.email===b[1]);
  assert.deepEqual(result.students.find(s=>s.email===a[1]).previous,['fueling-the-body-healthy-bodies']);
  assert.equal(unknown.status,'eligible'); assert.deepEqual(unknown.previous,[]);
  assert.ok(unknown.issues.includes('Couldn\'t match last year\'s project: A mystery workshop.'));
  assert.equal(engine.sort([unknown],projects,smallRun,{}).assignments[0].status,'placed');
});
test('a readable part of last year\'s answer still blocks that project',()=>{
  const r=row('repeat@example.org','Example, Repeat'); r[3]='Robotics, A mystery workshop'; r[7]='Robotics, App Building';
  const student=parser.prepare([table([r])],projects).students[0];
  assert.equal(student.status,'eligible'); assert.deepEqual(student.previous,['robotics']);
  assert.ok(student.issues.includes('Couldn\'t match last year\'s project: Robotics, A mystery workshop.'));
  const run=engine.sort([student],projects,{...smallRun,projectCount:2},{});
  assert.equal(run.assignments[0].status,'placed'); assert.equal(run.assignments[0].project1,'stem-app-building');
  assert.ok(engine.check([student],[{...projects[0],finalLength:'Major'}],[{studentId:student.id,status:'placed',project1:'robotics',project2:null,fit1:1,fit2:null}],smallRun,{}).some(c=>c.code==='PREVIOUS_PROJECT'));
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
test('gender only from supplied map; conflicting values are kept, so the student counts as neither Male nor Female',()=>{
  const r=row(); assert.equal(parser.prepare([table([r])],projects).students[0].gender,null);
  const result=parser.prepare([table([r])],projects,{genders:[{email:r[1],gender:'F'},{email:r[1],gender:'M'}]});
  assert.equal(result.students[0].gender,'Female / Male'); assert.ok(result.issues.some(i=>i.code==='CONFLICTING_GENDER'));
  assert.equal(engine.check(result.students,[{...projects[0],finalLength:'Major'}],[{studentId:r[1],status:'placed',project1:'robotics',project2:null,fit1:1,fit2:null}],{},{}).filter(c=>c.code==='GENDER_BALANCE').length,0);
  assert.ok(!result.students[0].issues.concat(result.issues.map(i=>i.message)).some(m=>/unknown/i.test(m)));
});
test('status override cannot bypass a required preference, and an unread prior project needs no override',()=>{
  const a=row(); a[3]='Unrecognized historical project';
  const b=row('missing-pref@example.org','Example, Missing Preference'); b[6]='';
  const result=parser.prepare([table([a,b])],projects,{statusChanges:[{email:a[1],status:'eligible',why:'Move from review'},{email:b[1],status:'late',why:'Move from review'}]});
  assert.equal(result.students.find(s=>s.email===a[1]).status,'eligible'); assert.equal(result.students.find(s=>s.email===b[1]).status,'review');
  assert.equal(result.issues.filter(i=>i.code==='UNRESOLVED_RESPONSE').length,1);
});
test('explicit no-prior answers and supplied gender capitalization normalize consistently',()=>{
  const a=row(); a[3]='I did not participate in Project: Pomfret';
  const b=row('new@example.org','Example, New'); b[3]='I was not in a Project last year';
  const result=parser.prepare([table([a,b])],projects,{genders:[{email:a[1],gender:'Female'},{email:a[1],gender:' f '}]});
  assert.ok(result.students.every(s=>s.previousKnown && s.previous.length===0 && s.status==='eligible')); assert.equal(result.students.find(s=>s.email===a[1]).gender,'Female');
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
test('gender reads M, Male, Boy, F, Female and Girl in any case, keeps anything else as written, and a blank row is no gender on file',()=>{
  const rows=['M','male','BOY','f','Female','girl','Nonbinary',''].map((g,i)=>row('g'+i+'@example.org','Example, G'+i));
  const genders=['M','male','BOY','f','Female','girl','Nonbinary',''].map((g,i)=>({email:'g'+i+'@example.org',gender:g}));
  const result=parser.prepare([table(rows)],projects,{genders});
  assert.deepEqual(rows.map((r,i)=>result.students.find(s=>s.email==='g'+i+'@example.org').gender),['Male','Male','Male','Female','Female','Female','Nonbinary',null]);
  assert.deepEqual(result.issues.filter(i=>i.code==='GENDER_NOT_COUNTED').map(i=>i.message),['Of the students who can be placed, 1 has no gender on file and 1 is not listed as Male or Female. Neither is counted as Male or Female in the groups.']);
  assert.ok(!result.issues.some(i=>/unknown/i.test(i.message)));
});

test('Celebration of Learning is read into celebration, keeping only the part before " - "',()=>{
  const question='What do you want to do for your Celebration of Learning? Pick one.';
  const answers=['Project Fair - I want to show the robot we built','Presentation','Performance – a scene from our play','',' Gallery Walk '];
  const rows=answers.map((answer,i)=>[...row('c'+i+'@example.org','Celebration, Student'+i),answer]);
  const values=[[...headers,question],...rows],result=parser.prepare([{name:'Senior',grade:12,values,backgrounds:values.map(r=>r.map(()=>'#ffffff'))}],projects);
  assert.deepEqual(answers.map((_,i)=>result.students.find(s=>s.email==='c'+i+'@example.org').celebration),['Project Fair','Presentation','Performance','','Gallery Walk']);
  // A form without the question gives a blank.
  assert.equal(parser.prepare([table([row()])],projects).students[0].celebration,'');
});

test('a destination typed in the email column is kept for a trip row, also when it joins the student\'s form, and is a warning when the row isn\'t blue',()=>{
  const typed=(name,where)=>['',where,name,'','','','','',''];
  const result=parser.prepare([table([row('sam@example.org','Rivera, Sam'),typed('Rivera, Sam','COSTA RICA'),typed('Ortiz, Ana','TRINIDAD AND TOBAGO'),typed('Chen, Lee','JAPAN')],12,{1:'#00ffff',2:'#00ffff'})],projects);
  const sam=result.students.find(s=>s.email==='sam@example.org'),ana=result.students.find(s=>s.name==='Ortiz, Ana'),lee=result.students.find(s=>s.name==='Chen, Lee');
  assert.deepEqual([sam.status,sam.destination],['trip','Costa Rica']);
  assert.deepEqual([ana.status,ana.destination],['trip','Trinidad and Tobago']);
  assert.deepEqual([lee.status,lee.destination],['late','Japan']);
  const warnings=result.issues.filter(i=>i.code==='DESTINATION_NOT_TRIP');
  assert.deepEqual(warnings.map(i=>i.message),['"Chen, Lee" has "Japan" in the email column but isn\'t colored blue. Check whether this student is on an ExEd trip.']);
  assert.equal(warnings[0].severity,'warning');
  // An email, or a mistyped one with an @, is never a destination.
  assert.equal(parser.prepare([table([row('jo@example.org','Example, Jo'),typed('Smith, Al','al@pomfret')],12,{1:'#00ffff'})],projects).students.find(s=>s.name==='Smith, Al').destination,'');
});
