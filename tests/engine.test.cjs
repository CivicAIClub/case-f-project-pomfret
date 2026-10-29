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
  assert.equal(checks.filter(x=>x.code==='OVER_CAPACITY').length,2);assert.ok(checks.some(x=>x.code==='UNDER_MINIMUM'));
  // Each week is still checked using the students listed as Male or Female, and says how many aren't.
  // All three are in m1 in week 1 and m2 in week 2; the two empty groups have nothing to report.
  assert.deepEqual(checks.filter(x=>x.code==='GENDER_BALANCE').map(x=>x.message),['m1, week 1: 1 Male and 1 Female students (1 with no gender on file). Gender balancing is turned off in Settings.','m2, week 2: 1 Male and 1 Female students (1 with no gender on file). Gender balancing is turned off in Settings.']);
});

test('240-student synthetic run is complete, bounded and reproducible',()=>{
  const projects=Array.from({length:23},(_,i)=>p('p'+i,i<8?'Minor':'Major',{types:[['hands','head','heart','feet'][i%4]],goals:[String(i%5+1)]}));
  const students=Array.from({length:240},(_,i)=>s('demo'+String(i).padStart(3,'0'),{grade:10+i%3,preference:i<88?'Not sure':'Major',choices:[projects[i%23].id,projects[(i+7)%23].id,projects[(i+14)%23].id],types:[['hands','head','heart','feet'][i%4]],goals:[String(i%5+1)]}));
  // Only eight of the Not-sure students lean Minor, so the Minor count stops at the minimum.
  const start=Date.now(),r=E.sort(students,projects,{},{});
  assert.equal(r.summary.placed,240);assert.equal(r.summary.minorStudents,80);assert.equal(r.summary.projectCount,23);assert.deepEqual(errors(r),[]);assert.equal(r.fingerprint,E.sort(students,projects,{},{}).fingerprint);assert.ok(Date.now()-start<15000);
});

