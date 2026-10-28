const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../core/engine.js');
const p = (id,length='Major',extra={}) => ({id,name:id,length,types:['hands'],goals:['3'],aliases:[],enabled:true,...extra});
// Two choices by default, so a student isn't placed last for checking only one project.
const s = (id,extra={}) => ({id,name:'Practice '+id,email:id+'@example.org',grade:11,preference:'Major',choices:['a','z'],types:['hands'],goals:['3'],previous:[],status:'eligible',gender:null,comments:'',source:{sheet:'Practice',row:1},issues:[],...extra});
const config = (extra={}) => ({...E.defaults,minSize:1,targetSize:2,maxSize:3,projectCount:2,minorProjects:0,minorMin:0,minorTarget:0,minorMax:0,...extra});
const errors = result => result.checks.filter(c=>c.severity==='error');

test('fit tiers follow the documented preference order and never read comments',()=>{
  const project=p('a');
  assert.equal(E.fit(s('1'),project).tier,1);
  assert.equal(E.fit(s('1',{goals:[]}),project).tier,2);
  assert.equal(E.fit(s('1',{types:[]}),project).tier,3);
  assert.equal(E.fit(s('1',{types:[],goals:[]}),project).tier,4);
  assert.equal(E.fit(s('1',{choices:[]}),project).tier,5);
  assert.equal(E.fit(s('1',{choices:[],types:[]}),project).tier,6);
  assert.equal(E.fit(s('1',{choices:[]}),project,{checkedBeforeInferred:false}).tier,4);
});

test('interest deduplicates a combined project and excludes trips and freshman leaders',()=>{
  const r=E.interest([s('1',{choices:['a','a'],grade:12}),s('2',{status:'late',grade:10}),s('3',{status:'trip'}),s('4',{status:'leader'})],[p('a')]);
  assert.deepEqual(r[0],{projectId:'a',name:'a',checked:2,aligned:2,byGrade:{10:1,11:0,12:1}});
});

test('same input is identical and comments cannot alter groups',()=>{
  const students=Array.from({length:6},(_,i)=>s('s'+i,{choices:[i%2?'a':'b']})), projects=[p('a'),p('b')],cfg=config();
  const r=E.sort(students,projects,cfg,{});
  assert.deepEqual(r,E.sort(students,projects,cfg,{}));
  assert.deepEqual(r.assignments,E.sort(students.map(x=>({...x,comments:'Put me with my friend!'})),projects,cfg,{}).assignments);
  assert.equal(r.fingerprint,E.sort(students.slice().reverse(),projects,cfg,{}).fingerprint);
  assert.equal(r.fingerprint,E.sort(students.map(x=>({...x,comments:'No decision input here.'})),projects,cfg,{}).fingerprint);
  assert.equal(r.summary.placed,6);assert.deepEqual(errors(r),[]);
});

test('scarce preferred seats favor seniors, while green seniors go last',()=>{
  const students=[s('senior',{grade:12}),s('junior',{grade:11}),s('green',{grade:12,status:'late'}),s('soph',{grade:10})];
  const cfg=config({maxSize:2,targetSize:2});
  const r=E.sort(students,[p('a'),p('b')],cfg,{});
  // Both projects share metadata, so the scarce checked seats are allocated by grade.
  const at=id=>r.assignments.find(a=>a.studentId===id);
  assert.equal(at('senior').project1,'a');assert.equal(at('junior').project1,'a');assert.equal(at('green').project1,'b');
});

test('Minor flow gives two distinct projects with balanced week capacities',()=>{
  const students=Array.from({length:88},(_,i)=>s('s'+i,{preference:'Minor',grade:10+i%3,choices:['m'+(i%8),'m'+((i+1)%8)]}));
  const projects=Array.from({length:8},(_,i)=>p('m'+i,'Minor'));
  const r=E.sort(students,projects,{...E.defaults,projectCount:8,minorProjects:8},{});
  assert.equal(r.summary.placed,88);assert.equal(r.summary.minorStudents,88);assert.deepEqual(errors(r),[]);
  for(const a of r.assignments)assert.notEqual(a.project1,a.project2);
  for(const project of projects){assert.equal(r.assignments.filter(a=>a.project1===project.id).length,11);assert.equal(r.assignments.filter(a=>a.project2===project.id).length,11);}
});

