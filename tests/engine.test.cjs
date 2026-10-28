const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../core/engine.js');
const p = (id,length='Major',extra={}) => ({id,name:id,length,types:['hands'],goals:['3'],aliases:[],enabled:true,...extra});
const s = (id,extra={}) => ({id,name:'Practice '+id,email:id+'@example.org',grade:11,preference:'Major',choices:['a'],types:['hands'],goals:['3'],previous:[],status:'eligible',gender:null,comments:'',source:{sheet:'Practice',row:1},issues:[],...extra});
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