test('explain gives the fit, reason and flags the sort wrote, and a move by hand drops the Minor minimum note',()=>{
  const projects=[p('a','Major'),p('m1','Minor'),p('m2','Minor')],cfg=config({projectCount:3,minorProjects:2,minorMin:3,minorTarget:3,minorMax:3});
  const students=[s('minor',{grade:12,preference:'Minor'}),s('unsure',{grade:12,preference:'Not sure'}),s('soph',{grade:10}),s('junior',{grade:11}),s('senior',{grade:12,status:'late'})];
  const r=E.sort(students,projects,cfg,{});
  // The sort also flags a student whose Major or Minor answer and checks disagree, like minor, who
  // asked for Minors but checked only a Major.
  const answerFlag=f=>/^Said (Major|Minor) but /.test(f);
  assert.deepEqual(r.assignments.find(a=>a.studentId==='minor').flags.filter(answerFlag),['Said Minor but checked fewer than two running Minors.']);
  // The sort also says why a student is in a project they didn't check. The students in Minors
  // checked only the Major a, so each week says so.
  const missed='Their other picks run as Majors.';
  for(const a of r.assignments){
    const e=E.explain(students.find(x=>x.id===a.studentId),[a.project1,a.project2].filter(Boolean),r.projects,cfg,{},false);
    assert.equal(a.reason.split(missed).length-1,a.project2?2:0,a.studentId);
    assert.deepEqual({fit1:e.fit1,fit2:e.fit2,reason:e.reason,flags:e.flags},{fit1:a.fit1,fit2:a.fit2,reason:a.reason.split(' '+missed).join(''),flags:a.flags.filter(f=>!answerFlag(f))});
    if(a.project2)assert.equal(a.reason,E.explain(students.find(x=>x.id===a.studentId),[a.project1,a.project2],r.projects,cfg,{},false,false,[missed,missed]).reason);
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

// Five Majors and three Minors, each holding up to three and all set to run. Three Minor-preference
// students make the scaled minimum of three, and one Major-preference student fills each Major.
const leanRun=(extra={})=>({projects:[...['a','b','c','d','e'].map(id=>p(id)),p('m1','Minor'),p('m2','Minor'),p('m3','Minor')],
  cfg:config({projectCount:8,minorProjects:3,minorMin:3,minorTarget:5,minorMax:6,...extra}),
  fixed:[s('pref1',{preference:'Minor',choices:['m1','m2']}),s('pref2',{preference:'Minor',choices:['m2','m3']}),s('pref3',{preference:'Minor',choices:['m1','m3']}),...['a','b','c','d','e'].map(id=>s('fill-'+id,{choices:[id,'z']}))],
  choices:Object.fromEntries(['a','b','c','d','e','m1','m2','m3'].map(id=>[id,{mustRun:true}]))});
const track=(r,id)=>{const a=r.assignments.find(x=>x.studentId===id);return a.status!=='placed'?a.status:a.project2?'Minor':'Major';};
const unsure=(id,choices,extra={})=>s(id,{preference:'Not sure',choices,...extra});
test('a Not-sure student who checked 1 Minor and 3 Majors does a Major while the Minor count is at or above the minimum, even below the target',()=>{
  const {projects,cfg,fixed,choices}=leanRun(),x=unsure('x',['m1','a','b','c']);
  // At the minimum of three, two below the target of five.
  let r=E.sort([...fixed,x],projects,cfg,choices);
  assert.equal(track(r,'x'),'Major'); assert.equal(r.summary.minorStudents,3);
  // Above the minimum, one below the target.
  r=E.sort([...fixed,s('pref4',{preference:'Minor',choices:['m2','m3']}),x],projects,cfg,choices);
  assert.equal(track(r,'x'),'Major'); assert.equal(r.summary.minorStudents,4);
  assert.deepEqual(errors(r),[]);
});
test('a Not-sure student who checked 3 Minors and 1 Major does Minors, even with the target already met',()=>{
  const {projects,cfg,fixed,choices}=leanRun({minorTarget:3}),r=E.sort([...fixed,unsure('x',['m1','m2','m3','a'])],projects,cfg,choices);
  assert.equal(track(r,'x'),'Minor'); assert.equal(r.summary.minorStudents,4);
  assert.deepEqual(errors(r),[]);
});
test('a Not-sure student who checked 2 Minors and 5 Majors does a Major when the minimum is met, and goes before one who checked 1 Minor and 1 Major when one more is needed',()=>{
  const {projects,cfg,fixed,choices}=leanRun(),many=unsure('many',['m1','m2','a','b','c','d','e'],{grade:12}),few=unsure('few',['m1','a'],{grade:10});
  let r=E.sort([...fixed,many],projects,cfg,choices);
  assert.equal(track(r,'many'),'Major'); assert.equal(r.summary.minorStudents,3);
  // A minimum of four needs one more Minor student. In two Minors the senior has no placement they
  // didn't check and the sophomore has one, so the senior goes first, even though the sophomore is
  // younger and checked more Minors than Majors.
  r=E.sort([...fixed,many,few],projects,{...cfg,minorMin:4},choices);
  assert.equal(track(r,'many'),'Minor'); assert.equal(track(r,'few'),'Major'); assert.equal(r.summary.minorStudents,4);
});
test('last year\'s project doesn\'t count as checked when choosing which Not-sure students do Minors',()=>{
  const {projects,cfg,fixed,choices}=leanRun({minorTarget:3});
  assert.equal(track(E.sort([...fixed,unsure('x',['m1','m2','a'])],projects,cfg,choices),'x'),'Minor');
  // With m2 last year, x checked one Minor and one Major, so x doesn't lean Minor.
  assert.equal(track(E.sort([...fixed,unsure('x',['m1','m2','a'],{previous:['m2']})],projects,cfg,choices),'x'),'Major');
});
test('the Minor count never goes above the maximum, and never below the minimum when there are enough students',()=>{
  const {projects,cfg,fixed,choices}=leanRun();
  // Six Not-sure students lean Minor, but the maximum of six leaves room for three: the sophomores.
  const leaners=[10,10,10,12,12,12].map((grade,i)=>unsure('lean'+i,['m1','m2','m3'],{grade}));
  let r=E.sort([...fixed,...leaners],projects,cfg,choices);
  assert.equal(r.summary.minorStudents,6);
  assert.deepEqual(leaners.map(x=>track(r,x.id)),['Minor','Minor','Minor','Major','Major','Major']);
  // Nobody leans Minor and the minimum is five: two Not-sure students reach it, before any
  // Major-preference student moves.
  r=E.sort([...fixed,...[0,1,2].map(i=>unsure('even'+i,['m1','a']))],projects,{...cfg,minorMin:5,minorTarget:5},choices);
  assert.equal(r.summary.minorStudents,5);
  assert.ok(!r.assignments.some(a=>a.flags.some(f=>/asked for a Major/.test(f))));
  // A larger invented roster, with the bounds set by minorMin and minorMax.
  let seed=7;const rand=n=>(seed=seed*48271%2147483647)%n,pool=['a','b','c','d','m1','m2','m3'];
  const big=[p('a'),p('b'),p('c'),p('d'),p('m1','Minor'),p('m2','Minor'),p('m3','Minor')],bounds=config({minSize:1,targetSize:10,maxSize:14,projectCount:7,minorProjects:3,minorMin:15,minorTarget:20,minorMax:25});
  for(let round=0;round<10;round++){
    const roster=Array.from({length:60},(_,i)=>{const picks=[];while(picks.length<3){const c=pool[rand(7)];if(!picks.includes(c))picks.push(c);}return s('r'+i,{grade:10+rand(3),preference:['Major','Major','Not sure','Not sure','Minor'][rand(5)],choices:picks});});
    const n=E.sort(roster,big,bounds,{}).summary.minorStudents,prefs=roster.filter(x=>x.preference==='Minor').length;
    assert.ok(n>=15&&n<=Math.max(25,prefs),'round '+round+': '+n+' Minor students');
  }
});
test('Minor-preference students, leaders and locked students are placed as before the Not-sure rule changed',()=>{
  const {projects,cfg,fixed,choices}=leanRun({minorTarget:3});
  const people=[...fixed,s('pref4',{preference:'Minor',choices:['a','b']}),s('leadMinor',{grade:12,choices:['a','z']}),s('leadMajor',{preference:'Minor',choices:['m1','m2']}),
    unsure('lockMajor',['m1','m2','m3']),s('lockMinor',{choices:['a','z']}),...[0,1,2].map(i=>unsure('lean'+i,['m1','m2','m3'],{grade:10}))];
  const locks=[{email:'lockMajor@example.org',name:'',project1:'b',project2:'',row:2},{email:'lockMinor@example.org',name:'',project1:'m2',project2:'m3',row:3}];
  const r=E.sort(people,projects,cfg,{...choices,m1:{mustRun:true,leaders:['leadMinor']},a:{mustRun:true,leaders:['leadMajor']}},{locks}),at=id=>r.assignments.find(a=>a.studentId===id);
  // A Minor-preference student does Minors whatever they checked.
  for(const id of ['pref1','pref2','pref3','pref4'])assert.equal(track(r,id),'Minor',id);
  // Leaders follow the project they lead, and locks stay exactly as written.
  assert.ok([at('leadMinor').project1,at('leadMinor').project2].includes('m1')); assert.equal(track(r,'leadMinor'),'Minor');
  assert.deepEqual([at('leadMajor').project1,at('leadMajor').project2],['a',null]);
  assert.deepEqual([at('lockMajor').project1,at('lockMajor').project2],['b',null]);
  assert.deepEqual([at('lockMinor').project1,at('lockMinor').project2],['m2','m3']);
  // Four Minor-preference students, the Minor leader and the locked Minor student make six, the
  // maximum, so the Not-sure students who lean Minor do Majors.
  assert.equal(r.summary.minorStudents,6);
  for(const id of ['lean0','lean1','lean2'])assert.equal(track(r,id),'Major',id);
});

const follow=cfg=>({...cfg,followChecksOverTrack:true});
test('with followChecksOverTrack FALSE, a student who said Major and checked only Minors does a Major and is flagged for PP Needs you',()=>{
  const {projects,cfg,fixed,choices}=leanRun({minorTarget:3}),r=E.sort([...fixed,s('maj',{choices:['m1','m2']})],projects,cfg,choices);
  assert.equal(track(r,'maj'),'Major');
  assert.ok(r.assignments.find(a=>a.studentId==='maj').flags.includes('Said Major but checked no running Major.'));
  assert.deepEqual(r.summary.tracks,{disagree:1,followChecks:false});
});
test('with followChecksOverTrack TRUE, the same student does the two Minors they checked, and the reason says why',()=>{
  const {projects,cfg,fixed,choices}=leanRun({minorTarget:3}),people=[...fixed,s('maj',{choices:['m1','m2']})];
  const r=E.sort(people,projects,follow(cfg),choices),a=r.assignments.find(x=>x.studentId==='maj');
  assert.deepEqual([a.project1,a.project2].sort(),['m1','m2']);
  assert.match(a.reason,/\. Said Major but checked only Minor projects, so placed by what they checked\.$/);
  // The PP Needs you flag replaces the note about the Minor minimum.
  assert.deepEqual(a.flags,["Said Major but placed in Minors they checked. Move them to a Major on their grade tab if you'd rather."]);
  assert.deepEqual(r.summary.tracks,{disagree:1,followChecks:true});
  // PP Check lists the change as information, even when Major-preference students may not take Minors.
  for(const run of [r,E.sort(people,projects,{...follow(cfg),allowMajorToMinor:false},choices)]){
    assert.deepEqual(run.checks.filter(c=>c.code==='MAJOR_TO_MINOR').map(c=>[c.severity,c.message]),[['info','This student asked for a Major and received Minors. Placed by what they checked.']]);
    assert.deepEqual(errors(run),[]);
  }
});
test('with followChecksOverTrack TRUE, a student who said Minor and checked 1 Minor and 2 Majors does a Major they checked',()=>{
  const {projects,cfg,fixed,choices}=leanRun({minorTarget:3}),people=[...fixed,s('min',{preference:'Minor',choices:['m1','a','b']})];
  const r=E.sort(people,projects,follow(cfg),choices),a=r.assignments.find(x=>x.studentId==='min');
  assert.ok(['a','b'].includes(a.project1)); assert.equal(a.project2,null);
  assert.match(a.reason,/\. Said Minor but checked mostly Majors, so placed by what they checked\.$/);
  assert.ok(a.flags.includes("Said Minor but placed in a Major they checked. Move them to two Minors on their grade tab if you'd rather."));
  assert.equal(r.checks.find(c=>c.code==='MINOR_PREFERENCE_CHANGED').severity,'info');
  // With the setting FALSE the student does Minors, as they said, and is flagged.
  const off=E.sort(people,projects,cfg,choices);
  assert.equal(track(off,'min'),'Minor');
  assert.ok(off.assignments.find(x=>x.studentId==='min').flags.includes('Said Minor but checked fewer than two running Minors.'));
});
test('with followChecksOverTrack TRUE, a student who said Major and checked a Major that isn\'t running plus two Minors counts as disagreeing',()=>{
  const {projects,cfg,fixed,choices}=leanRun({minorTarget:3}),people=[...fixed,s('x',{choices:['gone','m1','m2']})];
  const r=E.sort(people,[...projects,p('gone','Major',{enabled:false})],follow(cfg),choices);
  assert.equal(track(r,'x'),'Minor'); assert.deepEqual(r.summary.tracks,{disagree:1,followChecks:true});
  // Running, the same Major counts, and x does the Major they said.
  const running=E.sort(people,[...projects,p('gone')],{...follow(cfg),projectCount:9},{...choices,gone:{mustRun:true}});
  assert.equal(track(running,'x'),'Major'); assert.deepEqual(running.summary.tracks,{disagree:0,followChecks:true});
});
test('followChecksOverTrack never changes a locked student, a leader or a student who checked nothing',()=>{
  const {projects,cfg,fixed,choices}=leanRun({minorTarget:3}),at=(r,id)=>r.assignments.find(a=>a.studentId===id);
  // locked and leader said Major and checked only Minors, so they would disagree if they were free.
  const people=[...fixed,s('locked',{choices:['m1','m2']}),s('leader',{choices:['m1','m2']}),s('none',{choices:[]}),s('noneMinor',{preference:'Minor',choices:[]})];
  const locks=[{email:'locked@example.org',name:'',project1:'a',project2:'',row:2}],picks={...choices,b:{mustRun:true,leaders:['leader']}};
  const off=E.sort(people,projects,cfg,picks,{locks}),on=E.sort(people,projects,follow(cfg),picks,{locks});
  for(const id of ['locked','leader','none','noneMinor'])assert.deepEqual(at(on,id),at(off,id),id);
  assert.deepEqual([at(on,'locked').project1,at(on,'leader').project1,track(on,'none'),track(on,'noneMinor')],['a','b','Major','Minor']);
  assert.ok(![...on.assignments,...off.assignments].some(a=>a.flags.some(f=>/^Said /.test(f))));
  assert.deepEqual([off.summary.tracks,on.summary.tracks],[{disagree:0,followChecks:false},{disagree:0,followChecks:true}]);
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

test('the summary counts for each grade add up to the students placed in that grade',()=>{
  const projects=Array.from({length:6},(_,i)=>p('p'+i,i<2?'Minor':'Major',{types:[['hands','head'][i%2]],goals:[String(i+1)]}));
  const students=Array.from({length:60},(_,i)=>s('st'+String(i).padStart(2,'0'),{grade:10+i%3,preference:i<12?'Minor':'Major',choices:['p'+(i%6),'p'+((i+1)%6)],types:[['hands','head'][i%2]],goals:[String(i%6+1)]}));
  const r=E.sort(students,projects,config({minSize:1,targetSize:10,maxSize:14,projectCount:6,minorProjects:2,minorMin:0,minorTarget:12,minorMax:20}),{});
  const grade=id=>students.find(x=>x.id===id).grade;
  for(const g of [10,11,12]){
    const b=r.summary.byGrade[g],mine=r.assignments.filter(a=>a.status==='placed'&&grade(a.studentId)===g);
    assert.equal(b.placed,mine.length);
    assert.equal(b.major.checked+b.major.notChecked+b.minor.bothChecked+b.minor.oneChecked+b.minor.noneChecked,b.placed);
    assert.equal(Object.values(b.fits).reduce((x,y)=>x+y,0),mine.reduce((n,a)=>n+(a.project2?2:1),0));
  }
  // Some students landed in a project they didn't check, so the split is a real test.
  assert.ok([10,11,12].some(g=>r.summary.byGrade[g].major.notChecked+r.summary.byGrade[g].minor.oneChecked+r.summary.byGrade[g].minor.noneChecked>0));
});

test('a lock places a student exactly where the row says, before leaders and everyone else',()=>{
  const {projects,cfg,others}=leaderRun();
  // x asked for Minors and didn't check b; j1 is the listed leader of a. Both locks win.
  const locks=[{email:'X@Example.org ',name:'',project1:'MAJ-b',project2:'MAJ-b',row:2},{email:'',name:'Practice j1',project1:'b',project2:'',row:3}];
  const r=E.sort(others,projects,{...cfg,minorMin:1,minorTarget:2,minorMax:2},{a:{leaders:['j1']}},{locks}),at=id=>r.assignments.find(a=>a.studentId===id);
  for(const id of ['x','j1']){assert.equal(at(id).project1,'b');assert.equal(at(id).project2,null);assert.equal(at(id).status,'placed');assert.match(at(id).reason,/^Locked in place by hand\. /);}
  assert.ok(!at('j1').flags.some(f=>/^Leading/.test(f)));
  assert.equal(errors(r).length,0); assert.equal(r.issues.filter(i=>i.severity==='error').length,0);
  // The other track is allowed: the checker notes it as information.
  assert.equal(r.checks.find(c=>c.code==='MINOR_PREFERENCE_CHANGED'&&c.studentId==='x').severity,'info');
});
test('a lock that puts a group at 15 is kept and reported with the student\'s name',()=>{
  const students=Array.from({length:16},(_,i)=>s('st'+String(i).padStart(2,'0'),{name:'Example '+i,grade:12}));
  const locks=students.slice(0,15).map((st,i)=>({email:st.email,name:st.name,project1:'a',project2:'',row:i+2}));
  const r=E.sort(students,[p('a'),p('b')],config({minSize:1,targetSize:8,maxSize:14,projectCount:2}),{},{locks});
  assert.equal(r.assignments.filter(a=>a.project1==='a').length,15);
  assert.ok(students.slice(0,15).every(st=>r.assignments.find(a=>a.studentId===st.id).project1==='a'));
  const problems=r.issues.filter(i=>i.code==='LOCK_BREAKS_RULE');
  assert.equal(problems.length,15); assert.ok(problems.every(i=>i.severity==='error'));
  assert.match(problems[0].message,/^Example \d+ is locked into a, which has 15 students, over the maximum of 14\.$/);
  assert.ok(r.checks.some(c=>c.code==='OVER_CAPACITY'&&c.projectId==='a'));
});
test('a rerun given the last run\'s placements gives identical groups',()=>{
  const students=Array.from({length:88},(_,i)=>s('s'+i,{preference:i<44?'Minor':'Major',grade:10+i%3,choices:['m'+(i%8),'m'+((i+1)%8),'a'+(i%4)]}));
  const projects=[...Array.from({length:8},(_,i)=>p('m'+i,'Minor')),...Array.from({length:4},(_,i)=>p('a'+i))];
  const cfg={...E.defaults,projectCount:12,minorProjects:8,minorMin:40,minorTarget:44,minorMax:48,minSize:4};
  const first=E.sort(students,projects,cfg,{}),again=E.sort(students,projects,cfg,{},{previous:first.assignments});
  assert.deepEqual(again.assignments,first.assignments);
});
test('keeping last run\'s placement settles a tie but never beats a better fit',()=>{
  // With seed 2026, drew wins a tie for the one seat in a (see the tie-order test).
  const projects=[p('a'),p('b','Major',{types:['feet'],goals:['1']})],cfg=config({maxSize:1,targetSize:1});
  const casey=s('casey@example.org',{email:'casey@example.org',grade:12,choices:['a','c']}),drew=s('drew@example.org',{email:'drew@example.org',grade:12,choices:['a','c']});
  const previous=[{studentId:casey.id,project1:'a',project2:null},{studentId:drew.id,project1:'b',project2:null}];
  const seat=r=>r.assignments.find(a=>a.project1==='a').studentId;
  assert.equal(seat(E.sort([casey,drew],projects,cfg,{})),drew.id);
  assert.equal(seat(E.sort([casey,drew],projects,cfg,{},{previous})),casey.id);
  // If drew fits a better than casey does, fit wins over keeping casey's placement.
  assert.equal(seat(E.sort([{...casey,goals:['9']},drew],projects,cfg,{},{previous})),drew.id);
});
test('lock rows find students by email, Student ID or name, and report names they cannot match',()=>{
  const students=[s('jo@example.org',{email:'jo@example.org',name:'Smith, Jo'}),s('shared@example.org:lee-pat',{email:'shared@example.org',name:'Lee, Pat'}),s('shared@example.org:kim-sam',{email:'shared@example.org',name:'Kim, Sam'})];
  const projects=[p('robotics','Major',{name:'Robotics'}),p('glass-fusing','Minor',{name:'Glass Fusing'})];
  const info=E.locks(students,projects,[
    {email:' JO@example.org',name:'',project1:'MAJ-Robotics',project2:'MAJ-Robotics',row:2},
    {email:'shared@example.org:lee-pat',name:'',project1:'glass-fusing',project2:'',why:'  Lives\n off campus ',row:3},
    {email:'',name:'Kim, Sam',project1:'Robotics',project2:'',row:4},
    {email:'shared@example.org',name:'',project1:'Robotics',project2:'',row:5},
    {email:'nobody@example.org',name:'',project1:'Robotics',project2:'',row:6},
    {email:'jo@example.org',name:'',project1:'Robotics',project2:'',row:7},
    {email:'',name:'Kim, Sam',project1:'Pottery',project2:'',row:8}]);
  assert.deepEqual(info.byStudent['jo@example.org'],{project1:'robotics',project2:'robotics',row:2,why:''});
  assert.deepEqual(info.byStudent['shared@example.org:lee-pat'],{project1:'glass-fusing',project2:null,row:3,why:'Lives off campus'});
  assert.deepEqual(info.byStudent['shared@example.org:kim-sam'],{project1:'robotics',project2:null,row:4,why:''});
  assert.deepEqual(info.issues.map(i=>i.code),['LOCK_UNKNOWN_STUDENT','LOCK_UNKNOWN_STUDENT','LOCK_DUPLICATE','LOCK_UNKNOWN_PROJECT']);
  assert.ok(info.issues.every(i=>i.severity==='error'));
  assert.match(info.issues[3].message,/Locked placements row 8 \(Kim, Sam\): "Pottery" isn't a project name/);
});

const ask=(from,to,request='With',row=2,extra={})=>({row,name:'Practice '+from,classmate:'Practice '+to,request,use:true,namedEachOther:false,email:from+'@example.org',classmateEmail:to+'@example.org',...extra});
// ann fits a best and bea fits b best; two juniors want each project. Each Major holds up to four.
const pairRun=(farApart=false)=>{
  const b=farApart?p('b','Major',{types:['feet'],goals:['9']}):p('b','Major',{goals:['9']});
  const students=[s('ann',{grade:12,choices:['a','b']}),s('bea',{grade:12,choices:['a','b'],...(farApart?{types:['feet'],goals:['9']}:{goals:['9']})}),
    s('f1',{choices:['a','z']}),s('f2',{choices:['a','z']}),s('f3',{choices:['b','z'],types:['feet'],goals:['9']}),s('f4',{choices:['b','z'],types:['feet'],goals:['9']})];
  return {students,projects:[p('a'),b],cfg:config({maxSize:4,targetSize:3,useFriendRequests:true})};
};
test('a pair who named each other but were split by the main sort is joined, and the move is explained',()=>{
  const {students,projects,cfg}=pairRun(),friends=[ask('ann','bea'),ask('bea','ann','With',3)];
  const before=E.sort(students,projects,cfg,{}),at=(r,id)=>r.assignments.find(a=>a.studentId===id);
  assert.notEqual(at(before,'ann').project1,at(before,'bea').project1);
  const r=E.sort(students,projects,cfg,{},{friends});
  assert.equal(at(r,'ann').project1,at(r,'bea').project1);
  const mover=['ann','bea'].find(id=>at(r,id).project1!==at(before,id).project1);
  assert.match(at(r,mover).reason,/Moved to be with Practice (ann|bea), who they asked to work with\.$/);
  assert.deepEqual(r.friends.map(x=>[x.result,x.why]),[['Together','Moved to be together'],['Together','Moved to be together']]);
  assert.equal(r.summary.friends.withMet,2); assert.equal(r.summary.friends.studentsMet,2);
  assert.equal(errors(r).length,0);
});
test('a join that would cost two steps in fit is refused and reported',()=>{
  const {students,projects,cfg}=pairRun(true),friends=[ask('ann','bea'),ask('bea','ann','With',3)];
  const r=E.sort(students,projects,cfg,{},{friends}),at=id=>r.assignments.find(a=>a.studentId===id);
  assert.notEqual(at('ann').project1,at('bea').project1);
  assert.deepEqual(r.friends.map(x=>[x.result,x.why]),[['Not together','Would drop more than one step in fit'],['Not together','Would drop more than one step in fit']]);
  assert.deepEqual(r.assignments,E.sort(students,projects,cfg,{}).assignments);
});
test('a "Not with" pair who both checked only one project is never together, and the one moved is flagged',()=>{
  const students=[s('x',{grade:12,choices:['a']}),s('y',{grade:10,choices:['a']}),s('f1',{choices:['b','z'],goals:['9']}),s('f2',{choices:['b','z'],goals:['9']})];
  const projects=[p('a'),p('b','Major',{goals:['9']})],cfg=config({maxSize:4,targetSize:2,useFriendRequests:true});
  const plain=E.sort(students,projects,cfg,{}),at=(r,id)=>r.assignments.find(a=>a.studentId===id);
  assert.equal(at(plain,'x').project1,at(plain,'y').project1);
  const r=E.sort(students,projects,cfg,{},{friends:[ask('x','y','Not with')]});
  assert.notEqual(at(r,'x').project1,at(r,'y').project1);
  const moved=['x','y'].filter(id=>at(r,id).flags.some(f=>/^Moved to another group because of a "Not with" friend request\. Fit dropped \d steps?\./.test(f)));
  assert.equal(moved.length,1);
  assert.deepEqual(r.friends.map(x=>[x.result,x.why]),[['Not together','Moved apart']]);
  assert.ok(!r.checks.some(c=>c.code==='NOT_WITH_TOGETHER'));
});
test('a Major student and a Minor student who asked to work together are reported, and nobody changes track',()=>{
  const projects=[p('a'),p('m1','Minor'),p('m2','Minor')],cfg=config({projectCount:3,minorProjects:2,minorMin:1,minorTarget:1,minorMax:1,useFriendRequests:true});
  const students=[s('maj',{grade:12}),s('min',{grade:12,preference:'Minor',choices:['m1','m2']}),s('f1')];
  const r=E.sort(students,projects,cfg,{},{friends:[ask('maj','min'),ask('min','maj','With',3)]});
  assert.equal(r.assignments.find(a=>a.studentId==='maj').project2,null);
  assert.ok(r.assignments.find(a=>a.studentId==='min').project2);
  assert.deepEqual(r.friends.map(x=>x.why),['One asked for a Major and the other for Minors','One asked for a Major and the other for Minors']);
});
test('with useFriendRequests FALSE the groups match a run without friend requests, and every request says Not applied',()=>{
  const {students,projects,cfg}=pairRun(),friends=[ask('ann','bea'),ask('bea','ann','With',3),ask('f1','f3','Not with',4)];
  const off={...cfg,useFriendRequests:false},r=E.sort(students,projects,off,{},{friends});
  assert.deepEqual(r.assignments,E.sort(students,projects,off,{}).assignments);
  assert.ok(r.friends.length===3&&r.friends.every(x=>x.result==='Not applied'&&x.why==='Friend requests are turned off in Settings'));
});
test('friend requests skip shared emails with a warning, and never move a locked student',()=>{
  const {students,projects,cfg}=pairRun(),twins=[...students,s('twin1',{email:'shared@example.org'}),s('twin2',{email:'shared@example.org'})];
  const shared=E.sort(twins,projects,{...cfg,maxSize:5},{},{friends:[ask('ann','x',undefined,2,{classmateEmail:'SHARED@example.org '})]});
  assert.ok(shared.issues.some(i=>i.code==='FRIEND_SHARED_EMAIL'&&i.severity==='warning'&&i.message==='Two students share this email, so this friend request was skipped.'));
  assert.deepEqual(shared.friends.map(x=>[x.result,x.why]),[['Not applied','Two students share this email']]);
  // Locks keep both students where they are; the request is reported instead.
  const locks=[{email:'ann@example.org',name:'',project1:'a',project2:'',row:2},{email:'bea@example.org',name:'',project1:'b',project2:'',row:3}];
  const r=E.sort(students,projects,cfg,{},{locks,friends:[ask('ann','bea'),ask('bea','ann','With',3)]});
  assert.equal(r.assignments.find(a=>a.studentId==='ann').project1,'a');
  assert.deepEqual(r.friends.map(x=>x.why),['Locked in place by hand','Locked in place by hand']);
  // A "Not with" pair locked into one group stays there, with errors naming the students.
  const both=[{email:'ann@example.org',name:'',project1:'a',project2:'',row:2},{email:'bea@example.org',name:'',project1:'a',project2:'',row:3}];
  const stuck=E.sort(students,projects,cfg,{},{locks:both,friends:[ask('ann','bea','Not with')]});
  assert.ok(stuck.checks.some(c=>c.code==='NOT_WITH_TOGETHER'&&c.message==='Practice ann and Practice bea are in the same group, but one asked not to work with the other.'));
  assert.equal(stuck.issues.filter(i=>i.code==='LOCK_BREAKS_RULE'&&/"Not with" request/.test(i.message)).length,2);
});

// Eight students fit a best and eight fit b best. a starts with only two Female students.
const genderRun=(far=false)=>{
  const b=far?p('b','Major',{types:['feet'],goals:['9']}):p('b','Major',{goals:['9']}),extra=far?{types:['feet'],goals:['9']}:{goals:['9']};
  const students=[...Array.from({length:8},(_,i)=>s('a'+i,{choices:['a','b'],gender:i<2?'Female':'Male'})),...Array.from({length:8},(_,i)=>s('b'+i,{choices:['a','b'],gender:i<5?'Female':'Male',...extra}))];
  return {students,projects:[p('a'),b],cfg:config({minSize:4,targetSize:8,maxSize:8,balanceGender:true})};
};
const genderMessages=r=>r.checks.filter(c=>c.code==='GENDER_BALANCE').map(c=>c.message);
test('a group with two Female students is fixed by a swap that costs each student one step at most',()=>{
  const {students,projects,cfg}=genderRun(),off=E.sort(students,projects,{...cfg,balanceGender:false},{});
  assert.deepEqual(genderMessages(off),['a: 6 Male and 2 Female students. Gender balancing is turned off in Settings.']);
  const r=E.sort(students,projects,cfg,{}),inA=r.assignments.filter(a=>a.project1==='a').map(a=>students.find(x=>x.id===a.studentId).gender);
  assert.equal(inA.filter(g=>g==='Female').length,3); assert.deepEqual(genderMessages(r),[]);
  const swapped=r.assignments.filter(a=>/Swapped with a student in another group to balance the groups\./.test(a.reason));
  assert.equal(swapped.length,2);
  for(const a of swapped)assert.ok(a.fit1-off.assignments.find(x=>x.studentId===a.studentId).fit1<=1);
});
test('a gender fix that would cost two steps is refused and the group is reported',()=>{
  const {students,projects,cfg}=genderRun(true),r=E.sort(students,projects,cfg,{});
  assert.deepEqual(r.assignments,E.sort(students,projects,{...cfg,balanceGender:false},{}).assignments);
  assert.deepEqual(genderMessages(r),["a: 6 Male and 2 Female students. We couldn't fix it without breaking another rule."]);
});
test('students not listed as Male or Female never move for gender, and with balanceGender FALSE the groups match a run without gender data',()=>{
  const {students,projects,cfg}=genderRun(),mixed=students.map((x,i)=>i%4===3?{...x,gender:'Unknown'}:x);
  const on=E.sort(mixed,projects,cfg,{}),off=E.sort(mixed,projects,{...cfg,balanceGender:false},{}),none=E.sort(mixed.map(x=>({...x,gender:null})),projects,{...cfg,balanceGender:false},{});
  for(const x of mixed.filter(x=>x.gender==='Unknown'))assert.equal(on.assignments.find(a=>a.studentId===x.id).project1,off.assignments.find(a=>a.studentId===x.id).project1);
  assert.ok(on.assignments.some((a,i)=>a.project1!==off.assignments[i].project1));
  assert.deepEqual(off.assignments,none.assignments);
  assert.ok(genderMessages(off).length>0 && genderMessages(off).every(m=>/\(\d+ not listed as Male or Female\)\. Gender balancing is turned off in Settings\.$/.test(m)));
});

// Students who each checked one project, so each project's score is set by how many checked it.
const fans=(id,n,preference)=>Array.from({length:n},(_,i)=>s(id+'-fan'+i,{choices:[id],preference}));
const lengths=plan=>Object.fromEntries(plan.projects.map(x=>[x.id,x.finalLength]));
test('Minor-only projects fill the Minor slots first, so LARP runs as a Minor and Biomimicry (Either) as a Major',()=>{
  const projects=[...['m1','m2','m3','m4','m5'].map(id=>p(id,'Minor')),p('e6','Either'),p('e7','Either'),p('larp','Minor'),p('biomimicry','Either'),p('j1'),p('j2'),p('j3')];
  // The seven top Minor-or-Either projects, then Biomimicry above LARP by score.
  const students=[...['m1','m2','m3','m4','m5','e6','e7'].flatMap(id=>fans(id,10,'Not sure')),...fans('biomimicry',8,'Major'),...fans('larp',6,'Not sure'),...fans('j1',4,'Major'),...fans('j2',3,'Major'),...fans('j3',2,'Major')];
  const plan=lengths(E.propose(students,projects,{...E.defaults,projectCount:11,minorProjects:8},{}));
  assert.equal(plan.larp,'Minor'); assert.equal(plan.biomimicry,'Major');
  assert.deepEqual(Object.keys(plan).filter(id=>plan[id]==='Minor').sort(),['e6','e7','larp','m1','m2','m3','m4','m5']);
});
test('extra Minor-only projects make room for the next best Major, and too few Minor projects bring in the next best ones',()=>{
  // Three Minor-only projects for two Minor slots: the weakest gives way to the next Major.
  let plan=lengths(E.propose([...fans('m1',9,'Minor'),...fans('m2',8,'Minor'),...fans('m3',7,'Minor'),...fans('j1',3,'Major'),...fans('j2',2,'Major')],[p('m1','Minor'),p('m2','Minor'),p('m3','Minor'),p('j1'),p('j2')],{...E.defaults,projectCount:4,minorProjects:2},{}));
  assert.deepEqual(plan,{j1:'Major',j2:'Major',m1:'Minor',m2:'Minor'});
  // Majors score highest, but three Minor slots need three projects that can run as Minors.
  plan=lengths(E.propose([...['j1','j2','j3','j4'].flatMap(id=>fans(id,9,'Major')),...fans('m1',3,'Minor'),...fans('e1',2,'Minor'),...fans('m2',1,'Minor')],[p('j1'),p('j2'),p('j3'),p('j4'),p('m1','Minor'),p('e1','Either'),p('m2','Minor')],{...E.defaults,projectCount:4,minorProjects:3},{}));
  assert.deepEqual(plan,{e1:'Minor',j1:'Major',m1:'Minor',m2:'Minor'});
});
test('Project choices still override the suggested lengths and runs',()=>{
  const projects=[p('m1','Minor'),p('e1','Either'),p('e2','Either'),p('j1')];
  const students=[...fans('e1',9,'Not sure'),...fans('e2',8,'Not sure'),...fans('m1',7,'Minor'),...fans('j1',6,'Major')];
  const plan=lengths(E.propose(students,projects,{...E.defaults,projectCount:3,minorProjects:2},{e1:{length:'Major'},j1:{run:false}}));
  assert.deepEqual(plan,{e1:'Major',e2:'Minor',m1:'Minor'});
});

// Thirty Major students: twenty want a, five want b and five want c. The even split is ten each.
const sizeRun=()=>({projects:[p('a'),p('b','Major',{goals:['9']}),p('c','Major',{goals:['8']})],cfg:config({minSize:8,targetSize:10,maxSize:10,projectCount:3}),
  students:[...Array.from({length:20},(_,i)=>s('a'+i,{choices:['a','z']})),...Array.from({length:5},(_,i)=>s('b'+i,{choices:['b','z'],goals:['9']})),...Array.from({length:5},(_,i)=>s('c'+i,{choices:['c','z'],goals:['8']}))]});
const groupSize=(r,id)=>r.assignments.filter(a=>a.project1===id).length;
test('a Major with a Max size takes more than the even split when students want it, and the other groups stay at the minimum',()=>{
  const {projects,cfg,students}=sizeRun(),even=E.sort(students,projects,cfg,{});
  assert.deepEqual(['a','b','c'].map(id=>groupSize(even,id)),[10,10,10]);
  const big=E.sort(students,projects,cfg,{a:{maxSize:14}});
  assert.deepEqual(['a','b','c'].map(id=>groupSize(big,id)),[14,8,8]);
  assert.deepEqual(big.checks.filter(c=>['OVER_CAPACITY','UNDER_MINIMUM'].includes(c.code)),[]);
  assert.deepEqual(big.summary.groups.map(g=>[g.id,g.sizes]),[['a',[14]],['b',[8]],['c',[8]]]);
  // A Max size below the minimum group size is an error.
  assert.ok(E.sort(students,projects,cfg,{a:{maxSize:5}}).issues.some(i=>i.code==='INVALID_MAX_SIZE'&&i.severity==='error'));
});
test('with Max size blank everywhere the groups match a run without it',()=>{
  const {projects,cfg,students}=sizeRun();
  assert.deepEqual(E.sort(students,projects,cfg,{a:{maxSize:null},b:{maxSize:null},c:{maxSize:null}}).assignments,E.sort(students,projects,cfg,{}).assignments);
});
// Thirty Major students over three Majors, so the even split is ten. Some checked a; the others
// checked neither project and fit a at 5, b and c at 6, so they would all rather be in a.
const reservedRun=fans=>({projects:[p('a'),p('b','Major',{types:['feet'],goals:['9']}),p('c','Major',{types:['eyes'],goals:['8']})],cfg:config({minSize:8,targetSize:10,maxSize:10,projectCount:3}),
  students:[...Array.from({length:fans},(_,i)=>s('fan'+i,{choices:['a','z']})),...Array.from({length:30-fans},(_,i)=>s('other'+i,{choices:['y','z']}))]});
const inGroup=(r,id,prefix)=>r.assignments.filter(a=>a.project1===id&&a.studentId.startsWith(prefix)).length;
test('a Major\'s seats above its even split go only to students who checked it',()=>{
  // a's even split is ten and its Max size 14. Students who didn't check a fill seats 1 to 10 at most.
  let {projects,cfg,students}=reservedRun(2),r=E.sort(students,projects,cfg,{a:{maxSize:14}});
  assert.deepEqual([inGroup(r,'a','other'),inGroup(r,'a','fan'),groupSize(r,'a')],[10,2,12]);
  assert.equal(r.summary.placed,30); assert.deepEqual(errors(r),[]);
  // Students who checked a take seats 11 to 14.
  ({projects,cfg,students}=reservedRun(4)); r=E.sort(students,projects,cfg,{a:{maxSize:14}});
  assert.deepEqual([inGroup(r,'a','other'),inGroup(r,'a','fan'),groupSize(r,'a')],[10,4,14]);
  // Locked students take open seats first: with two who didn't check a locked into it, eight more join them.
  ({projects,cfg,students}=reservedRun(2));
  const locks=['other0','other1'].map((id,i)=>({email:id+'@example.org',name:'',project1:'a',project2:'',row:i+2}));
  r=E.sort(students,projects,cfg,{a:{maxSize:14}},{locks});
  assert.deepEqual([inGroup(r,'a','other'),inGroup(r,'a','fan'),groupSize(r,'a')],[10,2,12]);
  // Without a Max size, a keeps its even split.
  assert.equal(groupSize(E.sort(students,projects,cfg,{}),'a'),10);
});
test('when the only room left is in a Major with a Max size, students who didn\'t check it still get in and nobody is left out',()=>{
  // b holds ten. a's even split is ten and its Max size 14, and only two students checked it. The
  // retry opens a's seats to everyone one at a time until all 24 are placed.
  const projects=[p('a'),p('b','Major',{goals:['9']})],cfg=config({minSize:8,targetSize:10,maxSize:10});
  const students=[...Array.from({length:2},(_,i)=>s('fan'+i,{choices:['a','z']})),...Array.from({length:22},(_,i)=>s('b'+i,{choices:['b','z'],goals:['9']}))];
  const r=E.sort(students,projects,cfg,{a:{maxSize:14}});
  assert.deepEqual([r.summary.placed,r.summary.needsReview,groupSize(r,'a'),groupSize(r,'b'),inGroup(r,'a','b')],[24,0,14,10,12]);
  assert.ok(r.issues.some(i=>i.code==='QUOTA_RELAXED'));
});
test('a Max size below a Major\'s even split still caps it',()=>{
  // Thirty-nine students over three Majors, so the even split is 13, and all of them checked a.
  const projects=[p('a'),p('b','Major',{goals:['9']}),p('c','Major',{goals:['8']})],cfg=config({minSize:8,targetSize:12,maxSize:14,projectCount:3});
  const students=Array.from({length:39},(_,i)=>s('s'+i,{choices:['a','z']}));
  assert.equal(groupSize(E.sort(students,projects,cfg,{}),'a'),13);
  const r=E.sort(students,projects,cfg,{a:{maxSize:12}});
  assert.equal(groupSize(r,'a'),12); assert.equal(r.summary.placed,39);
  assert.deepEqual(r.checks.filter(c=>c.code==='OVER_CAPACITY'),[]);
});
test('a Minor with a Max size keeps the old rule: anyone can fill it up to the Max size',()=>{
  // Thirty Minor students over three Minors, so the even split is ten a week. Two checked m1; the
  // others checked nothing running and fit m1 at 5, m2 and m3 at 6.
  const projects=[p('m1','Minor'),p('m2','Minor',{types:['feet'],goals:['9']}),p('m3','Minor',{types:['eyes'],goals:['8']})];
  const cfg=config({minSize:8,targetSize:10,maxSize:10,projectCount:3,minorProjects:3,minorMin:30,minorTarget:30,minorMax:30});
  const students=[...Array.from({length:2},(_,i)=>s('fan'+i,{preference:'Minor',choices:['m1','z']})),...Array.from({length:28},(_,i)=>s('other'+i,{preference:'Minor',choices:['y','z']}))];
  const r=E.sort(students,projects,cfg,{m1:{maxSize:14}}),m1=r.summary.groups.find(g=>g.id==='m1');
  assert.deepEqual(m1.sizes,[14,14]); assert.equal(r.summary.placed,30);
  assert.equal(r.assignments.filter(a=>a.studentId.startsWith('other')&&[a.project1,a.project2].includes('m1')).length,26);
});

test('a project a student checked comes before fit: seniors keep checked seats, and a senior\'s better fit never costs a younger student one',()=>{
  const cfg=config({maxSize:1,targetSize:1}),at=(r,id)=>r.assignments.find(a=>a.studentId===id);
  // One seat left in a, and both checked it; b suits neither of them. The senior gets a.
  let r=E.sort([s('senior',{grade:12}),s('soph',{grade:10})],[p('a'),p('b','Major',{types:['feet'],goals:['1']})],cfg,{});
  assert.equal(at(r,'senior').project1,'a'); assert.equal(at(r,'soph').project1,'b');
  // The senior fits a at 1 and b at 2 and checked both; the sophomore checked only a. The senior
  // takes b so the sophomore gets the project they checked.
  r=E.sort([s('senior',{grade:12,choices:['a','b']}),s('soph',{grade:10})],[p('a'),p('b','Major',{goals:['9']})],cfg,{});
  assert.deepEqual([at(r,'senior').project1,at(r,'senior').fit1,at(r,'soph').project1,at(r,'soph').fit1],['b',2,'a',1]);
  // When both stay in checked projects, a senior's step of fit counts twice a junior's.
  r=E.sort([s('senior',{grade:12,choices:['a','b']}),s('junior',{grade:11,choices:['a','b']})],[p('a'),p('b','Major',{goals:['9']})],cfg,{});
  assert.equal(at(r,'senior').project1,'a');
});

test('a gender swap never moves a student out of a project they checked into one they did not, and single-student groups are listed first',()=>{
  // Each student checked only their own project and fits it at 4; the other project is unchecked at 5.
  // The only swap that would fix a takes both swapped students out of a project they checked.
  const projects=[p('a'),p('b','Major',{types:['heart'],goals:['7']})],cfg=config({minSize:4,targetSize:8,maxSize:8,balanceGender:true});
  const students=[...Array.from({length:8},(_,i)=>s('a'+i,{types:['heart'],goals:['7'],gender:i<2?'Female':'Male'})),...Array.from({length:8},(_,i)=>s('b'+i,{choices:['b','z'],gender:i<5?'Female':'Male'}))];
  const r=E.sort(students,projects,cfg,{});
  assert.deepEqual(r.assignments,E.sort(students,projects,{...cfg,balanceGender:false},{}).assignments);
  assert.deepEqual(genderMessages(r),["a: 6 Male and 2 Female students. We couldn't fix it without breaking another rule."]);
  // A group with exactly one Male or one Female student comes before other broken groups.
  const majors=[{...p('a'),finalLength:'Major'},{...p('b'),finalLength:'Major'}],group=(id,f,m)=>[...Array(f).fill('Female'),...Array(m).fill('Male')].map((g,i)=>s(id+i,{gender:g}));
  const people=[...group('a',2,4),...group('b',5,1)],rows=people.map(x=>({studentId:x.id,status:'placed',project1:x.id[0],project2:null,fit1:1,fit2:null}));
  assert.deepEqual(E.check(people,majors,rows,config({minSize:1,maxSize:8}),{}).filter(c=>c.code==='GENDER_BALANCE').map(c=>c.message.split(':')[0]),['b','a']);
});

// f Female and m Male students who fit their own Major at 1: a, b (goal 9) or c (goal 8). Each checked
// their own project and z, or the second project named in also, which they fit at 2.
const homeGoals={a:['3'],b:['9'],c:['8']};
const team=(home,f,m,also={})=>[...Array(f).fill('Female'),...Array(m).fill('Male')].map((g,i)=>{const id=home+g[0]+(i<f?i:i-f);return s(id,{choices:[home,also[id]||'z'],goals:homeGoals[home],gender:g});});
const genderProjects=n=>[p('a'),p('b','Major',{goals:['9']}),p('c','Major',{goals:['8']})].slice(0,n);
const femaleIn=(r,students,id)=>r.assignments.filter(a=>a.project1===id&&students.find(x=>x.id===a.studentId).gender==='Female').length;
const spot=(r,id)=>r.assignments.find(a=>a.studentId===id);
test('a group with one Female student gets to three by swaps, because going from one to two counts as better',()=>{
  // Every group is full at eight, so only swaps work. a's one Female student checked only a. bF0 and
  // cF0 checked a, and aM0 checked b and aM1 checked c.
  const students=[...team('a',1,7,{aM0:'b',aM1:'c'}),...team('b',4,4,{bF0:'a'}),...team('c',4,4,{cF0:'a'})];
  const cfg=config({minSize:4,targetSize:8,maxSize:8,projectCount:3,balanceGender:true}),off=E.sort(students,genderProjects(3),{...cfg,balanceGender:false},{});
  assert.deepEqual(genderMessages(off),['a: 7 Male and 1 Female students. Gender balancing is turned off in Settings.']);
  const r=E.sort(students,genderProjects(3),cfg,{});
  assert.equal(femaleIn(r,students,'a'),3); assert.deepEqual(genderMessages(r),[]);
  assert.deepEqual(['aM0','aM1','bF0','cF0'].map(id=>spot(r,id).project1),['b','c','a','a']);
  assert.deepEqual(r.assignments.filter(a=>/balance the groups/.test(a.reason)).map(a=>a.studentId).sort(),['aM0','aM1','bF0','cF0']);
  for(const id of ['aM0','aM1','bF0','cF0'])assert.match(spot(r,id).reason,/ Swapped with a student in another group to balance the groups\.$/);
});
test('a group with one Female student and room for more takes in Female students who checked it, with nobody moving back',()=>{
  // Groups of eight with room up to 12. bF0 and cF0 checked a; nobody in a checked anything else.
  const students=[...team('a',1,7),...team('b',4,4,{bF0:'a'}),...team('c',4,4,{cF0:'a'})];
  const cfg=config({minSize:4,targetSize:8,maxSize:14,projectCount:3,balanceGender:true}),off=E.sort(students,genderProjects(3),{...cfg,balanceGender:false},{});
  const r=E.sort(students,genderProjects(3),cfg,{});
  assert.deepEqual([femaleIn(r,students,'a'),groupSize(r,'a'),groupSize(r,'b'),groupSize(r,'c')],[3,10,7,7]);
  assert.deepEqual([spot(r,'bF0').project1,spot(r,'cF0').project1],['a','a']);
  for(const id of ['bF0','cF0'])assert.match(spot(r,id).reason,/ Moved to another group to balance the groups\.$/);
  // Only the two Female students moved.
  assert.deepEqual(r.assignments.filter((a,i)=>a.project1!==off.assignments[i].project1).map(a=>a.studentId).sort(),['bF0','cF0']);
  assert.deepEqual(genderMessages(r),[]);
});
test('a gender move never takes a group without a Max size above 12, or a group below the minimum',()=>{
  // a has 12 students, so a move into it would make 13.
  let students=[...team('a',1,11),...team('b',6,6,{bF0:'a',bF1:'a'})],cfg=config({minSize:4,targetSize:8,maxSize:14,balanceGender:true});
  let r=E.sort(students,genderProjects(2),cfg,{});
  assert.deepEqual(r.assignments,E.sort(students,genderProjects(2),{...cfg,balanceGender:false},{}).assignments);
  assert.deepEqual(genderMessages(r),["a: 11 Male and 1 Female students. We couldn't fix it without breaking another rule."]);
  // With a Max size of 14, a may grow to it.
  r=E.sort(students,genderProjects(2),cfg,{a:{maxSize:14}});
  assert.deepEqual([femaleIn(r,students,'a'),groupSize(r,'a'),spot(r,'bF0').project1,spot(r,'bF1').project1],[3,14,'a','a']);
  // b is at the minimum of seven, so bF0 can't leave it.
  students=[...team('a',1,6),...team('b',4,3,{bF0:'a'})];cfg=config({minSize:7,targetSize:7,maxSize:8,balanceGender:true});
  r=E.sort(students,genderProjects(2),cfg,{});
  assert.deepEqual(r.assignments,E.sort(students,genderProjects(2),{...cfg,balanceGender:false},{}).assignments);
  // With a minimum of six, she moves.
  assert.equal(spot(E.sort(students,genderProjects(2),{...cfg,minSize:6},{}),'bF0').project1,'a');
});
test('a swap or move that takes one group from three Female students to two, to take another from one to two, is refused',()=>{
  // bF0 checked a and aM0 checked b, so the move and the swap break no other rule.
  const cfg=config({minSize:4,targetSize:8,maxSize:14,balanceGender:true});
  let students=[...team('a',1,7,{aM0:'b'}),...team('b',3,5,{bF0:'a'})],r=E.sort(students,genderProjects(2),cfg,{});
  assert.deepEqual(r.assignments,E.sort(students,genderProjects(2),{...cfg,balanceGender:false},{}).assignments);
  assert.deepEqual(genderMessages(r),["a: 7 Male and 1 Female students. We couldn't fix it without breaking another rule."]);
  // With four Female students in b the total goes down, and bF0 moves.
  students=[...team('a',1,7,{aM0:'b'}),...team('b',4,4,{bF0:'a'})];r=E.sort(students,genderProjects(2),cfg,{});
  assert.deepEqual([spot(r,'bF0').project1,spot(r,'aM0').project1],['a','a']);
});

test('two Minor students who share a Minor in different weeks are joined by switching one student\'s weeks, with the same fits',()=>{
  const projects=[p('glass','Minor',{name:'Glass Fusing'}),p('larp','Minor',{name:'LARP',goals:['9']}),p('cooking','Minor',{name:'Cooking'})];
  const cfg=config({projectCount:3,minorProjects:3,minorMin:6,minorTarget:6,minorMax:6,maxSize:3,useFriendRequests:true});
  // A: Glass Fusing then LARP. B: LARP then Cooking. Last run's weeks keep everyone's weeks as listed.
  const plan={A:['glass','larp'],f1:['larp','glass'],B:['larp','cooking'],f2:['cooking','larp'],f3:['glass','cooking'],f4:['cooking','glass']};
  const students=Object.keys(plan).map(id=>s(id,{preference:'Minor',choices:plan[id].slice()}));
  const previous=Object.keys(plan).map(id=>({studentId:id,project1:plan[id][0],project2:plan[id][1]}));
  const before=E.sort(students,projects,cfg,{},{previous}),r=E.sort(students,projects,cfg,{},{previous,friends:[ask('A','B')]});
  const at=(x,id)=>x.assignments.find(a=>a.studentId===id);
  assert.deepEqual([at(before,'A').project1,at(before,'A').project2,at(before,'B').project1,at(before,'B').project2],['glass','larp','larp','cooking']);
  assert.ok(['project1','project2'].some(k=>at(r,'A')[k]==='larp'&&at(r,'B')[k]==='larp'));
  for(const id of ['A','B'])assert.deepEqual([at(r,id).fit1,at(r,id).fit2].sort(),[at(before,id).fit1,at(before,id).fit2].sort());
  assert.match(at(r,'A').reason+at(r,'B').reason,/Switched weeks to be with Practice [AB], who (they asked to work with|asked to work with them)\./);
  assert.deepEqual(r.friends.map(x=>[x.result,x.why]),[['Together','Moved to be together']]);
  assert.equal(r.assignments.filter((a,i)=>a.project1!==before.assignments[i].project1).length,1);
});

test('a locked student at fit 6 gets no fit-6 flag or LOW_FIT warning, and the reason gives the Why text',()=>{
  // L and M checked a and z, and b shares neither their Type nor their UN goal, so b is fit 6 for both.
  const projects=[p('a'),p('b','Major',{types:['feet'],goals:['9']})],students=[s('L'),s('M'),s('N'),s('O',{choices:['b','z'],types:['feet']}),s('Q',{choices:['b','z'],types:['feet']})],cfg=config({maxSize:4});
  const locks=[{email:'L@example.org',name:'',project1:'b',project2:'',why:'Needs the ground-floor room',row:2},{email:'M@example.org',name:'',project1:'MAJ-b',project2:'MAJ-b',why:'',row:3}];
  const r=E.sort(students,projects,cfg,{},{locks}),at=id=>r.assignments.find(a=>a.studentId===id);
  for(const id of ['L','M']){
    assert.equal(at(id).project1,'b'); assert.equal(at(id).fit1,6);
    assert.ok(!at(id).flags.includes('Fit 6: review the placement.'));
    assert.ok(!r.checks.some(c=>c.code==='LOW_FIT'&&c.studentId===id));
  }
  assert.match(at('L').reason,/^Locked in place: Needs the ground-floor room\. /);
  assert.match(at('M').reason,/^Locked in place by hand\. /);
  assert.ok(!JSON.stringify(r).includes('Litowitz'));
  // The same placement without a lock is still flagged.
  assert.ok(E.check(students,r.projects,r.assignments.map(a=>({...a,locked:undefined})),cfg,{}).some(c=>c.code==='LOW_FIT'&&c.studentId==='L'));
  assert.ok(E.explain(students[0],['b'],r.projects,cfg,{}).flags.includes('Fit 6: review the placement.'));
  // A lock with no projects keeps the student out, and its reason gives the Why too.
  const out=E.sort(students,projects,cfg,{},{locks:[{email:'N@example.org',name:'',project1:'',project2:'',why:'Away that week.',row:2}]});
  assert.equal(out.assignments.find(a=>a.studentId==='N').reason,'Locked in place: Away that week. Not placed in a project.');
});

test('a friend request written with two Student IDs that share an email is used',()=>{
  const {students,projects,cfg}=pairRun();
  // Jo and Jane sent their forms from one email, so each Student ID adds the name.
  const siblings=[...students,s('jo@example.org:smith-jo',{name:'Jo Smith',email:'jo@example.org',choices:['a','b']}),s('jo@example.org:smith-jane',{name:'Jane Smith',email:'jo@example.org',choices:['a','b']})];
  const row=ask('jo','jane',undefined,2,{name:'Jo Smith',classmate:'Jane Smith',email:'jo@example.org:smith-jo',classmateEmail:' JO@example.org:Smith-Jane'});
  const r=E.sort(siblings,projects,{...cfg,maxSize:5},{},{friends:[row]}),at=id=>r.assignments.find(a=>a.studentId===id);
  assert.deepEqual(r.friends.map(x=>x.result),['Together']);
  assert.equal(at('jo@example.org:smith-jo').project1,at('jo@example.org:smith-jane').project1);
  assert.ok(!r.issues.some(i=>i.code==='FRIEND_SHARED_EMAIL'));
  // The shared email alone still can't tell them apart, so that row is skipped with the warning.
  const bare=E.sort(siblings,projects,{...cfg,maxSize:5},{},{friends:[{...row,classmateEmail:'jo@example.org'}]});
  assert.deepEqual(bare.friends.map(x=>[x.result,x.why]),[['Not applied','Two students share this email']]);
  assert.ok(bare.issues.some(i=>i.code==='FRIEND_SHARED_EMAIL'));
});

test('with friend requests on, no student without a "With" request of their own ends up in fewer projects they checked',()=>{
  // Friend requests must never cost a student who didn't ask a project they checked. A request is a
  // student's own when they wrote it, or when the row says they named each other.
  const checked=(r,st)=>{const a=r.assignments.find(x=>x.studentId===st.id);return [a.project1,a.project2].filter(id=>id&&st.choices.includes(id)).length;};
  function protects(students,projects,cfg,friends,context={}){
    const asked=new Set(friends.filter(f=>f.request==='With').flatMap(f=>f.namedEachOther?[f.email,f.classmateEmail]:[f.email]).map(e=>e.trim().toLowerCase()));
    const on=E.sort(students,projects,{...cfg,useFriendRequests:true},{},{...context,friends}),off=E.sort(students,projects,{...cfg,useFriendRequests:false},{},{...context,friends});
    for(const st of students.filter(x=>!asked.has(x.email.toLowerCase())))assert.ok(checked(on,st)>=checked(off,st),st.id+' lost a project they checked');
    return on;
  }
  // A Not-sure student who named a Major-preference classmate keeps the track the sort gives them, so
  // nobody else is pulled into Minors they didn't check to keep the Minor count.
  protects([s('p1',{preference:'Minor',choices:['m1','m2']}),s('x',{preference:'Not sure',choices:['m1','m2']}),s('y',{grade:12,preference:'Not sure',choices:['a','z']}),s('maj')],
    [p('a'),p('m1','Minor'),p('m2','Minor')],config({projectCount:3,minorProjects:2,minorMin:2,minorTarget:2,minorMax:3,maxSize:4}),[ask('x','maj')]);
  // Joins that move the asker or a classmate who named them back.
  const pair=pairRun();
  protects(pair.students,pair.projects,pair.cfg,[ask('ann','bea'),ask('bea','ann','With',3)]);
  protects(pair.students,pair.projects,pair.cfg,[ask('f1','f3',undefined,2,{namedEachOther:true})]);
  // A swap moves a third student, who never gets a worse fit.
  const full=[p('a'),p('b','Major',{goals:['9']})],swapped=protects([s('ann',{grade:12,choices:['a','b']}),s('u',{choices:['a','z']}),s('bea',{choices:['b','z'],goals:['9']}),s('t',{choices:['a','b'],goals:[]})],full,config({maxSize:2}),[ask('ann','bea')]);
  assert.match(swapped.assignments.find(a=>a.studentId==='t').reason,/ Swapped into this group /);
  // A week switch.
  const plan={A:['glass','larp'],f1:['larp','glass'],B:['larp','cooking'],f2:['cooking','larp'],f3:['glass','cooking'],f4:['cooking','glass']};
  protects(Object.keys(plan).map(id=>s(id,{preference:'Minor',choices:plan[id].slice()})),[p('glass','Minor'),p('larp','Minor',{goals:['9']}),p('cooking','Minor')],
    config({projectCount:3,minorProjects:3,minorMin:6,minorTarget:6,minorMax:6,maxSize:3}),[ask('A','B')],{previous:Object.keys(plan).map(id=>({studentId:id,project1:plan[id][0],project2:plan[id][1]}))});
  // A larger invented roster: 36 students, three Majors, four Minors and 18 "With" requests, four of
  // them named both ways.
  let seed=2026;const rand=n=>(seed=seed*48271%2147483647)%n;
  const pool=['a','b','c','m1','m2','m3','m4'],roster=Array.from({length:36},(_,i)=>{const choices=[];while(choices.length<3){const c=pool[rand(7)];if(!choices.includes(c))choices.push(c);}
    return s('r'+i,{grade:10+rand(3),preference:['Major','Minor','Not sure'][rand(3)],choices,types:[['hands','feet'][rand(2)]],goals:[['3','9'][rand(2)]]});});
  const rows=Array.from({length:14},(_,i)=>{const from=rand(36),to=(from+1+rand(35))%36;return ask('r'+from,'r'+to,'With',2+i);});
  rows.push(...rows.slice(0,4).map((q,i)=>({...q,row:16+i,email:q.classmateEmail,classmateEmail:q.email})));
  const big=protects(roster,[p('a'),p('b','Major',{goals:['9']}),p('c','Major',{types:['feet']}),p('m1','Minor'),p('m2','Minor',{goals:['9']}),p('m3','Minor',{types:['feet']}),p('m4','Minor',{types:['feet'],goals:['9']})],
    config({projectCount:7,minorProjects:4,minSize:2,targetSize:5,maxSize:8,minorMin:12,minorTarget:14,minorMax:16}),rows);
  assert.equal(big.summary.placed,36);
  assert.ok(big.friends.some(f=>f.why==='Moved to be together'));
});

test('"Not with" moves the student who wrote the request, and the classmate only when the writer is locked or leading',()=>{
  // A and B share a, and b is full after one more. A fits a best and b worst; B fits both the same,
  // so moving B would cost nothing and moving A costs five steps.
  const students=[s('A',{grade:10,choices:['a','z']}),s('B',{grade:12,choices:['a','b'],goals:[]}),s('f1',{choices:['b','z'],goals:['9']}),s('f2',{choices:['b','z'],goals:['9']})];
  const projects=[p('a'),p('b','Major',{goals:['9']})],cfg=config({maxSize:3,targetSize:2,useFriendRequests:true}),at=(r,id)=>r.assignments.find(a=>a.studentId===id);
  const plain=E.sort(students,projects,cfg,{});
  assert.equal(at(plain,'A').project1,'a'); assert.equal(at(plain,'B').project1,'a');
  const r=E.sort(students,projects,cfg,{},{friends:[ask('A','B','Not with')]});
  assert.equal(at(r,'A').project1,'b'); assert.equal(at(r,'B').project1,'a');
  assert.ok(at(r,'A').flags.includes('Moved to another group because of a "Not with" friend request. Fit dropped 5 steps.'));
  assert.ok(!at(r,'B').flags.some(f=>/^Moved/.test(f)));
  assert.deepEqual(r.friends.map(x=>[x.result,x.why]),[['Not together','Moved apart']]);
  // A is locked, so B moves, with a flag that doesn't name A.
  const locked=E.sort(students,projects,cfg,{},{locks:[{email:'A@example.org',name:'',project1:'a',project2:'',row:2}],friends:[ask('A','B','Not with')]});
  assert.equal(at(locked,'A').project1,'a'); assert.equal(at(locked,'B').project1,'b');
  assert.ok(at(locked,'B').flags.includes('Moved because a classmate asked not to work with them.'));
  assert.deepEqual(locked.friends.map(x=>[x.result,x.why]),[['Not together','Moved apart']]);
  // Both locked: reported as before.
  const both=E.sort(students,projects,cfg,{},{locks:[{email:'A@example.org',name:'',project1:'a',project2:'',row:2},{email:'B@example.org',name:'',project1:'a',project2:'',row:3}],friends:[ask('A','B','Not with')]});
  assert.deepEqual(both.friends.map(x=>[x.result,x.why]),[['Together','Locked in place by hand']]);
  assert.ok(both.checks.some(c=>c.code==='NOT_WITH_TOGETHER'));
});

test('with checkedBeforeInferred FALSE, a swap that would move a third student out of a project they checked is refused',()=>{
  // a and b hold two each. ann (a) asked for bea (b), and b is full, so only a swap with t can join
  // them. t checked b but shares neither its Type nor its UN goal, and didn't check a, which matches
  // both. With checkedBeforeInferred FALSE that is fit 5 in b and fit 4 in a: no worse a number, but
  // t would leave the project they checked. Under either setting a checked project can't share a fit
  // number with an unchecked one, so a better number is the case to test.
  const projects=[p('a'),p('b','Major',{types:['feet'],goals:['9']})];
  const students=[s('ann',{grade:12,choices:['a','b'],types:['hands','feet']}),s('u',{choices:['a','z']}),s('bea',{choices:['b','z'],types:['feet'],goals:['9']}),s('t',{choices:['b','z']})];
  const cfg=config({maxSize:2,targetSize:2,useFriendRequests:true,checkedBeforeInferred:false}),at=(r,id)=>r.assignments.find(a=>a.studentId===id);
  const plain=E.sort(students,projects,cfg,{});
  assert.deepEqual(['ann','u','bea','t'].map(id=>at(plain,id).project1),['a','a','b','b']);
  assert.equal(E.fit(students[3],projects[1],cfg).tier,5); assert.equal(E.fit(students[3],projects[0],cfg).tier,4);
  const r=E.sort(students,projects,cfg,{},{friends:[ask('ann','bea')]});
  assert.deepEqual(['ann','u','bea','t'].map(id=>at(r,id).project1),['a','a','b','b']);
  assert.ok(!at(r,'t').reason.includes('Swapped into this group'));
  assert.deepEqual(r.friends.map(x=>x.result),['Not together']);
});

// Why a student is in a project they didn't check: the end of the reason says so.
const missedRun=()=>({projects:[p('a','Major',{name:'Alpha'}),p('b','Major',{name:'Beta',types:['feet'],goals:['9']}),p('x','Major',{name:'Project X'}),p('y','Major',{name:'Project Y'})],cfg:config({maxSize:3,projectCount:2})});
const reasonOf=(r,id)=>r.assignments.find(a=>a.studentId===id).reason;
test('a student whose only pick isn\'t running is told so',()=>{
  const {projects,cfg}=missedRun(),off={x:{run:false},y:{run:false}};
  const r=E.sort([s('solo',{choices:['x']}),s('pair',{choices:['x','y']}),s('fan',{choices:['a','b']})],projects,cfg,off);
  assert.match(reasonOf(r,'solo'),/^Did not check this project;.*\. None of their picks are running: Project X\.$/);
  assert.match(reasonOf(r,'pair'),/ None of their picks are running: Project X, Project Y\.$/);
  assert.doesNotMatch(reasonOf(r,'fan'),/running|full|last year/);
});
test('a student whose pick was last year\'s project is told so',()=>{
  // Alpha, Beta and Project X run, and a student who checked each of Alpha and Beta keeps it running.
  const {projects}=missedRun(),cfg=config({maxSize:3,projectCount:3});
  const r=E.sort([s('repeat',{choices:['a','z'],previous:['a']}),s('twice',{choices:['a','b'],previous:['a','b'],types:['feet']}),s('fanA'),s('fanB',{choices:['b','z'],types:['feet'],goals:['9']})],projects,cfg,{y:{run:false}});
  assert.deepEqual(r.projects.map(x=>x.id).sort(),['a','b','x']);
  assert.notEqual(r.assignments.find(a=>a.studentId==='repeat').project1,'a');
  assert.match(reasonOf(r,'repeat'),/ Alpha was their project last year\.$/);
  assert.match(reasonOf(r,'twice'),/ Alpha and Beta were their projects last year\.$/);
});
test('a student whose picks were full is told so, and so is one who checked nothing',()=>{
  // One seat in each project, and both checked Alpha: the senior gets it.
  const {projects}=missedRun(),cfg=config({maxSize:1,targetSize:1,projectCount:2});
  const r=E.sort([s('senior',{grade:12}),s('soph',{grade:10})],projects,cfg,{x:{run:false},y:{run:false}});
  assert.equal(r.assignments.find(a=>a.studentId==='senior').project1,'a');
  assert.match(reasonOf(r,'soph'),/^Did not check this project;.*\. Their other picks were full\.$/);
  assert.doesNotMatch(reasonOf(r,'senior'),/full/);
  const none=E.sort([s('none',{choices:[]}),s('fan')],projects,config({maxSize:3,projectCount:2}),{x:{run:false},y:{run:false}});
  assert.match(reasonOf(none,'none'),/ They checked no projects\.$/);
});
test('for a Minor student the sentence goes with the week of the project they didn\'t check',()=>{
  // Three Minors with two places each: two students do Minor 3, which nobody checked, in one week.
  const projects=[p('m1','Minor'),p('m2','Minor'),p('m3','Minor',{types:['feet'],goals:['9']})],cfg=config({projectCount:3,minorProjects:3,minorMin:3,minorTarget:3,minorMax:3,maxSize:2,targetSize:2});
  const r=E.sort(['x','y','z'].map(id=>s(id,{preference:'Minor',choices:['m1','m2']})),projects,cfg,{});
  const inM3=r.assignments.filter(a=>a.project1==='m3'||a.project2==='m3');
  assert.equal(inM3.length,2);
  for(const a of inM3){
    const [one,two]=a.reason.split(' Week 2: '),missed=a.project1==='m3'?one:two,kept=a.project1==='m3'?two:one;
    assert.match(missed,/^(Week 1: )?Did not check this project;.*\. Their other picks were full\.$/);
    assert.doesNotMatch(kept,/full|running|last year/);
  }
});

test('a student listed as Nonbinary counts as neither Male nor Female, never moves for gender and is never called unknown; one with no Gender row has no gender on file',()=>{
  // In a, a0 and a1 are Female and a2 is listed as Nonbinary. In b, b7 has no gender on file, which
  // leaves b two Male students.
  const {students,projects,cfg}=genderRun(),mixed=students.map(x=>x.id==='a2'?{...x,gender:'Nonbinary'}:x.id==='b7'?{...x,gender:null}:x);
  const on=E.sort(mixed,projects,cfg,{}),off=E.sort(mixed,projects,{...cfg,balanceGender:false},{});
  assert.deepEqual(genderMessages(off),['a: 5 Male and 2 Female students (1 not listed as Male or Female). Gender balancing is turned off in Settings.','b: 2 Male and 5 Female students (1 with no gender on file). Gender balancing is turned off in Settings.']);
  assert.ok(on.assignments.some(a=>/balance the groups/.test(a.reason)));
  assert.equal(spot(on,'a2').project1,spot(off,'a2').project1); assert.doesNotMatch(spot(on,'a2').reason,/balance the groups/);
  assert.ok(on.checks.concat(off.checks).every(c=>!/unknown/i.test(c.message)));
});

test('a lock or a move by hand into last year\'s project is information with a flag; the sort putting a student there is still an error',()=>{
  const projects=[p('a'),p('b','Major',{goals:['9']})],cfg=config({maxSize:3});
  const students=[s('rep',{previous:['a']}),s('fan'),s('other',{choices:['b','z'],goals:['9']})];
  // Locked into a, last year's project.
  const r=E.sort(students,projects,cfg,{},{locks:[{email:'rep@example.org',name:'',project1:'a',project2:'',row:2}]}),rep=r.assignments.find(a=>a.studentId==='rep');
  assert.deepEqual([rep.project1,rep.locked],['a',true]);
  assert.ok(rep.flags.includes("In last year's project because of a lock."));
  const repeat=r.checks.filter(c=>c.code==='PREVIOUS_PROJECT');
  assert.deepEqual(repeat.map(c=>[c.severity,c.message,c.studentId]),[['info',"In last year's project because of a lock.",'rep']]);
  assert.deepEqual(errors(r),[]);
  // Moved there by hand, the way Check again sends it: information, and explain gives the flag.
  const placed=r.projects,row=extra=>({studentId:'rep',status:'placed',project1:'a',project2:null,fit1:E.fit(students[0],projects[0]).tier,fit2:null,...extra});
  const others=r.assignments.filter(a=>a.studentId!=='rep');
  let checks=E.check(students,placed,[row({movedByHand:true}),...others],cfg,{}).filter(c=>c.code==='PREVIOUS_PROJECT');
  assert.deepEqual(checks.map(c=>[c.severity,c.message]),[['info',"In last year's project because of a move by hand."]]);
  assert.ok(E.explain(students[0],['a'],placed,cfg,{},true,'hand').flags.includes("In last year's project because of a move by hand."));
  assert.ok(!E.explain(students[0],['b'],placed,cfg,{},true,'hand').flags.some(f=>/last year's project/.test(f)));
  // The sort itself never does this, but if an assignment says so, it is an error.
  checks=E.check(students,placed,[row({}),...others],cfg,{}).filter(c=>c.code==='PREVIOUS_PROJECT');
  assert.deepEqual(checks.map(c=>c.severity),['error']);
});

test('a reason names each UN goal and capitalizes types',()=>{
  assert.equal(E.fit(s('1'),p('a')).reason,'Checked this project; type match (Hands); UN goal match (Good Health and Well-Being).');
  const both=E.fit(s('1',{types:['head','hands'],goals:['9','16']}),p('a',undefined,{types:['hands','head'],goals:['16','9']}));
  assert.equal(both.reason,'Checked this project; type match (Head, Hands); UN goal match (Industry, Innovation and Infrastructure, Peace, Justice and Strong Institutions).');
  assert.equal(E.fit(s('1',{choices:[],types:['feet'],goals:['1']}),p('a')).reason,'Did not check this project; no type match; no UN goal match.');
  // The names come from the parser's list, so there is one list.
  assert.equal(require('../core/parser.js').goals[8],'Industry, Innovation and Infrastructure');
  // A Minor student's reason names the goals for each week.
  const r=E.sort([s('m',{preference:'Minor',choices:['m1','m2']})],[p('m1','Minor'),p('m2','Minor',{goals:['17']})],config({projectCount:2,minorProjects:2,minorMin:1,minorTarget:1,minorMax:1}),{});
  assert.match(r.assignments[0].reason,/^Week 1: Checked this project; type match \(Hands\); (UN goal match \(Good Health and Well-Being\)|no UN goal match)\. Week 2: /);
});