test('previous project is forbidden unless named as a project leader',()=>{
  const cfg=config({projectCount:1,maxSize:3}),projects=[p('a')],student=s('repeat',{previous:['a']});
  const no=E.sort([student],projects,cfg,{a:{mustRun:true}});assert.equal(no.assignments[0].status,'review');
  const yes=E.sort([student],projects,cfg,{a:{mustRun:true,leaders:['repeat']}});assert.equal(yes.assignments[0].status,'placed');assert.deepEqual(errors(yes),[]);
  const fresh=E.sort([s('leader',{status:'leader'})],projects,cfg,{a:{mustRun:true,leaders:['leader']}});assert.equal(fresh.assignments[0].status,'excluded');
});

test('cohort uses Minor, then Not sure, then Major sophomores with flags',()=>{
  const projects=[p('a','Major'),p('m1','Minor'),p('m2','Minor')],cfg=config({projectCount:3,minorProjects:2,minorMin:3,minorTarget:3,minorMax:3});
  const students=[s('minor',{grade:12,preference:'Minor'}),s('unsure',{grade:12,preference:'Not sure'}),s('soph',{grade:10}),s('junior',{grade:11}),s('senior',{grade:12})];
  const r=E.sort(students,projects,cfg,{}),at=id=>r.assignments.find(a=>a.studentId===id);
  assert.equal(r.summary.minorStudents,3);assert.ok(at('soph').project2);assert.ok(at('soph').flags.some(x=>/asked for a Major.*received Minors/.test(x)));assert.equal(at('senior').project2,null);
  const disabled=E.sort(students,projects,{...cfg,allowMajorToMinor:false},{});assert.equal(disabled.summary.minorStudents,2);
});

test('incomplete Minor demand never appears as a one-week placement',()=>{
  const students=[s('blocked',{preference:'Minor',previous:['m2']})],projects=[p('m1','Minor'),p('m2','Minor')],cfg=config({minorProjects:2,minorMin:1,minorTarget:1,minorMax:1});
  const r=E.sort(students,projects,cfg,{m1:{mustRun:true},m2:{mustRun:true}});
  assert.equal(r.assignments[0].status,'review');assert.equal(r.assignments[0].project1,null);assert.equal(r.assignments[0].project2,null);
});

test('undersized unrequired project is cut and students reallocated',()=>{
  const students=[s('s1'),s('s2'),s('s3')],projects=[p('a'),p('b')],cfg=config({minSize:2,targetSize:2,maxSize:3});
  const r=E.sort(students,projects,cfg,{});assert.equal(r.projects.length,1);assert.equal(r.summary.placed,3);assert.ok(r.issues.some(c=>c.code==='PROJECT_CUT'));assert.deepEqual(errors(r),[]);
});

test('mandatory teacher conflict blocks placements visibly',()=>{
  const r=E.sort([s('1'),s('2')],[p('a'),p('b')],config(),{a:{mustRun:true,cannotRunWith:['b']},b:{mustRun:true}});
  assert.equal(r.summary.placed,0);assert.ok(r.issues.some(c=>c.code==='MANDATORY_CONFLICT'&&c.severity==='error'));
});

test('invalid settings and duplicate IDs fail before sorting',()=>{
  assert.throws(()=>E.sort([s('1')],[p('a')],config({maxSize:15}),{}),/maximum/);
  assert.throws(()=>E.sort([s('1'),s('1')],[p('a')],config(),{}),/own ID/);
  assert.throws(()=>E.sort([s('1')],[p('a')],config({allowMajorToMinor:'true'}),{}),/TRUE or FALSE/);
});

test('independent checker catches altered identities, repeats, fits and exclusions',()=>{
  const projects=[{...p('a'),finalLength:'Major'},{...p('b'),finalLength:'Major'}],students=[s('1',{previous:['a']}),s('2',{status:'trip'}),s('3')];
  const rows=[{studentId:'1',project1:'a',project2:null,fit1:6,status:'placed'},{studentId:'1',project1:'b',project2:null,fit1:5,status:'placed'},{studentId:'2',project1:'a',project2:null,fit1:1,status:'placed'},{studentId:'unknown',status:'review'}];
  const codes=E.check(students,projects,rows,config(),{}).map(x=>x.code);
  for(const code of ['PREVIOUS_PROJECT','STALE_FIT','DUPLICATE_ASSIGNMENT','INELIGIBLE_PLACED','MISSING_STUDENT','UNKNOWN_STUDENT','NO_GENDER_DATA'])assert.ok(codes.includes(code),code);
});

test('checker treats each Minor week separately and warns on partial gender data',()=>{
  const projects=[{...p('m1','Minor'),finalLength:'Minor'},{...p('m2','Minor'),finalLength:'Minor'}],students=[s('1',{gender:'F'}),s('2',{gender:null}),s('3',{gender:'M'})];
  const rows=students.map(x=>({studentId:x.id,status:'placed',project1:'m1',project2:'m2',fit1:5,fit2:5}));
  const checks=E.check(students,projects,rows,config({maxSize:2,targetSize:2,minorProjects:2,minorMin:3,minorTarget:3,minorMax:3}),{});
  assert.equal(checks.filter(x=>x.code==='OVER_CAPACITY').length,2);assert.ok(checks.some(x=>x.code==='GENDER_UNCHECKED'));assert.ok(checks.some(x=>x.code==='UNDER_MINIMUM'));
});

test('240-student synthetic run is complete, bounded and reproducible',()=>{
  const projects=Array.from({length:23},(_,i)=>p('p'+i,i<8?'Minor':'Major',{types:[['hands','head','heart','feet'][i%4]],goals:[String(i%5+1)]}));
  const students=Array.from({length:240},(_,i)=>s('demo'+String(i).padStart(3,'0'),{grade:10+i%3,preference:i<88?'Not sure':'Major',choices:[projects[i%23].id,projects[(i+7)%23].id,projects[(i+14)%23].id],types:[['hands','head','heart','feet'][i%4]],goals:[String(i%5+1)]}));
  const start=Date.now(),r=E.sort(students,projects,{},{});
  assert.equal(r.summary.placed,240);assert.equal(r.summary.minorStudents,88);assert.equal(r.summary.projectCount,23);assert.deepEqual(errors(r),[]);assert.equal(r.fingerprint,E.sort(students,projects,{},{}).fingerprint);assert.ok(Date.now()-start<15000);
});

test('explain gives the fit, reason and flags the sort wrote, and a move by hand drops the Minor minimum note',()=>{
  const projects=[p('a','Major'),p('m1','Minor'),p('m2','Minor')],cfg=config({projectCount:3,minorProjects:2,minorMin:3,minorTarget:3,minorMax:3});
  const students=[s('minor',{grade:12,preference:'Minor'}),s('unsure',{grade:12,preference:'Not sure'}),s('soph',{grade:10}),s('junior',{grade:11}),s('senior',{grade:12,status:'late'})];
  const r=E.sort(students,projects,cfg,{});
  for(const a of r.assignments){
    const e=E.explain(students.find(x=>x.id===a.studentId),[a.project1,a.project2].filter(Boolean),r.projects,cfg,{},false);
    assert.deepEqual({fit1:e.fit1,fit2:e.fit2,reason:e.reason,flags:e.flags},{fit1:a.fit1,fit2:a.fit2,reason:a.reason,flags:a.flags});
  }
  const soph=r.assignments.find(a=>a.studentId==='soph');
  assert.ok(soph.flags.some(x=>/asked for a Major/.test(x)));
  assert.ok(!E.explain(students[2],[soph.project1,soph.project2],r.projects,cfg,{},true).flags.some(x=>/asked for a Major/.test(x)));
});

test('the checker reports a Major-and-Minor pair as an error and a track change by hand as information',()=>{
  const projects=[{...p('a'),finalLength:'Major'},{...p('m1','Minor'),finalLength:'Minor'},{...p('m2','Minor'),finalLength:'Minor'}],students=[s('1',{preference:'Minor'}),s('2',{preference:'Major'})];
  const cfg=config({projectCount:3,minorProjects:2,minorMin:0,minorTarget:0,minorMax:3});
  let checks=E.check(students,projects,[{studentId:'1',status:'placed',project1:'a',project2:'m1',fit1:1,fit2:1},{studentId:'2',status:'placed',project1:'a',project2:null,fit1:1,fit2:null}],cfg,{});
  assert.ok(checks.some(c=>c.code==='MIXED_TRACKS'&&c.severity==='error'&&c.studentId==='1'));
  assert.ok(!checks.some(c=>c.code==='MAJOR_SECOND_PROJECT'));
  const moved=[{studentId:'1',status:'placed',project1:'a',project2:null,fit1:1,fit2:null,movedByHand:true},{studentId:'2',status:'placed',project1:'m1',project2:'m2',fit1:1,fit2:1,movedByHand:true}];
  checks=E.check(students,projects,moved,{...cfg,allowMajorToMinor:false},{});
  assert.equal(checks.find(c=>c.code==='MINOR_PREFERENCE_CHANGED').severity,'info');
  assert.equal(checks.find(c=>c.code==='MAJOR_TO_MINOR').severity,'info');
  checks=E.check(students,projects,moved.map(a=>({...a,movedByHand:undefined})),{...cfg,allowMajorToMinor:false},{});
  assert.equal(checks.find(c=>c.code==='MAJOR_TO_MINOR').severity,'error');
});

// Four running Minors and one Major. Three Minor-preference students leave one Minor spot for a Not-sure student.
const minorRun=()=>({projects:[p('a'),p('m1','Minor'),p('m2','Minor'),p('m3','Minor'),p('m4','Minor')],cfg:config({projectCount:5,minorProjects:4,minorMin:4,minorTarget:4,minorMax:4}),
  fixed:[s('pref1',{preference:'Minor',choices:['m1','m2']}),s('pref2',{preference:'Minor',choices:['m3','m4']}),s('pref3',{preference:'Minor',choices:['a']}),s('major1',{grade:12}),s('major2',{grade:12})]});
test('a Not-sure student who checked more running Minors goes to Minors first, whatever the grades',()=>{
  const {projects,cfg,fixed}=minorRun();
  for(const [fourGrade,oneGrade] of [[10,12],[12,10]]){
    const r=E.sort([...fixed,s('four',{grade:fourGrade,preference:'Not sure',choices:['m1','m2','m3','m4']}),s('one',{grade:oneGrade,preference:'Not sure',choices:['m1','a']})],projects,cfg,{}),at=id=>r.assignments.find(a=>a.studentId===id);
    assert.ok(at('four').project2); assert.equal(at('one').project2,null); assert.equal(at('one').status,'placed');
    assert.equal(r.summary.minorStudents,4); assert.equal(errors(r).length,0);
  }
});
test('Not-sure students who checked the same number of running Minors go sophomores first, then juniors, then seniors',()=>{
  const {projects,cfg,fixed}=minorRun(),unsure=grade=>s('g'+grade,{grade,preference:'Not sure',choices:['m1','m2']});
  let r=E.sort([...fixed,unsure(12),unsure(10)],projects,cfg,{}),at=id=>r.assignments.find(a=>a.studentId===id);
  assert.ok(at('g10').project2); assert.equal(at('g12').project2,null);
  r=E.sort([...fixed,unsure(12),unsure(11)],projects,cfg,{});
  assert.ok(at('g11').project2); assert.equal(at('g12').project2,null);
});
test('Minor-preference students are always in Minors, whatever they checked',()=>{
  const {projects,cfg,fixed}=minorRun();
  const r=E.sort([...fixed,s('pref4',{preference:'Minor',choices:[]}),s('four',{preference:'Not sure',choices:['m1','m2','m3','m4']})],projects,cfg,{});
  for(const id of ['pref1','pref2','pref3','pref4'])assert.ok(r.assignments.find(a=>a.studentId===id).project2,id);
  assert.equal(r.assignments.find(a=>a.studentId==='four').project2,null);
});
test('Major-preference students move to Minors only up to the Minor minimum, and each move is flagged',()=>{
  const projects=[p('a'),p('m1','Minor'),p('m2','Minor')],cfg=config({projectCount:3,minorProjects:2,minorMin:2,minorTarget:3,minorMax:3});
  const r=E.sort([s('pref',{preference:'Minor'}),s('soph',{grade:10}),s('junior',{grade:11}),s('senior',{grade:12})],projects,cfg,{}),at=id=>r.assignments.find(a=>a.studentId===id);
  assert.equal(r.summary.minorStudents,2); assert.ok(at('soph').project2);
  assert.ok(at('soph').flags.includes('This student asked for a Major but received Minors to reach the Minor student minimum.'));
  assert.equal(at('junior').project2,null); assert.equal(at('senior').project2,null);
});

test('students who tie are ordered by a fixed shuffle of their ID and tieSeed, never by name or alphabet',()=>{
  // Two seniors with the same answers want the one seat in a, and b suits neither of them: a tie.
  const projects=[p('a'),p('b','Major',{types:['feet'],goals:['1']})],cfg=config({maxSize:1,targetSize:1,tieSeed:2026});
  const pair=(nameC,nameD)=>[s('casey@example.org',{email:'casey@example.org',grade:12,choices:['a','c'],name:nameC}),s('drew@example.org',{email:'drew@example.org',grade:12,choices:['a','c'],name:nameD})];
  const winner=(students,seed=2026)=>E.sort(students,projects,{...cfg,tieSeed:seed},{}).assignments.find(a=>a.project1==='a').studentId;
  // Seed 2026 favors the alphabetically later ID, and renaming the students changes nothing.
  assert.equal(winner(pair('Casey Practice','Drew Practice')),'drew@example.org');
  assert.equal(winner(pair('Zed Practice','Aaron Practice')),'drew@example.org');
  // A different seed can change who wins.
  assert.equal(winner(pair('Casey Practice','Drew Practice'),7),'casey@example.org');
  // The same seed always gives the same groups.
  const students=pair('Casey Practice','Drew Practice');
  assert.deepEqual(E.sort(students,projects,cfg,{}),E.sort(students,projects,cfg,{}));
});

test('a student who checked one project or none is placed after everyone else, unless they lead a running project',()=>{
  // a has one seat; b suits nobody.
  const projects=[p('a'),p('b','Major',{types:['feet'],goals:['1']})],cfg=config({maxSize:1,targetSize:1});
  const senior=s('senior',{grade:12,choices:['a']}),soph=s('soph',{grade:10,choices:['a','c','d','e','f']});
  let r=E.sort([senior,soph],projects,cfg,{});const at=id=>r.assignments.find(a=>a.studentId===id);
  assert.equal(at('soph').project1,'a'); assert.equal(at('senior').project1,'b');
  assert.ok(at('senior').flags.includes('Checked only one project, so placed after everyone else.'));
  assert.ok(!at('soph').flags.some(x=>/after everyone else/.test(x)));
  // A listed leader of a is placed there, even though they checked only a.
  r=E.sort([senior,soph],projects,cfg,{a:{leaders:['senior']}});
  assert.equal(at('senior').project1,'a'); assert.ok(!at('senior').flags.some(x=>/after everyone else/.test(x)));
  // No projects checked gets its own flag.
  r=E.sort([s('none',{grade:12,choices:[]})],[p('a')],config({projectCount:1}),{});
  assert.ok(at('none').flags.includes('Checked no projects, so placed after everyone else.'));
});

// Two Majors and two Minors, with two students taking Minors. The three seniors all want a; b suits nobody.
const leaderRun=()=>({projects:[p('a'),p('b','Major',{types:['feet'],goals:['1']}),p('m1','Minor'),p('m2','Minor')],cfg:config({projectCount:4,minorProjects:2,minorMin:2,minorTarget:2,minorMax:2}),
  others:[s('x',{preference:'Minor',choices:['m1','m2']}),s('y',{preference:'Minor',choices:['m1','m2']}),s('j1',{grade:12}),s('j2',{grade:12}),s('j3',{grade:12})]});
test('the leader of a Major who asked for Minors is placed in that Major for both weeks',()=>{
  const {projects,cfg,others}=leaderRun();
  const r=E.sort([s('lead',{grade:10,preference:'Minor',choices:['m1','m2']}),...others],projects,cfg,{a:{leaders:['lead']}}),at=id=>r.assignments.find(a=>a.studentId===id);
  assert.equal(at('lead').project1,'a'); assert.equal(at('lead').project2,null);
  assert.equal(at('lead').flags[0],'Leading a, so placed there.');
  assert.ok(at('x').project2 && at('y').project2); assert.equal(errors(r).length,0);
  // Leaders count toward the group size: the four Major students split two and two, so only one of
  // the seniors who wanted a joins the leader there.
  assert.equal(r.assignments.filter(x=>x.project1==='a').length,2);
  assert.equal(['j1','j2','j3'].filter(id=>at(id).project1==='a').length,1);
});
test('a Minor leader is in the Minor they lead one week and a different Minor the other week',()=>{
  const {projects,cfg,others}=leaderRun();
  const r=E.sort([s('lead',{grade:12,preference:'Major'}),...others],projects,{...cfg,minorMin:3,minorTarget:3,minorMax:3},{m2:{leaders:['lead']}}),lead=r.assignments.find(a=>a.studentId==='lead');
  assert.deepEqual([lead.project1,lead.project2].sort(),['m1','m2']);
  assert.ok(lead.flags.includes('Leading m2, so placed there.')); assert.ok(!lead.flags.some(x=>/asked for a Major/.test(x)));
});
test('a leader who did the project last year is allowed to lead it again',()=>{
  const {projects,cfg,others}=leaderRun();
  const r=E.sort([s('lead',{grade:11,previous:['a']}),...others],projects,cfg,{a:{leaders:['lead']}}),lead=r.assignments.find(a=>a.studentId==='lead');
  assert.equal(lead.project1,'a'); assert.ok(lead.flags.includes('Previous-project exception: named leader of a.'));
  assert.ok(!r.checks.some(c=>c.code==='PREVIOUS_PROJECT'));
});
test('a leader of a project that is not running gets an error naming them and is placed by the normal rules',()=>{
  const {projects,cfg,others}=leaderRun(),all=[...projects,p('c')];
  const r=E.sort([s('lead',{grade:12,name:'Example Leader'}),...others],all,cfg,{c:{run:false,leaders:['lead']}}),lead=r.assignments.find(a=>a.studentId==='lead');
  const problem=r.issues.find(i=>i.code==='LEADER_NOT_PLACED');
  assert.equal(problem.severity,'error'); assert.equal(problem.studentId,'lead'); assert.match(problem.message,/^Example Leader is listed as a leader of c, which isn't running/);
  assert.equal(lead.status,'placed'); assert.ok(['a','b'].includes(lead.project1)); assert.ok(!lead.flags.some(x=>/^Leading/.test(x)));
  // Listed for two projects, or on a trip: an error, and no leader placement.
  const two=E.sort([s('lead',{grade:12})],projects,cfg,{a:{leaders:['lead']},b:{leaders:['lead']}});
  assert.match(two.issues.find(i=>i.code==='LEADER_NOT_PLACED').message,/leader of a and b\. A student can lead only one project/);
  const trip=E.sort([s('lead',{grade:12,status:'trip'}),...others],projects,cfg,{a:{leaders:['lead']}});
  assert.match(trip.issues.find(i=>i.code==='LEADER_NOT_PLACED').message,/on an ExEd trip, so they were not placed there\./);
  assert.equal(trip.assignments.find(a=>a.studentId==='lead').status,'excluded');
});
